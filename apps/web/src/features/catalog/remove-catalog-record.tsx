import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Stack,
  TextField,
} from '@mui/material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiRequest } from '../../lib/api/client.js';
import { localizedErrorMessage } from '../../lib/api/localized-error.js';
import type { ProductRecord, SimpleCatalogKind, SimpleCatalogRecord } from './catalog-forms.js';

export function RemoveCatalogRecord({
  kind,
  record,
  onRemoved,
}: {
  kind: SimpleCatalogKind | 'products';
  record: ProductRecord | SimpleCatalogRecord;
  onRemoved: () => void;
}) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const remove = useMutation({
    mutationFn: () => {
      const { id, version, active, ...fields } = record;
      void active;
      return apiRequest(`/${kind}/${id}`, {
        method: 'PATCH',
        body: {
          ...fields,
          expectedVersion: version,
          active: false,
          reason: reason.trim(),
        },
      });
    },
    onSuccess: async () => {
      setOpen(false);
      onRemoved();
      await Promise.all([
        client.invalidateQueries({ queryKey: [kind] }),
        client.invalidateQueries({ queryKey: ['product', record.id] }),
        client.invalidateQueries({ queryKey: ['product-options'] }),
        client.invalidateQueries({ queryKey: ['route-resource-options', kind] }),
        client.invalidateQueries({ queryKey: ['catalog-options', kind] }),
        client.invalidateQueries({ queryKey: ['inventory-balances'] }),
      ]);
    },
  });
  return (
    <>
      <Button
        size="small"
        color="error"
        onClick={() => {
          remove.reset();
          setReason('');
          setOpen(true);
        }}
      >
        {t('catalog.deleteRecord')}
      </Button>
      <Dialog
        open={open}
        onClose={() => {
          if (!remove.isPending) setOpen(false);
        }}
        fullWidth
        maxWidth="xs"
      >
        <Stack
          component="form"
          onSubmit={(event) => {
            event.preventDefault();
            if (!remove.isPending && reason.trim()) remove.mutate();
          }}
        >
          <DialogTitle>{t('catalog.deleteTitle', { name: record.name })}</DialogTitle>
          <DialogContent>
            <DialogContentText sx={{ mb: 2 }}>{t('catalog.deleteHelp')}</DialogContentText>
            {remove.error && (
              <Alert severity="error">{localizedErrorMessage(remove.error, t)}</Alert>
            )}
            <TextField
              label={t('catalog.archiveReason')}
              required
              fullWidth
              value={reason}
              slotProps={{ htmlInput: { maxLength: 500, pattern: '.*\\S.*' } }}
              onChange={(event) => setReason(event.target.value)}
              disabled={remove.isPending}
            />
          </DialogContent>
          <DialogActions>
            <Button disabled={remove.isPending} onClick={() => setOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              color="error"
              variant="contained"
              type="submit"
              disabled={remove.isPending || !reason.trim()}
            >
              {t('catalog.deleteRecord')}
            </Button>
          </DialogActions>
        </Stack>
      </Dialog>
    </>
  );
}
