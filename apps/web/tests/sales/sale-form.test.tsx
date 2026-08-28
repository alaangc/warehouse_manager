import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SaleForm } from '../../src/features/sales/sale-form.js';

describe('sale form', () => {
  it('keeps confirmation disabled until an authoritative available quote exists', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => undefined)),
    );
    render(
      <QueryClientProvider client={new QueryClient()}>
        <SaleForm />
      </QueryClientProvider>,
    );
    expect(screen.getByRole('button', { name: 'Confirm sale' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Quantity'), { target: { value: '1.25' } });
    expect(screen.getByDisplayValue('1.25')).toBeInTheDocument();
  });
});
