interface SubmitButtonProps {
  children: string
  loading?: boolean
  loadingLabel?: string
  disabled?: boolean
  onClick?: () => void
}

export default function SubmitButton({
  children,
  loading = false,
  loadingLabel = 'Please wait…',
  disabled = false,
  onClick,
}: SubmitButtonProps) {
  return (
    <button
      type="submit"
      className="btn btn--primary btn--block"
      disabled={disabled || loading}
      aria-busy={loading}
      onClick={onClick}
    >
      <span className="btn__label">
        {loading ? (
          <>
            <span className="spinner spinner--sm" aria-hidden="true" />
            {loadingLabel}
          </>
        ) : (
          children
        )}
      </span>
    </button>
  )
}
