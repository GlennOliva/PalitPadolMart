interface StarRatingInputProps {
  id: string
  label: string
  value: number | undefined
  onChange: (value: number) => void
  error?: string
}

/**
 * Accessible 1–5 star picker. Native radio inputs inside a radiogroup keep
 * keyboard arrow-key support and announce each option.
 */
export default function StarRatingInput({
  id,
  label,
  value,
  onChange,
  error,
}: StarRatingInputProps) {
  return (
    <div className="form-field">
<span className="form-field__label" id={`${id}-label`}>
      {label}
      <span className="form-field__required"> *</span>
    </span>
      <div
        className="stars-input"
        role="radiogroup"
        aria-label={label}
        aria-invalid={error != null ? true : undefined}
      >
        {[1, 2, 3, 4, 5].map((star) => (
          <span key={star}>
            <input
              className="stars-input__radio"
              type="radio"
              id={`${id}-${star}`}
              name={id}
              value={star}
              checked={value === star}
              onChange={() => onChange(star)}
              aria-label={`${star} ${star === 1 ? 'star' : 'stars'}`}
            />
            <label
              className={value != null && star <= value ? 'stars-input__star stars-input__star--on' : 'stars-input__star'}
              htmlFor={`${id}-${star}`}
            >
              ★<span className="visually-hidden">{star} stars</span>
            </label>
          </span>
        ))}
      </div>
      {error != null ? <p className="form-field__error">{error}</p> : null}
    </div>
  )
}