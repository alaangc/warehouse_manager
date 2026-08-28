import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CustomerForm } from '../../src/features/customers/customer-form.js';
import type { Customer } from '../../src/features/customers/customer-types.js';

const customer: Customer = {
  id: crypto.randomUUID(),
  customerNumber: 'C-100',
  displayName: 'Test customer',
  city: 'Magdalena',
  active: true,
  version: 1,
};

describe('customer management', () => {
  it('requires a reason before an active customer can be archived', async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <CustomerForm customer={customer} onSaved={() => undefined} />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Archive customer' }));
    expect(await screen.findByText('An archive reason is required.')).toBeInTheDocument();
  });
});
