import type { FormEvent } from 'react';
import { useState } from 'react';
import type { SessionResponse } from '@warehouse/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Container,
  IconButton,
  InputAdornment,
  Paper,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useSession } from '../../app/session.js';
import { changeAppLanguage, type AppLanguage } from '../../i18n/index.js';
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

function VisibilityIcon({ hidden }: { hidden: boolean }) {
  return (
    <Box
      component="svg"
      viewBox="0 0 24 24"
      aria-hidden="true"
      sx={{ fill: 'none', height: 20, stroke: 'currentColor', strokeWidth: 1.8, width: 20 }}
    >
      <path d="M2.5 12s3.4-6 9.5-6 9.5 6 9.5 6-3.4 6-9.5 6-9.5-6-9.5-6Z" />
      <circle cx="12" cy="12" r="2.7" />
      {hidden && <path d="m3.5 3.5 17 17" />}
    </Box>
  );
}

function BrandPanel() {
  const { t } = useTranslation();
  return (
    <Stack spacing={1} sx={{ alignItems: 'center', textAlign: 'center', pt: 4, pb: 3, px: 3 }}>
      <Box
        component="img"
        src="/stock-control-logo.png"
        alt=""
        sx={{ width: 76, height: 76, objectFit: 'contain', mb: 1 }}
      />
      <Typography component="h1" variant="h4">
        Stock Control
      </Typography>
      <Typography color="text.secondary" variant="body2">
        {t('auth.brandDescription')}
      </Typography>
    </Stack>
  );
}

export function LoginPage() {
  const { t, i18n } = useTranslation();
  const session = useSession();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const language: AppLanguage = i18n.resolvedLanguage?.startsWith('es') ? 'es' : 'en';
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
      <Box
        sx={{
          alignItems: 'center',
          bgcolor: '#eef4f9',
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
          justifyContent: 'center',
          minHeight: '100vh',
        }}
      >
        <Box
          component="img"
          src="/stock-control-logo.png"
          alt=""
          aria-hidden="true"
          sx={{ height: 58, objectFit: 'contain', width: 58 }}
        />
        <CircularProgress aria-label={t('auth.checkingSession')} size={30} />
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
        background: '#f5f6fa',
        display: 'flex',
        minHeight: '100vh',
        py: { xs: 0, sm: 4 },
      }}
    >
      <Container maxWidth="sm" sx={{ px: 2, py: 4 }}>
        <Paper
          elevation={0}
          sx={{
            border: '1px solid',
            borderColor: 'rgba(18, 62, 102, 0.12)',
            borderRadius: 4,
            display: 'grid',
            gridTemplateColumns: '1fr',
            minHeight: 0,
            overflow: 'hidden',
            width: '100%',
          }}
        >
          <BrandPanel />
          <Box
            sx={{
              alignItems: 'center',
              bgcolor: 'common.white',
              display: 'flex',
              justifyContent: 'center',
              px: { xs: 3, sm: 5 },
              pb: 4,
              pt: 7,
              position: 'relative',
            }}
          >
            <ToggleButtonGroup
              exclusive
              size="small"
              value={language}
              onChange={(_event, value: AppLanguage | null) => {
                if (value) void changeAppLanguage(value);
              }}
              aria-label={t('settings.language')}
              sx={{ position: 'absolute', right: { xs: 20, sm: 28 }, top: { xs: 18, sm: 24 } }}
            >
              <ToggleButton value="es" aria-label={t('settings.spanish')}>
                ES
              </ToggleButton>
              <ToggleButton value="en" aria-label={t('settings.english')}>
                EN
              </ToggleButton>
            </ToggleButtonGroup>

            <Stack
              component="form"
              spacing={3}
              onSubmit={submit}
              sx={{ maxWidth: 430, width: '100%' }}
            >
              <Box>
                <Typography
                  component="h2"
                  variant="h4"
                  sx={{ fontWeight: 750, letterSpacing: -0.5 }}
                >
                  {t('auth.welcomeBack')}
                </Typography>
                <Typography color="text.secondary" sx={{ mt: 1 }}>
                  {t('auth.signInToContinue')}
                </Typography>
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
                placeholder={t('auth.usernamePlaceholder')}
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
                placeholder={t('auth.passwordPlaceholder')}
                required
                slotProps={{
                  input: {
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton
                          aria-label={
                            showPassword ? t('auth.hidePassword') : t('auth.showPassword')
                          }
                          disabled={login.isPending}
                          edge="end"
                          onClick={() => setShowPassword((visible) => !visible)}
                        >
                          <VisibilityIcon hidden={showPassword} />
                        </IconButton>
                      </InputAdornment>
                    ),
                  },
                }}
                type={showPassword ? 'text' : 'password'}
                value={password}
              />
              <Button
                disabled={login.isPending}
                size="large"
                type="submit"
                variant="contained"
                sx={{ minHeight: 48, textTransform: 'none' }}
              >
                {login.isPending ? t('auth.signingIn') : t('auth.signIn')}
              </Button>
              <Typography color="text.secondary" sx={{ textAlign: 'center' }} variant="caption">
                {t('auth.securityNote')}
              </Typography>
            </Stack>
          </Box>
        </Paper>
      </Container>
    </Box>
  );
}
