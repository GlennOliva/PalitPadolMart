import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import AuthCard from '../../components/auth/AuthCard'
import FormField from '../../components/common/FormField'
import PasswordField from '../../components/auth/PasswordField'
import SubmitButton from '../../components/common/SubmitButton'
import FormError from '../../components/common/FormError'
import Alert from '../../components/common/Alert'
import { signInWithPassword } from '../../features/auth/auth.service'
import { mapAuthError } from '../../features/auth/auth-errors'
import { resolveReturnPath } from '../../features/auth/auth-utils'
import { validateEmail, validatePassword } from '../../features/auth/validation'
import GoogleOAuthButton from '../../components/auth/GoogleOAuthButton'

export default function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [emailError, setEmailError] = useState<string | null>(null)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [confirmationNotice, setConfirmationNotice] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nextEmailError = validateEmail(email)
    const nextPasswordError = validatePassword(password)
    setEmailError(nextEmailError)
    setPasswordError(nextPasswordError)
    if (nextEmailError != null || nextPasswordError != null) return

    setSubmitError(null)
    setConfirmationNotice(null)
    setSubmitting(true)
    try {
      const { data, error } = await signInWithPassword(email, password)
      if (error != null) {
        const friendly = mapAuthError(error)
        if (friendly.code === 'email_not_confirmed') {
          setConfirmationNotice(friendly.message)
        } else {
          setSubmitError(friendly.message)
        }
        return
      }
      if (data.session == null) {
        setConfirmationNotice(
          'Please confirm your email address before signing in. Check your inbox for a confirmation link.',
        )
        return
      }
      navigate(resolveReturnPath(location.state?.from), { replace: true })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="container auth-page">
      <AuthCard
        title="Sign in"
        subtitle="Welcome back to PalitPaddleBai Mart."
      >
        <GoogleOAuthButton
          returnPath={location.state?.from}
          disabled={submitting}
          onError={setSubmitError}
        />
        <div className="auth-divider" role="separator">
          <span>or continue with email</span>
        </div>
        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          <FormField
            id="login-email"
            label="Email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={setEmail}
            error={emailError}
            required
          />
          <PasswordField
            id="login-password"
            label="Password"
            autoComplete="current-password"
            value={password}
            onChange={setPassword}
            error={passwordError}
            required
          />
          {submitError != null ? <FormError message={submitError} /> : null}
          {confirmationNotice != null ? (
            <Alert variant="info" message={confirmationNotice} />
          ) : null}
          <SubmitButton loading={submitting} loadingLabel="Signing in…">
            Sign in
          </SubmitButton>
        </form>
        <p className="auth-card__link">
          <Link to="/forgot-password">Forgot your password?</Link>
        </p>
        <p className="auth-card__link">
          New to PalitPaddleBai Mart? <Link to="/register">Create an account</Link>
        </p>
      </AuthCard>
    </div>
  )
}
