import { CssBaseline, ThemeProvider, createTheme } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode, type ReactNode } from 'react';
import { RouterProvider } from 'react-router-dom';
import { router } from './router.js';
import { SessionContext, useSessionBootstrap } from './session.js';

const theme = createTheme({
  palette: { primary: { main: '#174a72' }, secondary: { main: '#d97706' } },
});
const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
});

function SessionProvider({ children }: { children: ReactNode }) {
  return (
    <SessionContext.Provider value={useSessionBootstrap()}>{children}</SessionContext.Provider>
  );
}

export function AppProviders() {
  return (
    <StrictMode>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <QueryClientProvider client={queryClient}>
          <SessionProvider>
            <RouterProvider router={router} />
          </SessionProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </StrictMode>
  );
}
