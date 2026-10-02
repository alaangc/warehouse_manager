import { Paper, Stack, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { DocumentCenter } from '../documents/document-center.js';
import type { RouteDetail } from './route-types.js';

export function ReturnReceipt({ detail }: { detail: RouteDetail }) {
  const { t } = useTranslation();
  const declaration = detail.returnDeclaration;
  const approved = detail.reconciliation;
  const id = approved?.id ?? declaration?.id;
  if (!id) return null;
  const lines =
    approved?.lines.map((line) => ({
      ...line,
      quantity: line.physicalReturnQuantity,
      productName:
        declaration?.lines.find((row) => row.productId === line.productId)?.productName ??
        detail.balances.find((row) => row.productId === line.productId)?.productName ??
        line.productId,
    })) ?? declaration!.lines;
  return (
    <Paper
      component="section"
      aria-label={t('routes.returnReceipt')}
      variant="outlined"
      sx={{ p: 2.5 }}
    >
      <Stack spacing={2}>
        <Typography variant="h6">{t('routes.returnReceipt')}</Typography>
        <Typography color="text.secondary">
          {t(approved ? 'routes.returnApproved' : 'routes.returnDeclared')}
        </Typography>
        {lines.map((line) => (
          <Stack key={line.productId}>
            <Typography>
              {line.productName}: {line.quantity}
            </Typography>
            {line.differenceReason && (
              <Typography color="text.secondary">
                {t('routes.differenceReason')}: {line.differenceReason}
              </Typography>
            )}
          </Stack>
        ))}
        <DocumentCenter
          key={id}
          source={{
            documentType: 'ROUTE_RETURN',
            sourceType: 'ROUTE_RETURN',
            sourceId: id,
            sourceState: 'READY',
            driverId: detail.route.driverId,
          }}
        />
      </Stack>
    </Paper>
  );
}
