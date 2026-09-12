import { useId, useState } from 'react'
import {
  CONTROL_POWER_SCALE,
  PLAYING_STYLES,
  SKILL_LEVELS,
} from '../../features/recommendation/recommendation.types'
import type {
  PlayingStyle,
  RecommendationFormValues,
  SkillLevel,
} from '../../features/recommendation/recommendation.types'
import FormField from '../common/FormField'
import SubmitButton from '../common/SubmitButton'

const SKILL_LABELS: Record<SkillLevel, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
}

const STYLE_LABELS: Record<PlayingStyle, string> = {
  control: 'Control',
  power: 'Power',
  balanced: 'Balanced',
  all_court: 'All-court',
  spin: 'Spin',
}

const STYLE_HINTS: Record<PlayingStyle, string> = {
  control: 'Precision and placement',
  power: 'Speed and force',
  balanced: 'A bit of both',
  all_court: 'Versatile all-rounder',
  spin: 'Heavy spin and touch',
}

interface QuestionnaireFormProps {
  initialValues: RecommendationFormValues
  onSubmit: (values: RecommendationFormValues) => void
  submitting?: boolean
  /** Hide when showing a "retake" action on an existing profile. */
  onCancel?: () => void
}

interface ValidationErrors {
  skill_level?: string
  playing_style?: string
  control_power_preference?: string
  preferred_weight_grams?: string
  budget?: string
}

function parseOptionalNumber(value: string): number | null {
  const trimmed = value.trim()
  return trimmed === '' ? null : Number(trimmed)
}

function validate(values: RecommendationFormValues): ValidationErrors {
  const errors: ValidationErrors = {}
  if (values.skill_level === '') errors.skill_level = 'Choose your skill level.'
  if (values.playing_style === '') errors.playing_style = 'Choose your playing style.'
  if (values.control_power_preference === '') {
    errors.control_power_preference = 'Choose where you lean between control and power.'
  }

  const weight = parseOptionalNumber(values.preferred_weight_grams)
  if (values.preferred_weight_grams.trim() !== '' && (weight == null || weight < 150 || weight > 400)) {
    errors.preferred_weight_grams = 'Enter a weight between 150 and 400 grams.'
  }

  const budget = parseOptionalNumber(values.budget)
  if (values.budget.trim() !== '' && (budget == null || budget < 0)) {
    errors.budget = 'Enter a valid budget, or leave it blank.'
  }

  return errors
}

/**
 * The paddle recommendation questionnaire (MASTER_BUILD_SPEC §15): skill
 * level, playing style, control vs power, preferred weight, and budget.
 */
export default function QuestionnaireForm({
  initialValues,
  onSubmit,
  submitting = false,
  onCancel,
}: QuestionnaireFormProps) {
  const [values, setValues] = useState<RecommendationFormValues>(initialValues)
  const [errors, setErrors] = useState<ValidationErrors>({})

  const skillGroupId = useId()
  const styleGroupId = useId()
  const balanceGroupId = useId()
  const balanceErrorId = useId()

  const set = (field: keyof RecommendationFormValues, value: string) => {
    setValues((current) => ({ ...current, [field]: value }))
    setErrors((current) => ({ ...current, [field]: undefined }))
  }

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    const nextErrors = validate(values)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length === 0) {
      onSubmit(values)
    }
  }

  return (
    <form className="questionnaire" onSubmit={handleSubmit} noValidate>
      <fieldset className="q-field">
        <legend className="q-field__legend" id={skillGroupId}>
          Skill level <span className="q-field__required">*</span>
        </legend>
        <div className="q-pills" role="radiogroup" aria-labelledby={skillGroupId}>
          {SKILL_LEVELS.map((level) => (
            <span key={level}>
              <input
                type="radio"
                id={`${skillGroupId}-${level}`}
                name="skill_level"
                className="filter-pill__input"
                checked={values.skill_level === level}
                onChange={() => set('skill_level', level)}
              />
              <label className="filter-pill" htmlFor={`${skillGroupId}-${level}`}>
                {SKILL_LABELS[level]}
              </label>
            </span>
          ))}
        </div>
        {errors.skill_level != null ? (
          <p className="form-field__error">{errors.skill_level}</p>
        ) : null}
      </fieldset>

      <fieldset className="q-field">
        <legend className="q-field__legend" id={styleGroupId}>
          Playing style <span className="q-field__required">*</span>
        </legend>
        <div className="q-style-grid" role="radiogroup" aria-labelledby={styleGroupId}>
          {PLAYING_STYLES.map((style) => (
            <span key={style}>
              <input
                type="radio"
                id={`${styleGroupId}-${style}`}
                name="playing_style"
                className="filter-pill__input"
                checked={values.playing_style === style}
                onChange={() => set('playing_style', style)}
              />
              <label className="filter-pill q-style" htmlFor={`${styleGroupId}-${style}`}>
                <span className="q-style__name">{STYLE_LABELS[style]}</span>
                <span className="q-style__hint">{STYLE_HINTS[style]}</span>
              </label>
            </span>
          ))}
        </div>
        {errors.playing_style != null ? (
          <p className="form-field__error">{errors.playing_style}</p>
        ) : null}
      </fieldset>

      <fieldset className="q-field">
        <legend className="q-field__legend" id={balanceGroupId}>
          Control vs power <span className="q-field__required">*</span>
        </legend>
        <p className="q-scale__ends">
          <span>More control</span>
          <span>More power</span>
        </p>
        <div className="q-scale" role="radiogroup" aria-labelledby={balanceGroupId}>
          {CONTROL_POWER_SCALE.map((value) => (
            <span key={value}>
              <input
                type="radio"
                id={`${balanceGroupId}-${value}`}
                name="control_power_preference"
                className="filter-pill__input"
                checked={values.control_power_preference === String(value)}
                onChange={() => set('control_power_preference', String(value))}
              />
              <label className="filter-pill q-scale__step" htmlFor={`${balanceGroupId}-${value}`}>
                {value}
              </label>
            </span>
          ))}
        </div>
        <p className="q-scale__middle" aria-hidden="true">
          Balanced
        </p>
        {errors.control_power_preference != null ? (
          <p className="form-field__error" id={balanceErrorId}>
            {errors.control_power_preference}
          </p>
        ) : null}
      </fieldset>

      <div className="q-grid">
        <FormField
          id="preferred-weight"
          label="Preferred weight (grams)"
          value={values.preferred_weight_grams}
          onChange={(value) => set('preferred_weight_grams', value)}
          type="text"
          inputMode="numeric"
          placeholder="e.g. 230"
          hint="Optional. Most paddles weigh 190–260g."
          error={errors.preferred_weight_grams}
        />
        <FormField
          id="budget"
          label="Budget (₱)"
          value={values.budget}
          onChange={(value) => set('budget', value)}
          type="text"
          inputMode="numeric"
          placeholder="e.g. 5000"
          hint="Optional. Leave blank to include every price."
          error={errors.budget}
        />
      </div>

      <div className="questionnaire__actions">
        {onCancel != null ? (
          <button type="button" className="btn btn--ghost" onClick={onCancel}>
            Cancel
          </button>
        ) : null}
        <SubmitButton loading={submitting} loadingLabel="Finding matches…">
          Find my paddles
        </SubmitButton>
      </div>
    </form>
  )
}
