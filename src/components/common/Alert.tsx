interface AlertProps {
  variant: 'success' | 'error' | 'info'
  message: string
}

export default function Alert({ variant, message }: AlertProps) {
  return (
    <div
      className={`alert alert--${variant}`}
      role={variant === 'error' ? 'alert' : 'status'}
      aria-live="polite"
    >
      {message}
    </div>
  )
}
