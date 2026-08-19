import { FormEvent, useRef, useState } from 'react'
import { ArrowLeft, LoaderCircle, Mail } from 'lucide-react'
import { Link } from 'react-router-dom'

const EMAIL_PATTERN = /^\S+@\S+\.\S+$/

function LoadingLabel() {
  return <><span className="spinner" aria-hidden="true"><LoaderCircle size={18} /></span>Enviando…</>
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const emailRef = useRef<HTMLInputElement>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!email.trim() || !EMAIL_PATTERN.test(email.trim())) {
      setError('Ingresa un correo electrónico válido.')
      emailRef.current?.focus()
      return
    }
    setError('')
    setSubmitting(true)
    await new Promise((resolve) => window.setTimeout(resolve, 650))
    setSubmitting(false)
    setSubmitted(true)
  }

  return (
    <main className="login-page login-page--compact">
      <section className="login-shell" aria-labelledby="recovery-title">
        <form className="login-card recovery-card" onSubmit={handleSubmit} noValidate aria-busy={submitting}>
          <Link className="back-link" to="/iniciar-sesion"><ArrowLeft size={17} aria-hidden="true" /> Volver a iniciar sesión</Link>
          <div className="form-heading">
            <h1 id="recovery-title">Recupera tu contraseña</h1>
            <p>Ingresa el correo asociado con tu cuenta.</p>
          </div>
          {submitted ? (
            <div className="form-alert form-alert--success" role="status">Si existe una cuenta asociada, enviaremos las instrucciones para restablecer tu contraseña.</div>
          ) : (
            <>
              <label className="field">
                <span>Correo electrónico</span>
                <span className={`input-wrap ${error ? 'input-wrap--error' : ''}`}>
                  <Mail size={18} strokeWidth={1.8} aria-hidden="true" />
                  <input ref={emailRef} name="email" type="email" value={email} onChange={(event) => { setEmail(event.target.value); setError('') }} autoComplete="email" inputMode="email" placeholder="nombre@empresa.com" aria-invalid={Boolean(error)} aria-describedby={error ? 'email-error' : undefined} disabled={submitting} />
                </span>
                {error && <small id="email-error" className="field-error">{error}</small>}
              </label>
              <button className="primary-button recovery-submit" type="submit" disabled={submitting}>
                {submitting ? <LoadingLabel /> : 'Enviar instrucciones'}
              </button>
            </>
          )}
        </form>
      </section>
    </main>
  )
}
