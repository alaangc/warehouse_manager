import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
} from '@mui/material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiRequest } from '../../lib/api/client.js';
import { localizedErrorMessage } from '../../lib/api/localized-error.js';
import { idempotencyKey } from '../../lib/api/idempotency.js';

export function SaleCancellationDialog({
  saleId,
  open,
  onClose,
}: {
  saleId: string;
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');
  const operationId = useRef(crypto.randomUUID()).current;
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () =>
      apiRequest(`/sales/${encodeURIComponent(saleId)}/cancellation`, {
        method: 'POST',
        idempotencyKey: idempotencyKey(operationId),
        body: { reason },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['sales'] });
      onClose();
    },
  });
  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>{t('sales.cancelSale')}</DialogTitle>
      <DialogContent>
        {mutation.error && (
          <Alert severity="error">{localizedErrorMessage(mutation.error, t)}</Alert>
        )}
        <TextField
          autoFocus
          fullWidth
          multiline
          margin="dense"
          label={t('sales.requiredReason')}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('sales.keepSale')}</Button>
        <Button
          color="error"
          disabled={!reason.trim() || mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          {t('sales.cancelSale')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
