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
  const features = [
    t('auth.featureInventory'),
    t('auth.featureTraceability'),
    t('auth.featureAccess'),
  ];

  return (
    <Box
      sx={{
        background:
          'radial-gradient(circle at 15% 10%, rgba(82, 145, 255, 0.55), transparent 38%), linear-gradient(145deg, #123e66 0%, #0b2742 100%)',
        color: 'common.white',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        minHeight: { xs: 210, md: 640 },
        overflow: 'hidden',
        p: { xs: 3, sm: 4, md: 6 },
        position: 'relative',
      }}
    >
      <Box
        aria-hidden="true"
        sx={{
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '50%',
          height: 360,
          position: 'absolute',
          right: -170,
          top: -170,
          width: 360,
        }}
      />
      <Stack spacing={2.5} sx={{ position: 'relative' }}>
        <Box
          component="img"
          src="/stock-control-logo.png"
          alt=""
          aria-hidden="true"
          sx={{
            bgcolor: 'common.white',
            borderRadius: 3,
            boxShadow: '0 12px 30px rgba(0,0,0,0.2)',
            height: { xs: 58, md: 76 },
            objectFit: 'contain',
            p: 1,
            width: { xs: 58, md: 76 },
          }}
        />
        <Box>
          <Typography component="p" variant="overline" sx={{ color: '#a9d1ff' }}>
            {t('auth.secureAccess')}
          </Typography>
          <Typography
            component="h1"
            variant="h3"
            sx={{
              fontSize: { xs: '2rem', sm: '2.4rem', md: '3rem' },
              fontWeight: 750,
              letterSpacing: -1,
              lineHeight: 1.16,
            }}
          >
            {t('app.name')}
          </Typography>
          <Typography
            sx={{
              color: 'rgba(255,255,255,0.74)',
              fontSize: { xs: '0.92rem', md: '1rem' },
              mt: 1.5,
              maxWidth: 390,
            }}
          >
            {t('auth.brandDescription')}
          </Typography>
        </Box>
      </Stack>

      <Stack spacing={1.5} sx={{ display: { xs: 'none', md: 'flex' }, position: 'relative' }}>
        {features.map((feature) => (
          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }} key={feature}>
            <Box
              aria-hidden="true"
              sx={{
                alignItems: 'center',
                bgcolor: 'rgba(255,255,255,0.12)',
                borderRadius: '50%',
                display: 'flex',
                fontSize: 12,
                height: 26,
                justifyContent: 'center',
                width: 26,
              }}
            >
              ✓
            </Box>
            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.82)' }}>
              {feature}
            </Typography>
          </Stack>
        ))}
      </Stack>
    </Box>
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
        background:
          'radial-gradient(circle at 10% 10%, rgba(62, 127, 187, 0.12), transparent 32%), #eef4f9',
        display: 'flex',
        minHeight: '100vh',
        py: { xs: 0, sm: 4 },
      }}
    >
      <Container maxWidth="lg" disableGutters sx={{ px: { xs: 0, sm: 3 } }}>
        <Paper
          elevation={0}
          sx={{
            border: { sm: '1px solid', xs: 0 },
            borderColor: 'rgba(18, 62, 102, 0.12)',
            borderRadius: { xs: 0, sm: 4 },
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: 'minmax(360px, 0.9fr) minmax(460px, 1.1fr)' },
            minHeight: { xs: '100vh', sm: 640 },
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
              p: { xs: 3, sm: 5, md: 7 },
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
