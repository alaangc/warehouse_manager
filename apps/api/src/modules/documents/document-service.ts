import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, realpath, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import type { AppDatabase } from '../../db/database.js';
import { HttpProblem } from '../../http/problem-handler.js';
import { ScopedCursor, type HistoryPrincipal } from '../../shared/pagination/scoped-cursor.js';
import {
  DocumentRepository,
  type DocumentRow,
  type LoadedDocumentSource,
} from './document-repository.js';
import { OutputAttemptRepository } from './output-attempt-repository.js';
import {
  documentPdfFilename,
  renderDocumentPdf,
  type RenderedDocumentPdf,
} from './pdf-renderers.js';

const sourceSchema = z
  .object({
    documentType: z.enum(['TICKET', 'ROUTE_LOAD', 'CASH_CLOSE', 'REPORT']),
    sourceType: z.enum(['SALE', 'ROUTE_LOAD', 'CASH_CLOSE', 'REPORT_SNAPSHOT']),
    sourceId: z.uuid().transform((id) => id.toLowerCase()),
  })
  .strict();
const idSchema = z.uuid();
const requestIdSchema = z.string().min(1).max(200);
type ServiceOptions = { render?: typeof renderDocumentPdf };

export class DocumentService {
  private readonly documents: DocumentRepository;
  private readonly root: string;
  private readonly render: typeof renderDocumentPdf;

  constructor(
    private readonly database: AppDatabase,
    private readonly cursors: ScopedCursor,
    storagePath: string,
    options: ServiceOptions = {},
  ) {
    if (database.isTransaction) {
      throw new Error('Document generation requires a database outside the source transaction');
    }
    this.documents = new DocumentRepository(database, cursors);
    this.root = path.resolve(storagePath);
    this.render = options.render ?? renderDocumentPdf;
  }

  async request(
    principal: HistoryPrincipal,
    raw: unknown,
    requestId: string,
  ): Promise<DocumentRow> {
    const source = sourceSchema.parse(raw);
    requestIdSchema.parse(requestId);
    // Authorization and confirmed-source checks precede canonical reuse and every side effect.
    const loaded = await this.documents.loadSource(principal, source);
    const snapshot = { ...loaded, contentVersion: `${loaded.contentVersion}:pdf-v1` };
    const document = await this.documents.createOrReuse(
      principal,
      source,
      snapshot.contentVersion,
      '',
    );
    return this.generate(principal, document.id, snapshot, requestId);
  }

  async status(principal: HistoryPrincipal, id: string): Promise<DocumentRow> {
    return this.documents.detail(idSchema.parse(id), principal);
  }

  /** Download and Web Share use the same authorized canonical bytes. */
  async content(principal: HistoryPrincipal, id: string): Promise<RenderedDocumentPdf> {
    const document = await this.status(principal, id);
    if (document.state !== 'READY') {
      throw new HttpProblem(409, 'DOCUMENT_NOT_READY', 'Document is not ready');
    }
    try {
      const bytes = await this.readCanonical(document);
      return {
        bytes,
        filename: documentPdfFilename({
          documentType: document.document_type,
          sourceId: document.source_id,
          contentVersion: document.content_version,
        }),
        contentType: 'application/pdf',
        contentHash: document.content_hash,
      };
    } catch {
      throw new HttpProblem(
        409,
        'DOCUMENT_CONTENT_UNAVAILABLE',
        'Document content requires regeneration',
      );
    }
  }

  private async generate(
    principal: HistoryPrincipal,
    id: string,
    source: LoadedDocumentSource,
    requestId: string,
  ): Promise<DocumentRow> {
    // A database lock coordinates processes as well as requests. PENDING is committed
    // before this transaction, so a crashed worker can be recovered by the next request.
    return this.database.transaction().execute(async (transaction) => {
      const document = await transaction
        .selectFrom('document_output')
        .selectAll()
        .where('id', '=', id)
        .forUpdate()
        .executeTakeFirstOrThrow();
      await new DocumentRepository(transaction, this.cursors).detail(id, principal);
      if (document.state === 'READY') {
        try {
          await this.readCanonical(document);
          return document;
        } catch {
          // Missing or corrupt storage is repaired only on an explicit request.
        }
      }
      let result: RenderedDocumentPdf | undefined;
      let storageKey: string | null = null;
      let errorCode: string | undefined;
      try {
        result = await this.render(source);
      } catch {
        errorCode = 'DOCUMENT_GENERATION_FAILED';
      }
      if (result) {
        try {
          storageKey = await this.storeCanonical(id, result);
        } catch {
          errorCode = 'DOCUMENT_STORAGE_FAILED';
        }
      }
      const updated = await transaction
        .updateTable('document_output')
        .set({
          state: errorCode ? 'FAILED' : 'READY',
          content_hash: result?.contentHash ?? document.content_hash,
          storage_key: storageKey,
          ready_at: errorCode ? null : new Date(),
          last_error_code: errorCode ?? null,
        })
        .where('id', '=', id)
        .returningAll()
        .executeTakeFirstOrThrow();
      const last = await transaction
        .selectFrom('output_attempt')
        .select('attempt_number')
        .where('document_output_id', '=', id)
        .orderBy('attempt_number', 'desc')
        .executeTakeFirst();
      await new OutputAttemptRepository(transaction, this.cursors).append(principal, {
        documentId: id,
        mode: 'GENERATE',
        state: errorCode ? 'FAILED' : 'SUCCEEDED',
        attemptNumber: (last?.attempt_number ?? 0) + 1,
        requestId,
        ...(errorCode ? { errorCode } : {}),
      });
      return updated;
    });
  }

  private key(id: string, hash: string): string {
    idSchema.parse(id);
    if (!/^[a-f0-9]{64}$/.test(hash)) throw new Error('Invalid document hash');
    return `${id}/${hash}.pdf`;
  }

  private async readCanonical(document: DocumentRow): Promise<Buffer> {
    const expected = this.key(document.id, document.content_hash);
    if (document.storage_key !== expected) throw new Error('Invalid document storage key');
    const root = await realpath(this.root);
    const file = await realpath(path.join(root, expected));
    if (!file.startsWith(root + path.sep)) throw new Error('Invalid document storage path');
    const bytes = await readFile(file);
    if (createHash('sha256').update(bytes).digest('hex') !== document.content_hash) {
      throw new Error('Document content hash mismatch');
    }
    return bytes;
  }

  private async storeCanonical(id: string, result: RenderedDocumentPdf): Promise<string> {
    const key = this.key(id, result.contentHash);
    if (createHash('sha256').update(result.bytes).digest('hex') !== result.contentHash) {
      throw new Error('Document content hash mismatch');
    }
    await mkdir(this.root, { recursive: true });
    const root = await realpath(this.root);
    const directory = path.join(root, id);
    await mkdir(directory, { recursive: true });
    if ((await realpath(directory)) !== directory)
      throw new Error('Invalid document storage directory');
    const target = path.join(root, key);
    const temporary = path.join(directory, `${randomUUID()}.tmp`);
    try {
      await writeFile(temporary, result.bytes, { flag: 'wx', mode: 0o600 });
      await rename(temporary, target);
    } finally {
      await unlink(temporary).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== 'ENOENT') throw error;
      });
    }
    return key;
  }
}
