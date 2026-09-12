import type { ReactNode } from 'react'

interface EmptyStateProps {
  title: string
  body?: string
  /** Optional call to action rendered below the body text. */
  action?: ReactNode
  className?: string
}

export default function EmptyState({
  title,
  body,
  action,
  className = '',
}: EmptyStateProps) {
  return (
    <div className={`empty-state ${className}`.trim()}>
      <h2 className="empty-state__title">{title}</h2>
      {body != null ? <p className="empty-state__body">{body}</p> : null}
      {action != null ? <div className="empty-state__action">{action}</div> : null}
    </div>
  )
}
