import { Alert, Autocomplete, Stack, TextField } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiRequest } from '../../lib/api/client.js';
import { localizedErrorMessage } from '../../lib/api/localized-error.js';

type Option = {
  id: string;
  name?: string;
  displayName?: string;
  code?: string;
  role?: string;
  active?: boolean;
};

export function RouteResourcePicker({
  kind,
  label,
  value,
  onChange,
}: {
  kind: 'locations' | 'vehicles' | 'users';
  label: string;
  value: string;
  onChange: (id: string) => void;
}) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [selection, setSelection] = useState<Option | null>(null);
  const options = useQuery({
    queryKey: ['route-resource-options', kind, search],
    queryFn: ({ signal }) =>
      apiRequest<{ data: Option[] }>(
        `/${kind}?active=true&search=${encodeURIComponent(search)}${kind === 'users' ? '&limit=100' : ''}`,
        { signal },
      ),
  });
  const rows = (options.data?.data ?? []).filter(
    (option) => option.active !== false && (kind !== 'users' || option.role === 'DRIVER'),
  );
  return (
    <Stack spacing={1} sx={{ flex: 1, minWidth: 0 }}>
      <Autocomplete
        options={rows}
        value={value ? (rows.find((option) => option.id === value) ?? selection) : null}
        loading={options.isFetching}
        filterOptions={(items) => items}
        isOptionEqualToValue={(a, b) => a.id === b.id}
        getOptionLabel={(option) =>
          `${option.displayName ?? option.name ?? ''}${option.code ? ` (${option.code})` : ''}`
        }
        onInputChange={(_event, input, reason) => {
          if (reason === 'input' || reason === 'clear') setSearch(input);
        }}
        onChange={(_event, option) => {
          setSelection(option);
          onChange(option?.id ?? '');
        }}
        renderInput={(params) => <TextField {...params} label={label} required />}
      />
      {options.error && <Alert severity="error">{localizedErrorMessage(options.error, t)}</Alert>}
    </Stack>
  );
}
