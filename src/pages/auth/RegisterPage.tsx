import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import AuthCard from '../../components/auth/AuthCard'
import FormField from '../../components/common/FormField'
import PasswordField from '../../components/auth/PasswordField'
import SubmitButton from '../../components/common/SubmitButton'
import FormError from '../../components/common/FormError'
import Alert from '../../components/common/Alert'
import { signUp } from '../../features/auth/auth.service'
import { mapAuthError } from '../../features/auth/auth-errors'
import { resolveReturnPath } from '../../features/auth/auth-utils'
import {
  validateEmail,
  validateName,
  validateOptionalText,
  validatePassword,
  validatePasswordConfirm,
} from '../../features/auth/validation'
import GoogleOAuthButton from '../../components/auth/GoogleOAuthButton'

interface RegisterForm {
  firstName: string
  lastName: string
  displayName: string
  email: string
  password: string
  confirmPassword: string
}

interface RegisterErrors {
  firstName?: string | null
  lastName?: string | null
  displayName?: string | null
  email?: string | null
  password?: string | null
  confirmPassword?: string | null
}

export default function RegisterPage() {
  const navigate = useNavigate()
  const location = useLocation()

  const [form, setForm] = useState<RegisterForm>({
    firstName: '',
    lastName: '',
    displayName: '',
    email: '',
    password: '',
    confirmPassword: '',
  })
  const [errors, setErrors] = useState<RegisterErrors>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [confirmationNotice, setConfirmationNotice] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  function updateField(field: keyof RegisterForm) {
    return (value: string) => setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nextErrors: RegisterErrors = {
      firstName: validateName(form.firstName, 'First name'),
      lastName: validateName(form.lastName, 'Last name'),
      displayName: validateOptionalText(form.displayName, 'Display name'),
      email: validateEmail(form.email),
      password: validatePassword(form.password),
      confirmPassword: validatePasswordConfirm(form.password, form.confirmPassword),
    }
    setErrors(nextErrors)
    const hasFieldErrors = Object.values(nextErrors).some((value) => value != null)
    if (hasFieldErrors) return

    setSubmitError(null)
    setConfirmationNotice(null)
    setSubmitting(true)
    try {
      const { data, error } = await signUp({
        firstName: form.firstName,
        lastName: form.lastName,
        displayName: form.displayName,
        email: form.email,
        password: form.password,
      })
      if (error != null) {
        setSubmitError(mapAuthError(error).message)
        return
      }
      if (data.session != null) {
        // Email confirmation disabled: the returned session signs the user in.
        navigate(resolveReturnPath(location.state?.from), { replace: true })
        return
      }
      setConfirmationNotice(
        'Account created. Please check your email to confirm your account.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="container auth-page">
      <AuthCard
        title="Create your account"
        subtitle="Join PalitPaddleBai Mart to buy and sell pickleball equipment."
      >
        <GoogleOAuthButton
          returnPath={location.state?.from}
          disabled={submitting}
          onError={setSubmitError}
        />
        <div className="auth-divider" role="separator">
          <span>or create an account with email</span>
        </div>
        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          <FormField
            id="register-first-name"
            label="First name"
            autoComplete="given-name"
            value={form.firstName}
            onChange={updateField('firstName')}
            error={errors.firstName}
            maxLength={120}
            required
          />
          <FormField
            id="register-last-name"
            label="Last name"
            autoComplete="family-name"
            value={form.lastName}
            onChange={updateField('lastName')}
            error={errors.lastName}
            maxLength={120}
            required
          />
          <FormField
            id="register-display-name"
            label="Display name"
            hint="Optional. Shown publicly instead of your full name."
            value={form.displayName}
            onChange={updateField('displayName')}
            error={errors.displayName}
            maxLength={120}
          />
          <FormField
            id="register-email"
            label="Email"
            type="email"
            autoComplete="email"
            value={form.email}
            onChange={updateField('email')}
            error={errors.email}
            required
          />
          <PasswordField
            id="register-password"
            label="Password"
            autoComplete="new-password"
            hint="At least 8 characters."
            value={form.password}
            onChange={updateField('password')}
            error={errors.password}
            required
          />
          <PasswordField
            id="register-confirm-password"
            label="Confirm password"
            autoComplete="new-password"
            value={form.confirmPassword}
            onChange={updateField('confirmPassword')}
            error={errors.confirmPassword}
            required
          />
          {submitError != null ? <FormError message={submitError} /> : null}
          {confirmationNotice != null ? (
            <Alert variant="success" message={confirmationNotice} />
          ) : null}
          <SubmitButton loading={submitting} loadingLabel="Creating account…">
            Create account
          </SubmitButton>
        </form>
        <p className="auth-card__link">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </AuthCard>
    </div>
  )
}
