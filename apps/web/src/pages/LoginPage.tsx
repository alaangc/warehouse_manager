import { FormEvent, useState } from 'react'
import { ArrowRight, Eye, EyeOff, KeyRound, LockKeyhole, UserRound } from 'lucide-react'

type FormErrors = { username?: string; password?: string }

function BrandMark() {
  return (
    <div className="brand-mark" aria-hidden="true">
      <div className="brand-mark__cube"><span>SC</span></div>
    </div>
  )
}

export function LoginPage() {
  const [errors, setErrors] = useState<FormErrors>({})
  const [message, setMessage] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const username = String(form.get('username') ?? '').trim()
    const password = String(form.get('password') ?? '')
    const nextErrors: FormErrors = {}

    if (!username) nextErrors.username = 'Ingresa tu usuario.'
    if (!password) nextErrors.password = 'Ingresa tu contraseña.'
    setErrors(nextErrors)
    setMessage(Object.keys(nextErrors).length ? '' : 'El acceso se conectará al API en la siguiente fase.')
  }

  return (
    <main className="login-page">
      <section className="login-shell" aria-labelledby="login-title">
        <header className="brand">
          <BrandMark />
          <h1>Stock Control</h1>
          <p>Control de inventario en todas<br />tus sucursales.</p>
        </header>

        <div className="section-rule" aria-hidden="true" />

        <form className="login-card" onSubmit={handleSubmit} noValidate>
          <div className="form-heading">
            <h2 id="login-title">Inicia sesión</h2>
            <p>Ingresa tus credenciales para continuar.</p>
          </div>

          <label className="field">
            <span>Usuario</span>
            <span className={`input-wrap ${errors.username ? 'input-wrap--error' : ''}`}>
              <UserRound size={18} strokeWidth={1.8} aria-hidden="true" />
              <input name="username" type="text" autoComplete="username" placeholder="Ingresa tu usuario" aria-invalid={Boolean(errors.username)} aria-describedby={errors.username ? 'username-error' : undefined} />
            </span>
            {errors.username && <small id="username-error" className="field-error">{errors.username}</small>}
          </label>

          <label className="field">
            <span>Contraseña</span>
            <span className={`input-wrap ${errors.password ? 'input-wrap--error' : ''}`}>
              <LockKeyhole size={18} strokeWidth={1.8} aria-hidden="true" />
              <input name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" placeholder="Ingresa tu contraseña" aria-invalid={Boolean(errors.password)} aria-describedby={errors.password ? 'password-error' : undefined} />
              <button
                className="password-toggle"
                type="button"
                aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                aria-pressed={showPassword}
                onClick={() => setShowPassword((visible) => !visible)}
              >
                {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
              </button>
            </span>
            {errors.password && <small id="password-error" className="field-error">{errors.password}</small>}
          </label>

          <div className="form-options">
            <label className="remember"><input name="remember" type="checkbox" /> <span>Recordarme</span></label>
            <a href="#recuperar">¿Olvidaste tu contraseña?</a>
          </div>

          <button className="primary-button" type="submit">Iniciar sesión</button>
          {message && <p className="form-message" role="status">{message}</p>}
        </form>

        <div className="separator"><span>o continúa con</span></div>

        <button className="passkey-button" type="button" onClick={() => setMessage('La autenticación con passkey se conectará en la siguiente fase.')}>
          <KeyRound className="passkey-button__icon" size={27} strokeWidth={1.9} aria-hidden="true" />
          <span><strong>Usar passkey de este dispositivo</strong><small>Inicia sesión de forma segura, rápida y sencilla</small></span>
          <ArrowRight className="passkey-button__arrow" size={25} strokeWidth={2.2} aria-hidden="true" />
        </button>
      </section>
    </main>
  )
}
