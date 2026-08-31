import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AppProviders } from './app/providers.js';
import './i18n/index.js';

const root = document.querySelector<HTMLDivElement>('#root');
if (!root) throw new Error('Application root is missing');

createRoot(root).render(
  <StrictMode>
    <AppProviders />
  </StrictMode>,
);
