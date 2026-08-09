import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent } from 'react'
import { useAuth } from '../../features/auth/useAuth'
import {
  clearProfileAvatar,
  getAvatarSignedUrl,
  removeAvatarObject,
  updateProfile,
  uploadAvatar,
} from '../../features/auth/auth.service'
import { validateOptionalText, validateName } from '../../features/auth/validation'
import { validateAvatarFile } from '../../features/auth/avatar'
import { describeSupabaseError } from '../../features/auth/auth-errors'
import { hasRole } from '../../features/auth/auth-utils'
import FormField from '../../components/common/FormField'
import SubmitButton from '../../components/common/SubmitButton'
import FormError from '../../components/common/FormError'
import Alert from '../../components/common/Alert'
import LoadingState from '../../components/common/LoadingState'
import type { Profile } from '../../features/auth/auth.types'

interface ProfileFormState {
  first_name: string
  last_name: string
  display_name: string
  phone: string
  city: string
  province: string
}

function profileToForm(profile: Profile): ProfileFormState {
  return {
    first_name: profile.first_name ?? '',
    last_name: profile.last_name ?? '',
    display_name: profile.display_name ?? '',
    phone: profile.phone ?? '',
    city: profile.city ?? '',
    province: profile.province ?? '',
  }
}

export default function ProfilePage() {
  const { user, profile, refreshProfile } = useAuth()

  const [form, setForm] = useState<ProfileFormState>(() =>
    profileToForm(profile ?? ({} as Profile)),
  )
  const [saving, setSaving] = useState(false)
  const [avatarBusy, setAvatarBusy] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null)
  const [avatarError, setAvatarError] = useState<string | null>(null)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [avatarLoading, setAvatarLoading] = useState(false)

  useEffect(() => {
    if (profile != null) setForm(profileToForm(profile))
  }, [profile])

  const syncAvatarUrl = useCallback(async (avatarPath: string | null) => {
    if (avatarPath == null) {
      setAvatarUrl(null)
      return
    }
    setAvatarLoading(true)
    const { url, error } = await getAvatarSignedUrl(avatarPath)
    if (error != null) {
      setAvatarError('We could not load your profile photo. Please try again.')
    } else {
      setAvatarUrl(url)
      setAvatarError(null)
    }
    setAvatarLoading(false)
  }, [])

  useEffect(() => {
    void syncAvatarUrl(profile?.avatar_url ?? null)
  }, [profile?.avatar_url, syncAvatarUrl])

  if (user == null || profile == null) {
    return <LoadingState label="Loading your profile…" />
  }

  function updateField(field: keyof ProfileFormState) {
    return (value: string) => setForm((prev) => ({ ...prev, [field]: value }))
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (file == null) return
    const validation = validateAvatarFile(file)
    if (!validation.ok) {
      setAvatarError(validation.error ?? 'That image is not allowed.')
      event.target.value = ''
      return
    }
    void performAvatarUpload(file)
    event.target.value = ''
  }

  const currentUser = user

  async function performAvatarUpload(file: File) {
    setAvatarError(null)
    setSaveError(null)
    setAvatarBusy(true)
    try {
      const { path, error } = await uploadAvatar(currentUser.id, file)
      if (error != null) {
        setAvatarError(describeSupabaseError(error))
        return
      }
      await refreshProfile()
      await syncAvatarUrl(path)
    } finally {
      setAvatarBusy(false)
    }
  }

  async function handleRemoveAvatar() {
    if (profile?.avatar_url == null) return
    setAvatarError(null)
    setSaveError(null)
    setAvatarBusy(true)
    try {
      const { error } = await removeAvatarObject(profile.avatar_url)
      if (error != null) {
        setAvatarError('We could not remove your profile photo. Please try again.')
        return
      }
      const { error: clearError } = await clearProfileAvatar(currentUser.id)
      if (clearError != null) {
        setAvatarError('We could not remove your profile photo. Please try again.')
        return
      }
      await refreshProfile()
      setAvatarUrl(null)
    } finally {
      setAvatarBusy(false)
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const firstNameError = validateName(form.first_name, 'First name')
    const lastNameError = validateName(form.last_name, 'Last name')
    const displayNameError = validateOptionalText(form.display_name, 'Display name')
    if (firstNameError != null || lastNameError != null || displayNameError != null) {
      setSaveError([firstNameError, lastNameError, displayNameError].filter(Boolean).join(' '))
      return
    }

    setSaveError(null)
    setSaveSuccess(null)
    setSaving(true)
    try {
      await updateProfile(currentUser.id, form)
      await refreshProfile()
      setSaveSuccess('Your profile has been updated.')
    } catch {
      setSaveError('We could not update your profile. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="container page">
      <h1 className="page__title">My profile</h1>

      <section className="profile-card" aria-label="Profile photo">
        <div className="profile-card__avatar-row">
          <div className="avatar">
            {avatarLoading ? (
              <span className="spinner spinner--sm" aria-hidden="true" />
            ) : avatarUrl != null ? (
              <img className="avatar__image" src={avatarUrl} alt="Your profile photo" />
            ) : (
              <span className="avatar__fallback" aria-hidden="true">
                {(profile.display_name ?? profile.first_name ?? '?')
                  .charAt(0)
                  .toUpperCase()}
              </span>
            )}
          </div>
          <div className="profile-card__avatar-actions">
            <label className="btn btn--secondary">
              {avatarBusy ? 'Uploading…' : 'Change photo'}
              <input
                className="visually-hidden"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleFileChange}
                disabled={avatarBusy}
              />
            </label>
            {profile.avatar_url != null ? (
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => void handleRemoveAvatar()}
                disabled={avatarBusy}
              >
                Remove
              </button>
            ) : null}
          </div>
        </div>
        {avatarError != null ? <FormError message={avatarError} /> : null}
        <p className="profile-card__hint">
          JPEG, PNG, or WebP up to 5 MB.
        </p>
      </section>

      <form className="profile-form" onSubmit={handleSubmit} noValidate>
        <FormField
          id="profile-first-name"
          label="First name"
          autoComplete="given-name"
          value={form.first_name}
          onChange={updateField('first_name')}
          maxLength={120}
        />
        <FormField
          id="profile-last-name"
          label="Last name"
          autoComplete="family-name"
          value={form.last_name}
          onChange={updateField('last_name')}
          maxLength={120}
        />
        <FormField
          id="profile-display-name"
          label="Display name"
          hint="Optional. Shown publicly instead of your full name."
          value={form.display_name}
          onChange={updateField('display_name')}
          maxLength={120}
        />
        <FormField
          id="profile-email"
          label="Email"
          type="email"
          value={user.email ?? ''}
          onChange={() => undefined}
          disabled
        />
        <FormField
          id="profile-phone"
          label="Phone"
          type="tel"
          autoComplete="tel"
          value={form.phone}
          onChange={updateField('phone')}
          maxLength={30}
        />
        <FormField
          id="profile-city"
          label="City"
          autoComplete="address-level2"
          value={form.city}
          onChange={updateField('city')}
          maxLength={100}
        />
        <FormField
          id="profile-province"
          label="Province / region"
          autoComplete="address-level1"
          value={form.province}
          onChange={updateField('province')}
          maxLength={100}
        />
        <div className="profile-form__meta">
          <p className="profile-form__role">
            Role: <strong>{hasRole(profile, 'admin') ? 'Administrator' : hasRole(profile, 'seller') ? 'Seller' : 'Customer'}</strong>
          </p>
          <p className="profile-form__email-note">
            Email and account status are managed by your administrator.
          </p>
        </div>
        {saveError != null ? <FormError message={saveError} /> : null}
        {saveSuccess != null ? <Alert variant="success" message={saveSuccess} /> : null}
        <SubmitButton loading={saving} loadingLabel="Saving…">
          Save changes
        </SubmitButton>
      </form>
    </div>
  )
}
