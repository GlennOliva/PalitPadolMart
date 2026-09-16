import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import Alert from '../common/Alert'
import LoadingState from '../common/LoadingState'
import { useNotifications } from '../../features/notifications/notifications-context'
import NotificationList from './NotificationList'

interface NotificationBellProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export default function NotificationBell({ open, onOpenChange }: NotificationBellProps) {
  const {
    latestNotifications,
    unreadCount,
    summaryLoading,
    summaryError,
    markingIds,
    markingAll,
    refreshSummary,
    markRead,
    markAllRead,
  } = useNotifications()
  const [mutationError, setMutationError] = useState<string | null>(null)
  const location = useLocation()
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return

    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) onOpenChange(false)
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      onOpenChange(false)
      buttonRef.current?.focus()
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [onOpenChange, open])

  useEffect(() => {
    onOpenChange(false)
  }, [location.pathname, onOpenChange])

  async function handleMarkRead(notificationId: string) {
    setMutationError(null)
    const result = await markRead(notificationId)
    if (result.error != null) setMutationError(result.error.message)
  }

  async function handleMarkAllRead() {
    setMutationError(null)
    const result = await markAllRead()
    if (result.error != null) setMutationError(result.error.message)
  }

  const accessibleLabel = unreadCount > 0
    ? `Notifications, ${unreadCount} unread`
    : 'Notifications'

  return (
    <div ref={rootRef} className="notification-center">
      <button
        ref={buttonRef}
        type="button"
        className="notification-trigger"
        aria-label={accessibleLabel}
        aria-expanded={open}
        aria-controls="notification-dropdown"
        onClick={() => {
          const nextOpen = !open
          onOpenChange(nextOpen)
          if (nextOpen) void refreshSummary()
        }}
      >
        <svg className="notification-trigger__icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
        </svg>
        {unreadCount > 0 ? (
          <span className="notification-badge" aria-hidden="true">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <section
          id="notification-dropdown"
          className="notification-dropdown glass--strong"
          aria-labelledby="notification-dropdown-title"
        >
          <div className="notification-dropdown__header">
            <div>
              <p className="eyebrow">Latest activity</p>
              <h2 id="notification-dropdown-title">Notifications</h2>
            </div>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              disabled={unreadCount === 0 || markingAll}
              onClick={() => void handleMarkAllRead()}
            >
              {markingAll ? 'Marking...' : 'Mark all read'}
            </button>
          </div>
          <div className="notification-dropdown__body">
            {mutationError != null ? <Alert variant="error" message={mutationError} /> : null}
            {summaryLoading && latestNotifications.length === 0 ? (
              <LoadingState label="Loading notifications..." />
            ) : summaryError != null ? (
              <div className="notification-state">
                <Alert variant="error" message={summaryError} />
                <button type="button" className="btn btn--secondary btn--sm" onClick={() => void refreshSummary()}>
                  Try again
                </button>
              </div>
            ) : latestNotifications.length === 0 ? (
              <div className="notification-state">
                <strong>No notifications yet</strong>
                <span>Marketplace updates will appear here.</span>
              </div>
            ) : (
              <NotificationList
                notifications={latestNotifications.slice(0, 5)}
                compact
                markingIds={markingIds}
                onMarkRead={(id) => void handleMarkRead(id)}
              />
            )}
          </div>
          <div className="notification-dropdown__footer">
            <Link to="/notifications" onClick={() => onOpenChange(false)}>
              View all notifications
            </Link>
          </div>
        </section>
      ) : null}
    </div>
  )
}
