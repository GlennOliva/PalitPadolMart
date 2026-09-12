interface LoadingStateProps {
  label?: string
}

export default function LoadingState({ label = 'Loading…' }: LoadingStateProps) {
  return (
    <div className="loading-state" role="status" aria-label={label}>
      <span className="spinner" aria-hidden="true" />
      <span className="loading-state__label">{label}</span>
    </div>
  )
}
