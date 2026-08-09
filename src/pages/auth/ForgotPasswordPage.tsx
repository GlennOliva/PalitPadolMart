import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import AuthCard from '../../components/auth/AuthCard'
import FormField from '../../components/common/FormField'
import SubmitButton from '../../components/common/SubmitButton'
import FormError from '../../components/common/FormError'
import Alert from '../../components/common/Alert'
import { resetPasswordForEmail } from '../../features/auth/auth.service'
import { mapAuthError } from '../../features/auth/auth-errors'
import { validateEmail } from '../../features/auth/validation'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [emailError, setEmailError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nextEmailError = validateEmail(email)
    setEmailError(nextEmailError)
    if (nextEmailError != null) return

    setSubmitError(null)
    setSuccess(null)
    setSubmitting(true)
    try {
      const { error } = await resetPasswordForEmail(email)
      if (error != null) {
        setSubmitError(mapAuthError(error).message)
        return
      }
      setSuccess(
        'If an account exists for that email address, we sent a password reset link. Please check your inbox.',
      )
      setEmail('')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="container auth-page">
      <AuthCard
        title="Reset your password"
        subtitle="We will email you a link to create a new password."
      >
        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          <FormField
            id="forgot-email"
            label="Email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={setEmail}
            error={emailError}
            required
          />
          {submitError != null ? <FormError message={submitError} /> : null}
          {success != null ? <Alert variant="success" message={success} /> : null}
          <SubmitButton loading={submitting} loadingLabel="Sending link…">
            Send reset link
          </SubmitButton>
        </form>
        <p className="auth-card__link">
          <Link to="/login">Back to sign in</Link>
        </p>
      </AuthCard>
    </div>
  )
}
