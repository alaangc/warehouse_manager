import { Alert, List, ListItem, ListItemText, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '../../lib/api/client.js';

interface SaleSummary {
  id: string;
  saleNumber: string;
  status: string;
  total: string;
  completedAt: string;
}

export function CustomerHistory({ customerId }: { customerId: string }) {
  const history = useQuery({
    queryKey: ['customers', customerId, 'sales'],
    queryFn: () => apiRequest<{ data: SaleSummary[] }>(`/customers/${customerId}/sales`),
  });
  return (
    <section aria-label="Customer purchase history">
      <Typography variant="h6">Purchase history</Typography>
      {history.error && <Alert severity="error">{history.error.message}</Alert>}
      <List dense>
        {history.data?.data.map((sale) => (
          <ListItem key={sale.id}>
            <ListItemText
              primary={`${sale.saleNumber} · ${sale.total}`}
              secondary={`${sale.status} · ${sale.completedAt}`}
            />
          </ListItem>
        ))}
      </List>
    </section>
  );
}
