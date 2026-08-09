import { useState, type ChangeEvent } from 'react'

interface PasswordFieldProps {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  autoComplete?: string
  error?: string | null
  hint?: string
  required?: boolean
  disabled?: boolean
}

export default function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
  error,
  hint,
  required = false,
  disabled = false,
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(false)
  const errorId = `${id}-error`
  const hintId = `${id}-hint`
  const toggleId = `${id}-toggle`
  const describedBy = [error ? errorId : null, hint && !error ? hintId : null]
    .filter(Boolean)
    .join(' ') || undefined

  function handleToggle(event: ChangeEvent<HTMLInputElement>) {
    setVisible(event.target.checked)
  }

  return (
    <div className="form-field">
      <label className="form-field__label" htmlFor={id}>
        {label}
        {required ? <span className="form-field__required"> *</span> : null}
      </label>
      <div className="password-field">
        <input
          className="form-field__input password-field__input"
          id={id}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoComplete={autoComplete}
          required={required}
          disabled={disabled}
          aria-invalid={error != null ? true : undefined}
          aria-describedby={describedBy}
        />
        <label className="password-field__toggle" htmlFor={toggleId}>
          <input
            id={toggleId}
            className="password-field__toggle-input"
            type="checkbox"
            checked={visible}
            onChange={handleToggle}
          />
          <span>{visible ? 'Hide' : 'Show'}</span>
        </label>
      </div>
      {hint != null && error == null ? (
        <p className="form-field__hint" id={hintId}>
          {hint}
        </p>
      ) : null}
      {error != null ? (
        <p className="form-field__error" id={errorId}>
          {error}
        </p>
      ) : null}
    </div>
  )
}
