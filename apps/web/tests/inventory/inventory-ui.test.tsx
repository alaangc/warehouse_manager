import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { InventoryOperationForm } from '../../src/features/inventory/inventory-operation-form.js';

describe('inventory operation UI', () => {
  it('shows a validation error for a quantity with too many decimals', async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <InventoryOperationForm />
      </QueryClientProvider>,
    );
    fireEvent.change(screen.getByLabelText('Quantity'), { target: { value: '1.2345' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm operation' }));
    expect(await screen.findByText(/up to 3 decimals/i)).toBeInTheDocument();
  });
});
