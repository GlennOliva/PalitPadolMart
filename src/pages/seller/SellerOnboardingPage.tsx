import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../../features/auth/useAuth'
import { describeSupabaseError } from '../../features/auth/auth-errors'
import { useSeller } from '../../features/seller/useSeller'
import { createSellerApplication } from '../../features/seller/seller.service'
import {
  hasSellerErrors,
  validateSellerApplication,
  type SellerFieldErrors,
} from '../../features/seller/seller-validation'
import { isSellerActive } from '../../features/seller/seller-utils'
import FormField from '../../components/common/FormField'
import SubmitButton from '../../components/common/SubmitButton'
import FormError from '../../components/common/FormError'
import Alert from '../../components/common/Alert'
import LoadingState from '../../components/common/LoadingState'

interface SellerFormState {
  store_name: string
  description: string
  city: string
  province: string
  pickup_available: boolean
  delivery_available: boolean
  pickup_location: string
  pickup_instructions: string
}

const EMPTY_FORM: SellerFormState = {
  store_name: '',
  description: '',
  city: '',
  province: '',
  pickup_available: false,
  delivery_available: false,
  pickup_location: '',
  pickup_instructions: '',
}

export default function SellerOnboardingPage() {
  const { user } = useAuth()
  const { sellerProfile, sellerLoading, refreshSellerProfile } = useSeller()
  const navigate = useNavigate()

  const [form, setForm] = useState<SellerFormState>(EMPTY_FORM)
  const [fieldErrors, setFieldErrors] = useState<SellerFieldErrors>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null)

  if (user == null) {
    return <LoadingState label="Loading your account…" />
  }

  if (sellerLoading) {
    return <LoadingState label="Loading your seller account…" />
  }

  const currentUser = user

  if (sellerProfile != null) {
    const destination = isSellerActive(sellerProfile) ? '/seller/dashboard' : '/seller/status'
    return <Navigate to={destination} replace />
  }

  function updateField(field: keyof SellerFormState) {
    return (value: string) => setForm((prev) => ({ ...prev, [field]: value }))
  }

  function toggleField(field: 'pickup_available' | 'delivery_available') {
    setForm((prev) => ({ ...prev, [field]: !prev[field] }))
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const errors = validateSellerApplication(form)
    if (hasSellerErrors(errors)) {
      setFieldErrors(errors)
      setSubmitError(null)
      return
    }
    setFieldErrors({})
    setSubmitError(null)
    setSubmitSuccess(null)
    setSubmitting(true)
    try {
      const { error } = await createSellerApplication(currentUser.id, form)
      if (error != null) {
        if (error.code === '23505') {
          // Unique violation on user_id: an application already exists.
          await refreshSellerProfile()
          navigate('/seller/status', { replace: true })
          return
        }
        setSubmitError(describeSupabaseError(error))
        return
      }
      await refreshSellerProfile()
      setSubmitSuccess('Your seller application has been submitted for review.')
      navigate('/seller/status', { replace: true })
    } catch {
      setSubmitError('We could not submit your application. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="container page">
      <h1 className="page__title">Become a Seller</h1>
      <p className="page__intro">
        Open your store on PalitPaddleBai Mart. Your application will be
        reviewed by an administrator before you can start selling.
      </p>

      <form className="seller-form" onSubmit={handleSubmit} noValidate>
        <section className="seller-form__section glass glass--soft">
          <h2 className="seller-form__section-title">Store details</h2>
          <FormField
            id="seller-store-name"
            label="Store name"
            required
            value={form.store_name}
            onChange={updateField('store_name')}
            error={fieldErrors.store_name}
            maxLength={120}
            placeholder="e.g. Ace Paddles PH"
          />
          <div className="form-field">
            <label className="form-field__label" htmlFor="seller-description">
              Description
            </label>
            <textarea
              className="form-field__textarea"
              id="seller-description"
              rows={4}
              value={form.description}
              onChange={(event) => updateField('description')(event.target.value)}
              maxLength={1000}
              aria-invalid={fieldErrors.description != null ? true : undefined}
            />
            <p className="form-field__hint">
              Tell buyers about your store and the gear you sell. Optional.
            </p>
            {fieldErrors.description != null ? (
              <p className="form-field__error">{fieldErrors.description}</p>
            ) : null}
          </div>
          <FormField
            id="seller-city"
            label="City"
            hint="Where buyers can meet or where your gear ships from."
            value={form.city}
            onChange={updateField('city')}
            error={fieldErrors.city}
            maxLength={100}
          />
          <FormField
            id="seller-province"
            label="Province / region"
            value={form.province}
            onChange={updateField('province')}
            error={fieldErrors.province}
            maxLength={100}
          />
        </section>

        <section className="seller-form__section glass glass--soft">
          <h2 className="seller-form__section-title">Fulfillment</h2>
          <fieldset className="seller-form__toggles">
            <legend className="seller-form__toggles-title">How do you fulfill orders?</legend>
            <label className="toggle-field">
              <input
                className="toggle-field__input"
                type="checkbox"
                checked={form.pickup_available}
                onChange={() => toggleField('pickup_available')}
              />
              <span className="toggle-field__body">
                <span className="toggle-field__label">Pickup available</span>
                <span className="toggle-field__hint">Buyers can pick up items in person</span>
              </span>
            </label>
            <label className="toggle-field">
              <input
                className="toggle-field__input"
                type="checkbox"
                checked={form.delivery_available}
                onChange={() => toggleField('delivery_available')}
              />
              <span className="toggle-field__body">
                <span className="toggle-field__label">Delivery available</span>
                <span className="toggle-field__hint">You can ship items to buyers</span>
              </span>
            </label>
          </fieldset>
          {form.pickup_available ? (
            <>
              <h3 className="seller-form__subsection-title">Pickup details</h3>
              <FormField
                id="seller-pickup-location"
                label="Pickup location"
                value={form.pickup_location}
                onChange={updateField('pickup_location')}
                error={fieldErrors.pickup_location}
                maxLength={200}
                placeholder="e.g. Metro Park, Dumanjug field, or your shop address"
              />
              <div className="form-field">
                <label className="form-field__label" htmlFor="seller-pickup-instructions">
                  Pickup instructions
                </label>
                <textarea
                  className="form-field__textarea"
                  id="seller-pickup-instructions"
                  rows={3}
                  value={form.pickup_instructions}
                  onChange={(event) => updateField('pickup_instructions')(event.target.value)}
                  maxLength={500}
                  aria-invalid={fieldErrors.pickup_instructions != null ? true : undefined}
                />
                <p className="form-field__hint">
                  Landmarks, parking notes, or how buyers should announce themselves.
                </p>
                {fieldErrors.pickup_instructions != null ? (
                  <p className="form-field__error">{fieldErrors.pickup_instructions}</p>
                ) : null}
              </div>
            </>
          ) : null}
        </section>
        {submitError != null ? <FormError message={submitError} /> : null}
        {submitSuccess != null ? <Alert variant="success" message={submitSuccess} /> : null}
        <SubmitButton loading={submitting} loadingLabel="Submitting application…">
          Submit application
        </SubmitButton>
      </form>

      <p className="page-note">
        Prefer to keep shopping first?{' '}
        <Link to="/dashboard">Back to your dashboard</Link>.
      </p>
    </div>
  )
}
