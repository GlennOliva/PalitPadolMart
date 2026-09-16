import { Link } from 'react-router-dom'
import { getNotificationPath } from '../../features/notifications/notification-routes'
import type { MarketplaceNotification } from '../../features/notifications/notifications.types'

const TYPE_LABELS: Record<MarketplaceNotification['type'], string> = {
  order: 'Order',
  inquiry: 'Inquiry',
  dispute: 'Dispute',
  review: 'Review',
  report: 'Report',
  system: 'Account',
}

interface NotificationItemProps {
  notification: MarketplaceNotification
  compact?: boolean
  marking?: boolean
  onMarkRead: (notificationId: string) => void
}

export default function NotificationItem({
  notification,
  compact = false,
  marking = false,
  onMarkRead,
}: NotificationItemProps) {
  const path = getNotificationPath(notification)
  const date = new Date(notification.created_at)
  const formattedDate = Number.isNaN(date.getTime())
    ? 'Recently'
    : new Intl.DateTimeFormat(undefined, {
        dateStyle: compact ? 'medium' : 'long',
        timeStyle: 'short',
      }).format(date)

  const content = (
    <>
      <span className="notification-item__eyebrow">
        <span className="notification-item__type">{TYPE_LABELS[notification.type]}</span>
        {!notification.is_read ? (
          <span className="notification-item__indicator">
            <span aria-hidden="true" />
            <span className="visually-hidden">Unread</span>
          </span>
        ) : null}
      </span>
      <strong className="notification-item__title">{notification.title}</strong>
      {notification.message != null ? (
        <span className="notification-item__message">{notification.message}</span>
      ) : null}
    </>
  )

  return (
    <li className={`notification-item${notification.is_read ? '' : ' notification-item--unread'}${compact ? ' notification-item--compact' : ''}`}>
      <div className="notification-item__content">
        {path == null ? (
          <div className="notification-item__copy">{content}</div>
        ) : (
          <Link
            className="notification-item__link"
            to={path}
            onClick={() => {
              if (!notification.is_read) onMarkRead(notification.id)
            }}
          >
            {content}
          </Link>
        )}
        <div className="notification-item__meta">
          <time dateTime={notification.created_at}>{formattedDate}</time>
          {!notification.is_read ? (
            <button
              type="button"
              className="notification-item__read"
              disabled={marking}
              onClick={() => onMarkRead(notification.id)}
            >
              {marking ? 'Marking...' : 'Mark as read'}
            </button>
          ) : null}
        </div>
      </div>
    </li>
  )
}
