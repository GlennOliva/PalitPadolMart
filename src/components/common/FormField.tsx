interface FormFieldProps {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  type?: 'text' | 'email' | 'tel'
  autoComplete?: string
  placeholder?: string
  error?: string | null
  hint?: string
  required?: boolean
  maxLength?: number
  disabled?: boolean
}

export default function FormField({
  id,
  label,
  value,
  onChange,
  type = 'text',
  autoComplete,
  placeholder,
  error,
  hint,
  required = false,
  maxLength,
  disabled = false,
}: FormFieldProps) {
  const errorId = `${id}-error`
  const hintId = `${id}-hint`
  const describedBy = [error ? errorId : null, hint && !error ? hintId : null]
    .filter(Boolean)
    .join(' ') || undefined

  return (
    <div className="form-field">
      <label className="form-field__label" htmlFor={id}>
        {label}
        {required ? <span className="form-field__required"> *</span> : null}
      </label>
      <input
        className="form-field__input"
        id={id}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete={autoComplete}
        placeholder={placeholder}
        required={required}
        maxLength={maxLength}
        disabled={disabled}
        aria-invalid={error != null ? true : undefined}
        aria-describedby={describedBy}
      />
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
