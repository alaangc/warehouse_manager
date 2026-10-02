import {
  OutputAttemptRequestSchema,
  OutputAttemptResourceSchema,
  type OutputAttemptRequest,
} from '@warehouse/contracts';
import { useEffect, useRef, useState } from 'react';
import { apiRequest } from '../../lib/api/client.js';
import { ApiProblem } from '../../lib/api/problem.js';
import { PrinterError, type TestResult } from './printer-adapter.js';

type Job = {
  body: OutputAttemptRequest;
  startKey: string;
  finishKey: string;
  outcome: TestResult | null;
};
const locks = new Set<string>();
function read(key: string): Job | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const value = JSON.parse(raw) as Job;
    OutputAttemptRequestSchema.parse(value.body);
    if (
      value.body.state !== 'STARTED' ||
      typeof value.startKey !== 'string' ||
      typeof value.finishKey !== 'string' ||
      (value.outcome && !['SUCCEEDED', 'FAILED', 'UNKNOWN'].includes(value.outcome.state))
    )
      throw new Error('Invalid journal');
    return value;
  } catch {
    throw new PrinterError('JOURNAL_UNAVAILABLE');
  }
}
function write(key: string, value: Job | null) {
  try {
    if (value) localStorage.setItem(key, JSON.stringify(value));
    else localStorage.removeItem(key);
  } catch {
    throw new PrinterError('JOURNAL_UNAVAILABLE');
  }
}
async function record(actorId: string, body: OutputAttemptRequest, key: string) {
  const response = await apiRequest<{ data: unknown }>('/output-attempts', {
    method: 'POST',
    body,
    idempotencyKey: key,
  });
  const parsed = OutputAttemptResourceSchema.safeParse(response.data);
  if (
    !parsed.success ||
    parsed.data.actorId !== actorId ||
    parsed.data.state !== body.state ||
    parsed.data.mode !== body.mode ||
    parsed.data.documentId !== ('documentId' in body ? body.documentId : null) ||
    parsed.data.printerProfileId !== ('printerProfileId' in body ? body.printerProfileId : null)
  )
    throw new PrinterError('ACCEPTANCE_INVALID');
}
export function usePrintJob(actorId: string, scope: string) {
  const key = `warehouse-print-job:${actorId}:${scope}`;
  const mounted = useRef(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState(() => {
    try {
      return Boolean(read(key));
    } catch {
      return true;
    }
  });
  const [result, setResult] = useState<TestResult | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  async function finish(job: Job) {
    await record(actorId, { ...job.body, ...job.outcome! }, job.finishKey);
    write(key, null);
    if (mounted.current) setPending(false);
  }
  async function run(
    body: OutputAttemptRequest,
    device: () => Promise<TestResult>,
  ): Promise<TestResult | null> {
    if (locks.has(key)) return null;
    locks.add(key);
    setBusy(true);
    setError(null);
    try {
      if (read(key)) throw new PrinterError('RESULT_PENDING');
      const job: Job = {
        body: OutputAttemptRequestSchema.parse(body),
        startKey: crypto.randomUUID(),
        finishKey: crypto.randomUUID(),
        outcome: null,
      };
      write(key, job);
      setPending(true);
      try {
        await record(actorId, job.body, job.startKey);
      } catch (failure) {
        if (failure instanceof ApiProblem && [401, 403, 409, 422].includes(failure.status)) {
          write(key, null);
          if (mounted.current) setPending(false);
        }
        throw failure;
      }
      if (!mounted.current) return null;
      // Persist uncertainty before entering device code, so reload never sends bytes again.
      job.outcome = { state: 'UNKNOWN', errorCode: 'WRITE_UNCERTAIN' };
      write(key, job);
      try {
        const outcome = await device();
        if (['SUCCEEDED', 'FAILED', 'UNKNOWN'].includes(outcome.state))
          job.outcome = {
            state: outcome.state,
            ...(outcome.errorCode && /^[A-Z][A-Z0-9_]{0,99}$/.test(outcome.errorCode)
              ? { errorCode: outcome.errorCode }
              : {}),
          };
      } catch {
        /* A thrown adapter may already have written bytes. Keep UNKNOWN. */
      }
      write(key, job);
      if (!mounted.current) return null;
      setResult(job.outcome);
      await finish(job);
      return job.outcome;
    } catch (failure) {
      if (mounted.current) setError(failure);
      return null;
    } finally {
      locks.delete(key);
      if (mounted.current) setBusy(false);
    }
  }
  async function recover() {
    if (locks.has(key)) return;
    locks.add(key);
    setBusy(true);
    setError(null);
    try {
      const job = read(key);
      if (!job) {
        setPending(false);
        return;
      }
      // Replay only ledger writes with their original keys. Never call the adapter.
      await record(actorId, job.body, job.startKey);
      if (!mounted.current) return;
      job.outcome ??= { state: 'UNKNOWN', errorCode: 'WRITE_UNCERTAIN' };
      write(key, job);
      setResult(job.outcome);
      await finish(job);
    } catch (failure) {
      if (mounted.current) setError(failure);
    } finally {
      locks.delete(key);
      if (mounted.current) setBusy(false);
    }
  }
  return { busy, error, pending, result, run, recover };
}
