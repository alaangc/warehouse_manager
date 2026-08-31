import type { FormEvent } from 'react';
import { useState } from 'react';
import type { SessionResponse } from '@warehouse/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Container,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useSession } from '../../app/session.js';
import { apiRequest } from '../../lib/api/client.js';
import { ApiProblem } from '../../lib/api/problem.js';

function requestedPath(state: unknown): string {
  if (
    typeof state === 'object' &&
    state !== null &&
    'from' in state &&
    typeof state.from === 'string' &&
    state.from.startsWith('/') &&
    !state.from.startsWith('//') &&
    state.from !== '/login'
  ) {
    return state.from;
  }
  return '/';
}

function loginErrorMessage(error: unknown, t: TFunction): string {
  if (error instanceof ApiProblem) {
    if (error.status === 401) return t('auth.incorrectCredentials');
    if (error.status === 429) return t('auth.tooManyAttempts');
    if (error.status >= 500) return t('auth.serverUnavailable');
  }
  return t('auth.signInFailed');
}

export function LoginPage() {
  const { t } = useTranslation();
  const session = useSession();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const login = useMutation({
    mutationFn: () =>
      apiRequest<SessionResponse>('/auth/login', {
        method: 'POST',
        body: { username, password },
      }),
    onSuccess: (response) => {
      queryClient.setQueryData(['session'], response);
      void navigate(requestedPath(location.state), { replace: true });
    },
  });

  if (session.loading) {
    return (
      <Box sx={{ display: 'grid', minHeight: '100vh', placeItems: 'center' }}>
        <CircularProgress aria-label={t('auth.checkingSession')} />
      </Box>
    );
  }

  if (session.user) return <Navigate to="/" replace />;

  const sessionCheckFailed =
    session.error &&
    !(session.error instanceof ApiProblem && session.error.isAuthenticationFailure);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    login.mutate();
  }

  return (
    <Box
      component="main"
      sx={{
        alignItems: 'center',
        bgcolor: 'grey.100',
        display: 'flex',
        minHeight: '100vh',
        py: 4,
      }}
    >
      <Container maxWidth="sm">
        <Card elevation={4}>
          <CardContent sx={{ p: { xs: 3, sm: 5 } }}>
            <Stack component="form" spacing={3} onSubmit={submit}>
              <Box>
                <Typography component="h1" variant="h4" gutterBottom>
                  {t('app.name')}
                </Typography>
                <Typography color="text.secondary">{t('auth.signInToContinue')}</Typography>
              </Box>

              {sessionCheckFailed && (
                <Alert severity="warning">{t('auth.sessionCheckFailed')}</Alert>
              )}
              {login.isError && <Alert severity="error">{loginErrorMessage(login.error, t)}</Alert>}

              <TextField
                autoComplete="username"
                autoFocus
                disabled={login.isPending}
                fullWidth
                label={t('auth.username')}
                name="username"
                onChange={(event) => {
                  setUsername(event.target.value);
                  if (login.isError) login.reset();
                }}
                required
                value={username}
              />
              <TextField
                autoComplete="current-password"
                disabled={login.isPending}
                fullWidth
                label={t('auth.password')}
                name="password"
                onChange={(event) => {
                  setPassword(event.target.value);
                  if (login.isError) login.reset();
                }}
                required
                type="password"
                value={password}
              />
              <Button disabled={login.isPending} size="large" type="submit" variant="contained">
                {login.isPending ? t('auth.signingIn') : t('auth.signIn')}
              </Button>
            </Stack>
          </CardContent>
        </Card>
      </Container>
    </Box>
  );
}
