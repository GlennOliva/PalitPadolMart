import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import AuthCard from '../../components/auth/AuthCard'
import PasswordField from '../../components/auth/PasswordField'
import SubmitButton from '../../components/common/SubmitButton'
import FormError from '../../components/common/FormError'
import Alert from '../../components/common/Alert'
import { useAuth } from '../../features/auth/useAuth'
import { updatePassword } from '../../features/auth/auth.service'
import { mapAuthError } from '../../features/auth/auth-errors'
import { validatePassword, validatePasswordConfirm } from '../../features/auth/validation'

export default function ResetPasswordPage() {
  const { isPasswordRecovery, clearPasswordRecovery, signOut } = useAuth()

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [confirmError, setConfirmError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [completed, setCompleted] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nextPasswordError = validatePassword(password)
    const nextConfirmError = validatePasswordConfirm(password, confirmPassword)
    setPasswordError(nextPasswordError)
    setConfirmError(nextConfirmError)
    if (nextPasswordError != null || nextConfirmError != null) return

    setSubmitError(null)
    setSuccess(null)
    setSubmitting(true)
    try {
      const { error } = await updatePassword(password)
      if (error != null) {
        setSubmitError(mapAuthError(error).message)
        return
      }
      clearPasswordRecovery()
      await signOut()
      setCompleted(true)
      setSuccess('Your password has been updated. Please sign in with your new password.')
      setPassword('')
      setConfirmPassword('')
    } finally {
      setSubmitting(false)
    }
  }

  if (completed) {
    return (
      <div className="container auth-page">
        <AuthCard title="Password updated">
          <Alert variant="success" message={success ?? 'Your password has been updated.'} />
          <p className="auth-card__link">
            <Link to="/login">Sign in with your new password</Link>
          </p>
        </AuthCard>
      </div>
    )
  }

  if (!isPasswordRecovery) {
    return (
      <div className="container auth-page">
        <AuthCard title="Reset your password">
          <p className="auth-card__subtitle">
            This link is not valid for resetting your password. Request a new
            reset link to continue.
          </p>
          <p className="auth-card__link">
            <Link to="/forgot-password">Request a new reset link</Link>
          </p>
        </AuthCard>
      </div>
    )
  }

  return (
    <div className="container auth-page">
      <AuthCard
        title="Choose a new password"
        subtitle="Enter a new password for your account."
      >
        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          <PasswordField
            id="reset-password"
            label="New password"
            autoComplete="new-password"
            hint="At least 8 characters."
            value={password}
            onChange={setPassword}
            error={passwordError}
            required
          />
          <PasswordField
            id="reset-confirm-password"
            label="Confirm new password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={setConfirmPassword}
            error={confirmError}
            required
          />
          {submitError != null ? <FormError message={submitError} /> : null}
          {success != null ? <Alert variant="success" message={success} /> : null}
          <SubmitButton loading={submitting} loadingLabel="Updating password…">
            Update password
          </SubmitButton>
        </form>
        <p className="auth-card__link">
          <Link to="/login">Back to sign in</Link>
        </p>
      </AuthCard>
    </div>
  )
}
