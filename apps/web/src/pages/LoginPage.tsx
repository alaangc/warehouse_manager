import { FormEvent, useRef, useState } from 'react'
import { ArrowRight, Eye, EyeOff, KeyRound, LoaderCircle, LockKeyhole, UserRound } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { createTemporarySession } from '../services/temporary-auth'

type FormErrors = { username?: string; password?: string }
type SubmissionState = 'idle' | 'submitting' | 'error'

function BrandMark() {
  return <img className="brand-mark" src="/stock-control-logo.png" alt="" aria-hidden="true" />
}

function supportsPasskeys() {
  return typeof window !== 'undefined' && 'PublicKeyCredential' in window && window.isSecureContext
}

function LoadingLabel({ children }: { children: string }) {
  return <><span className="spinner" aria-hidden="true"><LoaderCircle size={18} /></span>{children}</>
}

export function LoginPage() {
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<FormErrors>({})
  const [submissionState, setSubmissionState] = useState<SubmissionState>('idle')
  const [showPassword, setShowPassword] = useState(false)
  const [passkeyAvailable] = useState(supportsPasskeys)
  const [passkeyMessage, setPasskeyMessage] = useState('')
  const usernameRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submissionState === 'submitting') return
    const remember = new FormData(event.currentTarget).get('remember') === 'on'
    const nextErrors: FormErrors = {}
    if (!username.trim()) nextErrors.username = 'Ingresa tu usuario.'
    if (!password) nextErrors.password = 'Ingresa tu contraseña.'
    setErrors(nextErrors)
    setSubmissionState('idle')
    if (nextErrors.username) return void usernameRef.current?.focus()
    if (nextErrors.password) return void passwordRef.current?.focus()

    setSubmissionState('submitting')
    await new Promise((resolve) => window.setTimeout(resolve, 650))
    if (username.trim() === 'admin' && password === 'admin') {
      createTemporarySession(remember)
      navigate('/inicio', { replace: true })
      return
    }
    setSubmissionState('error')
  }

  const isSubmitting = submissionState === 'submitting'

  return (
    <main className="login-page">
      <section className="login-shell" aria-labelledby="login-title">
        <header className="brand">
          <BrandMark />
          <h1>Stock Control</h1>
          <p>Control de inventario en todas<br />tus sucursales.</p>
        </header>
        <div className="section-rule" aria-hidden="true" />

        <form className="login-card" onSubmit={handleSubmit} noValidate aria-busy={isSubmitting}>
          <div className="form-heading"><h2 id="login-title">Inicia sesión</h2><p>Ingresa tus credenciales para continuar.</p></div>
          {submissionState === 'error' && <div className="form-alert form-alert--error" role="alert">No pudimos iniciar sesión. Verifica tus credenciales e inténtalo nuevamente.</div>}

          <label className="field">
            <span>Usuario</span>
            <span className={`input-wrap ${errors.username ? 'input-wrap--error' : ''}`}>
              <UserRound size={18} strokeWidth={1.8} aria-hidden="true" />
              <input ref={usernameRef} name="username" type="text" value={username} onChange={(event) => { setUsername(event.target.value); setErrors((current) => ({ ...current, username: undefined })) }} autoComplete="username webauthn" placeholder="Ingresa tu usuario" aria-invalid={Boolean(errors.username)} aria-describedby={errors.username ? 'username-error' : undefined} disabled={isSubmitting} />
            </span>
            {errors.username && <small id="username-error" className="field-error">{errors.username}</small>}
          </label>

          <label className="field">
            <span>Contraseña</span>
            <span className={`input-wrap ${errors.password ? 'input-wrap--error' : ''}`}>
              <LockKeyhole size={18} strokeWidth={1.8} aria-hidden="true" />
              <input ref={passwordRef} name="password" type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => { setPassword(event.target.value); setErrors((current) => ({ ...current, password: undefined })) }} autoComplete="current-password" placeholder="Ingresa tu contraseña" aria-invalid={Boolean(errors.password)} aria-describedby={errors.password ? 'password-error' : undefined} disabled={isSubmitting} />
              <button className="password-toggle" type="button" aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'} aria-pressed={showPassword} onClick={() => setShowPassword((visible) => !visible)} disabled={isSubmitting}>
                {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
              </button>
            </span>
            {errors.password && <small id="password-error" className="field-error">{errors.password}</small>}
          </label>

          <div className="form-options">
            <label className="remember" title="Mantiene tu sesión iniciada por más tiempo en este dispositivo."><input name="remember" type="checkbox" disabled={isSubmitting} /> <span>Recordarme</span></label>
          </div>
          <button className="primary-button" type="submit" disabled={isSubmitting}>
            {isSubmitting ? <LoadingLabel>Iniciando sesión…</LoadingLabel> : 'Iniciar sesión'}
          </button>
        </form>

        <div className="separator"><span>o continúa con</span></div>
        {passkeyAvailable ? (
          <button className="passkey-button" type="button" onClick={() => setPasskeyMessage('La interfaz está lista; la passkey se habilitará al conectar el servicio de autenticación.')} disabled={isSubmitting}>
            <KeyRound className="passkey-button__icon" size={27} strokeWidth={1.9} aria-hidden="true" />
            <span><strong>Usar passkey de este dispositivo</strong><small>Inicia sesión de forma segura, rápida y sencilla</small></span>
            <ArrowRight className="passkey-button__arrow" size={25} strokeWidth={2.2} aria-hidden="true" />
          </button>
        ) : <p className="passkey-unavailable">Las passkeys no están disponibles en este navegador o conexión.</p>}
        {passkeyMessage && <p className="form-message" role="status">{passkeyMessage}</p>}
      </section>
    </main>
  )
}
