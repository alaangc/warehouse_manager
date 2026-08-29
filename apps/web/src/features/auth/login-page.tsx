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

function loginErrorMessage(error: unknown): string {
  if (error instanceof ApiProblem) {
    if (error.status === 401) return 'Incorrect username or password.';
    if (error.status === 429) return 'Too many sign-in attempts. Please wait and try again.';
    if (error.status >= 500) return 'The server is unavailable. Please try again.';
  }
  return 'Sign-in failed. Please try again.';
}

export function LoginPage() {
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
        <CircularProgress aria-label="Checking session" />
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
                  Warehouse Manager
                </Typography>
                <Typography color="text.secondary">Sign in to continue.</Typography>
              </Box>

              {sessionCheckFailed && (
                <Alert severity="warning">
                  Your existing session could not be checked. You can try signing in again.
                </Alert>
              )}
              {login.isError && <Alert severity="error">{loginErrorMessage(login.error)}</Alert>}

              <TextField
                autoComplete="username"
                autoFocus
                disabled={login.isPending}
                fullWidth
                label="Username"
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
                label="Password"
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
                {login.isPending ? 'Signing in…' : 'Sign in'}
              </Button>
            </Stack>
          </CardContent>
        </Card>
      </Container>
    </Box>
  );
}
