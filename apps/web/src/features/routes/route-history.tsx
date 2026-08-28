import { Chip, Divider, List, ListItem, ListItemText, Stack, Typography } from '@mui/material';
import type { RouteDetail } from './route-types.js';

function value(record: Record<string, unknown>, camel: string, snake: string): string {
  const raw = record[camel] ?? record[snake];
  if (raw == null) return '—';
  if (typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean')
    return String(raw);
  return JSON.stringify(raw);
}

export function RouteHistory({ detail }: { detail: RouteDetail }) {
  return (
    <Stack spacing={2} aria-label="Route history">
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        <Typography variant="h6">Route history</Typography>
        {detail.route.state === 'CLOSED' && <Chip label="Read only" color="default" />}
      </Stack>
      <Typography>
        Load: {detail.load?.state ?? 'Not recorded'} · Sales: {detail.sales.length} · Movements:{' '}
        {detail.movements.length}
      </Typography>
      <List dense>
        {detail.movements.map((movement) => (
          <ListItem key={value(movement, 'id', 'id')} divider>
            <ListItemText
              primary={`${value(movement, 'operationType', 'operation_type')} · ${value(
                movement,
                'quantity',
                'quantity',
              )}`}
              secondary={value(movement, 'occurredAt', 'occurred_at')}
            />
          </ListItem>
        ))}
      </List>
      {detail.reconciliation && (
        <>
          <Divider />
          <Typography variant="subtitle1">Approved reconciliation</Typography>
          {detail.reconciliation.lines.map((line) => (
            <Typography key={line.productId} variant="body2">
              {line.productId}: loaded {line.loadedQuantity}, sold {line.soldQuantity}, returned{' '}
              {line.physicalReturnQuantity}, difference {line.differenceQuantity}
              {line.differenceReason ? ` (${line.differenceReason})` : ''}
            </Typography>
          ))}
        </>
      )}
    </Stack>
  );
}
