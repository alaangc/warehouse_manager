import { Alert, Autocomplete, Button, Stack, TextField } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { apiRequest } from '../../lib/api/client.js';
import { localizedErrorMessage } from '../../lib/api/localized-error.js';

type Option = { id: string; name: string; sku?: string; code?: string; active: boolean };
export function CatalogPicker({
  kind,
  label,
  value,
  onChange,
  required = false,
  error = false,
  helperText,
  includeArchived = false,
  excludeId,
}: {
  kind: 'products' | 'locations';
  label: string;
  value: string;
  onChange: (id: string) => void;
  required?: boolean;
  error?: boolean;
  helperText?: string;
  includeArchived?: boolean;
  excludeId?: string;
}) {
  const { t } = useTranslation();
  const query = useQuery({
    queryKey: ['catalog-options', kind],
    queryFn: async ({ signal }) => {
      const data: Option[] = [];
      let cursor: string | null = null;
      do {
        const page: { data: Option[]; page?: { nextCursor: string | null } } = await apiRequest(
          `/${kind}${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,
          { signal },
        );
        data.push(...page.data);
        cursor = page.page?.nextCursor ?? null;
      } while (cursor);
      return { data };
    },
  });
  const rows = query.data?.data ?? [];
  return (
    <Stack spacing={1} sx={{ minWidth: 240, flex: 1 }}>
      <Autocomplete
        options={rows.filter((row) => (includeArchived || row.active) && row.id !== excludeId)}
        value={rows.find((row) => row.id === value) ?? null}
        onChange={(_, row) => onChange(row?.id ?? '')}
        getOptionLabel={(row) => `${row.name} (${row.sku ?? row.code ?? row.id})`}
        isOptionEqualToValue={(a, b) => a.id === b.id}
        loading={query.isFetching}
        noOptionsText={t('catalog.noRecords')}
        renderInput={(params) => (
          <TextField
            {...params}
            label={label}
            required={required}
            error={error}
            helperText={helperText}
          />
        )}
      />
      {required && query.isSuccess && !rows.some(row => row.active) && <Alert severity="info" action={<Button href="/catalog">{t('workflow.openCatalog')}</Button>}>{t('workflow.emptyCatalog')}</Alert>}
      {query.error && <Alert severity="error">{localizedErrorMessage(query.error, t)}</Alert>}
    </Stack>
  );
}
