import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it } from 'vitest';
import { ProductForm } from '../../src/features/catalog/catalog-forms.js';
import { SettingsPage } from '../../src/features/settings/settings-page.js';
import { changeAppLanguage, LANGUAGE_STORAGE_KEY } from '../../src/i18n/index.js';

afterEach(async () => {
  window.localStorage.removeItem(LANGUAGE_STORAGE_KEY);
  await changeAppLanguage('en');
});

describe('language settings', () => {
  it('changes the interface immediately and persists the selection', async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <SettingsPage />
        <ProductForm />
      </QueryClientProvider>,
    );

    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Unchanged product' } });
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Language' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Spanish' }));

    expect(await screen.findByRole('heading', { name: 'Configuración' })).toBeInTheDocument();
    await waitFor(() => {
      expect(window.localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('es');
      expect(document.documentElement.lang).toBe('es');
    });
    expect(screen.getByRole('combobox', { name: 'Idioma' })).toHaveTextContent('Español');
    expect(screen.getByLabelText('Nombre')).toBeInTheDocument();
    expect(screen.getByLabelText('Nombre')).toHaveValue('Unchanged product');
    expect(screen.getByRole('button', { name: 'Guardar producto' })).toBeInTheDocument();
  });
});
