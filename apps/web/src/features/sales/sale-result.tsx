import { Alert, Stack, Typography } from '@mui/material';

function text(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}

export function SaleResult({ sale }: { sale: Record<string, unknown> }) {
  return (
    <Stack spacing={2}>
      <Alert severity="success">Sale committed successfully.</Alert>
      <Typography variant="h4">Sale ticket</Typography>
      <Typography>Sale: {text(sale.saleNumber ?? sale.id)}</Typography>
      <Typography>Ticket: {text(sale.ticketNumber)}</Typography>
      <Typography>
        Total: {text(sale.currencyCode)} {text(sale.total)}
      </Typography>
    </Stack>
  );
}
