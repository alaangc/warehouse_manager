import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import {
  DocumentListQuerySchema,
  DocumentResourceSchema,
  OutputAttemptListQuerySchema,
  OutputAttemptResourceSchema,
  type DocumentResource,
  type OutputAttemptResource,
} from '@warehouse/contracts';
import { ArrowLeft, ArrowRight, Eye, Filter, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { useSession } from '../../app/session.js';
import { formatDateTime } from '../../i18n/format.js';
import { apiRequest } from '../../lib/api/client.js';
import { documentError } from './document-api.js';
import { DocumentCenter } from './document-center.js';

type Collection = 'documents' | 'attempts';
type Row = DocumentResource | OutputAttemptResource;
type Page = { data: Row[]; page: { hasNextPage: boolean; nextCursor: string | null } };
function localDate(value: string): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}
const fields = {
  documents: ['documentType', 'state', 'sourceType', 'sourceId', 'from', 'to'],
  attempts: ['documentId', 'mode', 'state', 'from', 'to'],
} as const;

export function DocumentHistory({ collection = 'documents' }: { collection?: Collection }) {
  const { user } = useSession();
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  if (!user?.active) return <Alert severity="error">{t('documents.forbidden')}</Alert>;
  return (
    <History
      key={`${user.id}:${user.role}:${collection}:${params.toString()}`}
      collection={collection}
      actorId={user.id}
      administrator={user.role === 'ADMINISTRATOR'}
      params={params}
      onFilters={(filters) => setParams(filters)}
    />
  );
}
function History({
  collection,
  actorId,
  administrator,
  params,
  onFilters,
}: {
  collection: Collection;
  actorId: string;
  administrator: boolean;
  params: URLSearchParams;
  onFilters: (filters: URLSearchParams) => void;
}) {
  const { t } = useTranslation();
  const initial = Object.fromEntries(
    fields[collection].map((field) => [field, params.get(field) ?? '']),
  );
  const [form, setForm] = useState<Record<string, string>>({
    ...initial,
    from: localDate(initial.from ?? ''),
    to: localDate(initial.to ?? ''),
  });
  const [invalid, setInvalid] = useState(false);
  const [cursors, setCursors] = useState<Array<string | null>>([params.get('cursor')]);
  const [selected, setSelected] = useState<string | null>(null);
  const query = new URLSearchParams(Object.entries(initial).filter(([, value]) => value));
  const cursor = cursors.at(-1);
  if (cursor) query.set('cursor', cursor);
  const endpoint = collection === 'documents' ? '/documents' : '/output-attempts';
  const history = useQuery({
    queryKey: ['document-history', actorId, administrator, collection, query.toString()],
    queryFn: async ({ signal }) => {
      const response = await apiRequest<Page>(`${endpoint}?${query}`, { signal });
      const data =
        collection === 'documents'
          ? DocumentResourceSchema.array().parse(response.data)
          : OutputAttemptResourceSchema.array().parse(response.data);
      if (
        !response.page ||
        typeof response.page.hasNextPage !== 'boolean' ||
        (response.page.hasNextPage &&
          (typeof response.page.nextCursor !== 'string' || !response.page.nextCursor))
      )
        throw new Error('HISTORY_RESPONSE_INVALID');
      return { data, page: response.page };
    },
    retry: false,
  });
  const rows =
    history.isError || history.isFetching || invalid
      ? []
      : (history.data?.data ?? []).filter(
          (row) =>
            administrator ||
            ('documentType' in row
              ? ['TICKET', 'ROUTE_LOAD'].includes(row.documentType)
              : row.mode !== 'TEST_PRINT'),
        );
  const choices: Record<string, string[]> = {
    documentType: administrator
      ? ['TICKET', 'ROUTE_LOAD', 'CASH_CLOSE', 'REPORT']
      : ['TICKET', 'ROUTE_LOAD'],
    sourceType: administrator
      ? ['SALE', 'ROUTE_LOAD', 'CASH_CLOSE', 'REPORT_SNAPSHOT']
      : ['SALE', 'ROUTE_LOAD'],
    state:
      collection === 'documents'
        ? ['PENDING', 'READY', 'FAILED']
        : ['STARTED', 'SUCCEEDED', 'FAILED', 'UNKNOWN'],
    mode: [
      'GENERATE',
      'DOWNLOAD',
      'SHARE',
      'PRINT',
      'REPRINT',
      ...(administrator ? ['TEST_PRINT'] : []),
    ],
  };
  function apply() {
    const values = Object.fromEntries(Object.entries(form).filter(([, value]) => value));
    for (const field of ['from', 'to']) {
      if (values[field]) {
        const date = new Date(values[field]);
        if (Number.isNaN(date.getTime())) {
          setInvalid(true);
          return;
        }
        values[field] = date.toISOString();
      }
    }
    if (
      !(
        collection === 'documents' ? DocumentListQuerySchema : OutputAttemptListQuerySchema
      ).safeParse(values).success ||
      (values.from && values.to && values.from >= values.to)
    ) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    setCursors([null]);
    setSelected(null);
    onFilters(new URLSearchParams(values));
  }
  return (
    <Stack spacing={2} sx={{ minWidth: 0 }}>
      <Box
        component="form"
        onSubmit={(event) => {
          event.preventDefault();
          apply();
        }}
        sx={{
          display: 'grid',
          gridTemplateColumns: {
            xs: 'minmax(0, 1fr)',
            sm: 'repeat(2, minmax(0, 1fr))',
            md: 'repeat(3, minmax(0, 1fr))',
          },
          gap: 2,
        }}
      >
        {fields[collection].map((field) => (
          <TextField
            key={field}
            size="small"
            label={t(`documents.${field}`)}
            value={form[field] ?? ''}
            select={Boolean(choices[field])}
            type={field === 'from' || field === 'to' ? 'datetime-local' : 'text'}
            slotProps={{
              select: { native: true },
              htmlInput: { maxLength: 200 },
              inputLabel: { shrink: true },
            }}
            onChange={(event) => setForm({ ...form, [field]: event.target.value })}
          >
            {choices[field] && [
              <option key="all" value="">
                {t('documents.all')}
              </option>,
              ...choices[field].map((choice) => (
                <option key={choice} value={choice}>
                  {t(`documents.${choice}`)}
                </option>
              )),
            ]}
          </TextField>
        ))}
        <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
          <Button type="submit" startIcon={<Filter size={18} />}>
            {t('documents.apply')}
          </Button>
          <Button
            startIcon={<RotateCcw size={18} />}
            onClick={() => {
              setForm(Object.fromEntries(fields[collection].map((field) => [field, ''])));
              setInvalid(false);
              setCursors([null]);
              setSelected(null);
              onFilters(new URLSearchParams());
            }}
          >
            {t('documents.reset')}
          </Button>
        </Stack>
      </Box>
      {invalid && <Alert severity="error">{t('documents.invalid')}</Alert>}
      {history.isFetching && <CircularProgress size={24} aria-label={t('documents.loading')} />}
      {history.isError && (
        <Alert
          severity="error"
          action={<Button onClick={() => void history.refetch()}>{t('documents.retry')}</Button>}
        >
          {documentError(history.error, t)}
        </Alert>
      )}
      {!history.isFetching && !history.isError && !invalid && (
        <>
          {rows.length === 0 ? (
            <Typography>
              {t(
                collection === 'documents' ? 'documents.emptyDocuments' : 'documents.emptyAttempts',
              )}
            </Typography>
          ) : (
            <TableContainer sx={{ maxWidth: '100%' }}>
              <Table
                size="small"
                aria-label={t(
                  collection === 'documents' ? 'documents.title' : 'documents.attempts',
                )}
                sx={{ tableLayout: 'fixed', minWidth: 640 }}
              >
                <TableHead>
                  <TableRow>
                    {[
                      'createdAt',
                      collection === 'documents' ? 'documentType' : 'mode',
                      'state',
                      'id',
                      collection === 'documents' ? 'sourceId' : 'documentId',
                    ].map((field) => (
                      <TableCell key={field}>{t(`documents.${field}`)}</TableCell>
                    ))}
                    <TableCell />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>{formatDateTime(row.createdAt)}</TableCell>
                      <TableCell>
                        {t(`documents.${'documentType' in row ? row.documentType : row.mode}`)}
                      </TableCell>
                      <TableCell>{t(`documents.${row.state}`)}</TableCell>
                      <TableCell sx={{ overflowWrap: 'anywhere' }}>{row.id}</TableCell>
                      <TableCell sx={{ overflowWrap: 'anywhere' }}>
                        {'sourceId' in row ? row.sourceId : (row.documentId ?? '-')}
                      </TableCell>
                      <TableCell>
                        <Button startIcon={<Eye size={18} />} onClick={() => setSelected(row.id)}>
                          {t(
                            collection === 'documents'
                              ? 'documents.viewDocument'
                              : 'documents.viewAttempt',
                          )}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </>
      )}
      {!history.isLoading && (
        <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
          <Button
            startIcon={<RotateCcw size={18} />}
            disabled={history.isFetching}
            onClick={() => {
              setCursors([null]);
              if (cursor === null || cursor === undefined) void history.refetch();
            }}
          >
            {t('documents.first')}
          </Button>
          <Button
            startIcon={<ArrowLeft size={18} />}
            disabled={cursors.length < 2 || history.isFetching}
            onClick={() => setCursors((old) => old.slice(0, -1))}
          >
            {t('documents.previous')}
          </Button>
          <Button
            endIcon={<ArrowRight size={18} />}
            disabled={
              history.isFetching || history.isError || invalid || !history.data?.page.hasNextPage
            }
            onClick={() => setCursors((old) => [...old, history.data!.page.nextCursor])}
          >
            {t('documents.next')}
          </Button>
        </Stack>
      )}
      {selected && (
        <Dialog open fullWidth maxWidth="md" onClose={() => setSelected(null)}>
          <DialogTitle>
            {t(collection === 'documents' ? 'documents.viewDocument' : 'documents.viewAttempt')}
          </DialogTitle>
          <DialogContent>
            {collection === 'documents' ? (
              <DocumentCenter documentId={selected} />
            ) : (
              <AttemptDetail
                key={selected}
                id={selected}
                actorId={actorId}
                administrator={administrator}
              />
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setSelected(null)}>{t('documents.close')}</Button>
          </DialogActions>
        </Dialog>
      )}
    </Stack>
  );
}
function AttemptDetail({
  id,
  actorId,
  administrator,
}: {
  id: string;
  actorId: string;
  administrator: boolean;
}) {
  const { t } = useTranslation();
  const detail = useQuery({
    queryKey: ['output-attempt', actorId, administrator, id],
    queryFn: async ({ signal }) => {
      const response = await apiRequest<{ data: unknown }>(
        `/output-attempts/${encodeURIComponent(id)}`,
        { signal },
      );
      return OutputAttemptResourceSchema.parse(response.data);
    },
    retry: false,
  });
  if (detail.isFetching) return <CircularProgress size={24} aria-label={t('documents.loading')} />;
  if (detail.error)
    return (
      <Alert
        severity="error"
        action={<Button onClick={() => void detail.refetch()}>{t('documents.retry')}</Button>}
      >
        {documentError(detail.error, t)}
      </Alert>
    );
  const row = detail.data;
  if (!row) return null;
  if (!administrator && row.mode === 'TEST_PRINT')
    return <Alert severity="error">{t('documents.forbidden')}</Alert>;
  return (
    <Stack component="dl" spacing={1} sx={{ m: 0, overflowWrap: 'anywhere' }}>
      {Object.entries(row).map(([field, value]) => (
        <Box key={field}>
          <Typography component="dt" variant="caption" color="text.secondary">
            {t(`documents.${field}`)}
          </Typography>
          <Typography component="dd" sx={{ m: 0 }}>
            {value === null
              ? '-'
              : field === 'mode' || field === 'state'
                ? t(`documents.${String(value)}`)
                : field === 'createdAt'
                  ? formatDateTime(String(value))
                  : String(value)}
          </Typography>
        </Box>
      ))}
    </Stack>
  );
}
