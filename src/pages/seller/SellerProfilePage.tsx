import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../features/auth/useAuth'
import { describeSupabaseError } from '../../features/auth/auth-errors'
import { useSeller } from '../../features/seller/useSeller'
import {
  getPublicLogoUrl,
  removeSellerLogo,
  updateMySellerProfile,
  uploadSellerLogo,
} from '../../features/seller/seller.service'
import { validateSellerLogoFile } from '../../features/seller/seller-logo'
import {
  hasSellerErrors,
  validateSellerApplication,
  type SellerFieldErrors,
} from '../../features/seller/seller-validation'
import { formatSellerStatus } from '../../features/seller/seller-utils'
import FormField from '../../components/common/FormField'
import SubmitButton from '../../components/common/SubmitButton'
import FormError from '../../components/common/FormError'
import Alert from '../../components/common/Alert'
import LoadingState from '../../components/common/LoadingState'

interface SellerProfileFormState {
  store_name: string
  description: string
  city: string
  province: string
  pickup_available: boolean
  delivery_available: boolean
  pickup_location: string
  pickup_instructions: string
}

function profileToForm(
  profile: {
    store_name: string
    description: string | null
    city: string | null
    province: string | null
    pickup_available: boolean
    delivery_available: boolean
    pickup_location: string | null
    pickup_instructions: string | null
  },
): SellerProfileFormState {
  return {
    store_name: profile.store_name,
    description: profile.description ?? '',
    city: profile.city ?? '',
    province: profile.province ?? '',
    pickup_available: profile.pickup_available,
    delivery_available: profile.delivery_available,
    pickup_location: profile.pickup_location ?? '',
    pickup_instructions: profile.pickup_instructions ?? '',
  }
}

const EMPTY_PROFILE = {
  store_name: '',
  description: null,
  city: null,
  province: null,
  pickup_available: false,
  delivery_available: false,
  pickup_location: null,
  pickup_instructions: null,
}

export default function SellerProfilePage() {
  const { user } = useAuth()
  const { sellerProfile, sellerLoading, refreshSellerProfile } = useSeller()

  const [form, setForm] = useState<SellerProfileFormState>(() =>
    profileToForm(sellerProfile ?? EMPTY_PROFILE),
  )
  const [fieldErrors, setFieldErrors] = useState<SellerFieldErrors>({})
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null)
  const [logoBusy, setLogoBusy] = useState(false)
  const [logoError, setLogoError] = useState<string | null>(null)

  useEffect(() => {
    if (sellerProfile != null) setForm(profileToForm(sellerProfile))
  }, [sellerProfile])

  if (user == null || sellerProfile == null) {
    return <LoadingState label="Loading your seller profile…" />
  }

  if (sellerLoading) {
    return <LoadingState label="Loading your seller profile…" />
  }

  const logoUrl = getPublicLogoUrl(sellerProfile.logo_url)
  const currentUser = user
  const currentSellerProfile = sellerProfile

  function updateField(field: keyof SellerProfileFormState) {
    return (value: string) => setForm((prev) => ({ ...prev, [field]: value }))
  }

  function toggleField(field: 'pickup_available' | 'delivery_available') {
    setForm((prev) => ({ ...prev, [field]: !prev[field] }))
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file == null) return
    const validation = validateSellerLogoFile(file)
    if (!validation.ok) {
      setLogoError(validation.error ?? 'That image is not allowed.')
      return
    }
    void performLogoUpload(file)
  }

  async function performLogoUpload(file: File) {
    setLogoError(null)
    setSaveError(null)
    setLogoBusy(true)
    try {
      const { error } = await uploadSellerLogo(currentSellerProfile.id, currentUser.id, file)
      if (error != null) {
        setLogoError(describeSupabaseError(error))
        return
      }
      await refreshSellerProfile()
    } finally {
      setLogoBusy(false)
    }
  }

  async function handleRemoveLogo() {
    if (currentSellerProfile.logo_url == null) return
    setLogoError(null)
    setSaveError(null)
    setLogoBusy(true)
    try {
      const { error } = await removeSellerLogo(
        currentSellerProfile.id,
        currentUser.id,
        currentSellerProfile.logo_url,
      )
      if (error != null) {
        setLogoError('We could not remove your store logo. Please try again.')
        return
      }
      await refreshSellerProfile()
    } finally {
      setLogoBusy(false)
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const errors = validateSellerApplication(form)
    if (hasSellerErrors(errors)) {
      setFieldErrors(errors)
      setSaveError(null)
      setSaveSuccess(null)
      return
    }
    setFieldErrors({})
    setSaveError(null)
    setSaveSuccess(null)
    setSaving(true)
    try {
      const { error } = await updateMySellerProfile(currentUser.id, form)
      if (error != null) {
        setSaveError(describeSupabaseError(error))
        return
      }
      await refreshSellerProfile()
      setSaveSuccess('Your seller profile has been updated.')
    } catch {
      setSaveError('We could not update your seller profile. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="container page">
      <h1 className="page__title">Seller profile</h1>

      <section className="profile-card" aria-label="Store logo">
        <div className="profile-card__avatar-row">
          <div className="seller-logo">
            {logoUrl != null ? (
              <img className="seller-logo__image" src={logoUrl} alt="Your store logo" />
            ) : (
              <span className="seller-logo__fallback" aria-hidden="true">
                {sellerProfile.store_name.charAt(0).toUpperCase()}
              </span>
            )}
          </div>
          <div className="profile-card__avatar-actions">
            <label className="btn btn--secondary">
              {logoBusy ? 'Uploading…' : 'Upload logo'}
              <input
                className="visually-hidden"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleFileChange}
                disabled={logoBusy}
              />
            </label>
            {sellerProfile.logo_url != null ? (
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => void handleRemoveLogo()}
                disabled={logoBusy}
              >
                Remove
              </button>
            ) : null}
          </div>
        </div>
        {logoError != null ? <FormError message={logoError} /> : null}
        <p className="profile-card__hint">JPEG, PNG, or WebP up to 5 MB.</p>
      </section>

      <form className="seller-form" onSubmit={handleSubmit} noValidate>
        <div className="seller-form__status">
          <p className="seller-form__status-text">
            Status: <strong>{formatSellerStatus(sellerProfile.seller_status)}</strong>
          </p>
          <p className="seller-form__status-note">
            Status changes are managed by administrators.
          </p>
        </div>
        <FormField
          id="seller-store-name"
          label="Store name"
          required
          value={form.store_name}
          onChange={updateField('store_name')}
          error={fieldErrors.store_name}
          maxLength={120}
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
          <p className="form-field__hint">Describe your store and what you sell.</p>
          {fieldErrors.description != null ? (
            <p className="form-field__error">{fieldErrors.description}</p>
          ) : null}
        </div>
        <FormField
          id="seller-city"
          label="City"
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
          <div className="seller-form__pickup">
            <h2 className="seller-form__section-title">Pickup details</h2>
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
          </div>
        ) : null}
        {saveError != null ? <FormError message={saveError} /> : null}
        {saveSuccess != null ? <Alert variant="success" message={saveSuccess} /> : null}
        <SubmitButton loading={saving} loadingLabel="Saving…">
          Save changes
        </SubmitButton>
      </form>

      <p className="page-note">
        <Link to="/seller/dashboard">Back to seller dashboard</Link> ·{' '}
        <Link to={`/sellers/${sellerProfile.id}`}>View public profile</Link>
      </p>
    </div>
  )
}
