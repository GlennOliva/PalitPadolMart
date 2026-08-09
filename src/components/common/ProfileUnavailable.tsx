interface ProfileUnavailableProps {
  error: string | null
  onRetry: () => void
}

export default function ProfileUnavailable({
  error,
  onRetry,
}: ProfileUnavailableProps) {
  return (
    <div className="empty-state" role="alert">
      <h1 className="empty-state__title">Your profile is not available</h1>
      <p className="empty-state__body">
        {error ?? 'We could not find a profile for your account.'} Your profile
        is usually created automatically when you sign up. If the problem
        persists, please contact support.
      </p>
      <button type="button" className="btn" onClick={onRetry}>
        Try again
      </button>
    </div>
  )
}
