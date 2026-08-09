import { useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '../../features/auth/useAuth'
import {
  getRecommendationPreferences,
  saveRecommendationPreferences,
} from '../../features/auth/auth.service'
import { describeSupabaseError } from '../../features/auth/auth-errors'
import SubmitButton from '../../components/common/SubmitButton'
import FormError from '../../components/common/FormError'
import Alert from '../../components/common/Alert'
import LoadingState from '../../components/common/LoadingState'
import type { RecommendationPreferences } from '../../features/auth/auth.types'

export const SKILL_LEVELS = [
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
  { value: 'all', label: 'All levels' },
] as const

export const PLAYING_STYLES = [
  { value: 'control', label: 'Control' },
  { value: 'power', label: 'Power' },
  { value: 'all_court', label: 'All court' },
  { value: 'balanced', label: 'Balanced' },
  { value: 'spin', label: 'Spin' },
] as const

interface PreferencesFormState {
  skill_level: string
  playing_style: string
  preferred_weight_grams: string
  control_power_preference: string
  budget: string
}

function preferencesToForm(prefs: RecommendationPreferences | null): PreferencesFormState {
  return {
    skill_level: prefs?.skill_level ?? '',
    playing_style: prefs?.playing_style ?? '',
    preferred_weight_grams: prefs?.preferred_weight_grams?.toString() ?? '',
    control_power_preference: prefs?.control_power_preference?.toString() ?? '',
    budget: prefs?.budget?.toString() ?? '',
  }
}

export default function PreferencesPage() {
  const { user, profile } = useAuth()

  const [form, setForm] = useState<PreferencesFormState>(() => preferencesToForm(null))
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    async function load() {
      if (user == null) return
      setLoadError(null)
      const { data, error } = await getRecommendationPreferences(user.id)
      if (!active) return
      if (error != null) {
        setLoadError('We could not load your preferences. Please try again.')
      } else {
        setForm(preferencesToForm(data))
      }
      setLoading(false)
    }
    void load()
    return () => {
      active = false
    }
  }, [user])

  if (user == null || profile == null) {
    return <LoadingState label="Loading your preferences…" />
  }

  const currentUser = user

  if (loading) {
    return <LoadingState label="Loading your preferences…" />
  }

  function updateField(field: keyof PreferencesFormState) {
    return (value: string) => setForm((prev) => ({ ...prev, [field]: value }))
  }

  function buildValidationError(): string | null {
    const weight = form.preferred_weight_grams
    if (weight !== '') {
      const parsed = Number(weight)
      if (!Number.isInteger(parsed) || parsed < 150 || parsed > 400) {
        return 'Preferred paddle weight must be between 150 and 400 grams.'
      }
    }
    const control = form.control_power_preference
    if (control !== '') {
      const parsed = Number(control)
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 10) {
        return 'Control vs. power must be a number between 1 and 10.'
      }
    }
    const budget = form.budget
    if (budget !== '' && (Number.isNaN(Number(budget)) || Number(budget) < 0)) {
      return 'Budget must be a positive number.'
    }
    return null
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const validationError = buildValidationError()
    if (validationError != null) {
      setSaveError(validationError)
      return
    }
    setSaveError(null)
    setSaveSuccess(null)
    setSaving(true)
    try {
      await saveRecommendationPreferences(currentUser.id, {
        skill_level: form.skill_level || null,
        playing_style: form.playing_style || null,
        preferred_weight_grams: form.preferred_weight_grams !== '' ? Number(form.preferred_weight_grams) : null,
        control_power_preference: form.control_power_preference !== '' ? Number(form.control_power_preference) : null,
        budget: form.budget !== '' ? Number(form.budget) : null,
      })
      setSaveSuccess('Your preferences have been saved.')
    } catch (error) {
      setSaveError(describeSupabaseError(error))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="container page">
      <h1 className="page__title">Recommendation preferences</h1>
      <p className="page__intro">
        These preferences help us recommend the right paddles and equipment for you.
      </p>

      {loadError != null ? <FormError message={loadError} /> : null}

      <form className="profile-form" onSubmit={handleSubmit}>
        <div className="form-field">
          <label className="form-field__label" htmlFor="prefs-skill-level">
            Skill level
          </label>
          <select
            className="form-field__input"
            id="prefs-skill-level"
            value={form.skill_level}
            onChange={(event) => updateField('skill_level')(event.target.value)}
          >
            <option value="">Not set</option>
            {SKILL_LEVELS.map((level) => (
              <option key={level.value} value={level.value}>
                {level.label}
              </option>
            ))}
          </select>
        </div>
        <div className="form-field">
          <label className="form-field__label" htmlFor="prefs-playing-style">
            Playing style
          </label>
          <select
            className="form-field__input"
            id="prefs-playing-style"
            value={form.playing_style}
            onChange={(event) => updateField('playing_style')(event.target.value)}
          >
            <option value="">Not set</option>
            {PLAYING_STYLES.map((style) => (
              <option key={style.value} value={style.value}>
                {style.label}
              </option>
            ))}
          </select>
        </div>
        <div className="form-field">
          <label className="form-field__label" htmlFor="prefs-weight">
            Preferred paddle weight (grams)
          </label>
          <input
            className="form-field__input"
            id="prefs-weight"
            type="number"
            min={150}
            max={400}
            step={1}
            placeholder="150–400"
            value={form.preferred_weight_grams}
            onChange={(event) => updateField('preferred_weight_grams')(event.target.value)}
          />
          <p className="form-field__hint">Leave blank if you have no preference.</p>
        </div>
        <div className="form-field">
          <label className="form-field__label" htmlFor="prefs-control-power">
            Control vs. power (1–10)
          </label>
          <input
            className="form-field__input"
            id="prefs-control-power"
            type="number"
            min={1}
            max={10}
            step={1}
            placeholder="1 = control, 10 = power"
            value={form.control_power_preference}
            onChange={(event) => updateField('control_power_preference')(event.target.value)}
          />
        </div>
        <div className="form-field">
          <label className="form-field__label" htmlFor="prefs-budget">
            Budget (PHP)
          </label>
          <input
            className="form-field__input"
            id="prefs-budget"
            type="number"
            min={0}
            step="0.01"
            placeholder="e.g. 5000"
            value={form.budget}
            onChange={(event) => updateField('budget')(event.target.value)}
          />
          <p className="form-field__hint">Leave blank if you have no budget limit.</p>
        </div>
        {saveError != null ? <FormError message={saveError} /> : null}
        {saveSuccess != null ? <Alert variant="success" message={saveSuccess} /> : null}
        <SubmitButton loading={saving} loadingLabel="Saving…">
          Save preferences
        </SubmitButton>
      </form>
    </div>
  )
}
