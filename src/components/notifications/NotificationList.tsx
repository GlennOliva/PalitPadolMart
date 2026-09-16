import type { MarketplaceNotification } from '../../features/notifications/notifications.types'
import NotificationItem from './NotificationItem'

interface NotificationListProps {
  notifications: MarketplaceNotification[]
  compact?: boolean
  markingIds: Set<string>
  onMarkRead: (notificationId: string) => void
}

export default function NotificationList({
  notifications,
  compact = false,
  markingIds,
  onMarkRead,
}: NotificationListProps) {
  return (
    <ul className={`notification-list${compact ? ' notification-list--compact' : ''}`}>
      {notifications.map((notification) => (
        <NotificationItem
          key={notification.id}
          notification={notification}
          compact={compact}
          marking={markingIds.has(notification.id)}
          onMarkRead={onMarkRead}
        />
      ))}
    </ul>
  )
}
