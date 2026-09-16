import { createContext, useContext } from 'react'
import type { MarketplaceNotification } from './notifications.types'

export interface NotificationsContextValue {
  latestNotifications: MarketplaceNotification[]
  unreadCount: number
  summaryLoading: boolean
  summaryError: string | null
  markingIds: Set<string>
  markingAll: boolean
  refreshSummary: () => Promise<void>
  markRead: (notificationId: string) => Promise<{ error: Error | null }>
  markAllRead: () => Promise<{ error: Error | null }>
}

export const NotificationsContext = createContext<NotificationsContextValue | null>(null)

export function useNotifications() {
  const context = useContext(NotificationsContext)
  if (context == null) {
    throw new Error('useNotifications must be used within a NotificationsProvider')
  }
  return context
}
