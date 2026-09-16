import type { ReactNode } from 'react'
import {
  NotificationsContext,
  type NotificationsContextValue,
} from '../../src/features/notifications/notifications-context'
import type { MarketplaceNotification } from '../../src/features/notifications/notifications.types'

export function makeNotification(
  overrides: Partial<MarketplaceNotification> = {},
): MarketplaceNotification {
  return {
    actor_id: 'actor-1',
    created_at: '2026-09-13T00:00:00.000Z',
    event_key: 'order.created:notification-1',
    event_name: 'order.created',
    id: 'notification-1',
    is_read: false,
    message: 'Order PPB-TEST is awaiting your confirmation.',
    recipient_id: 'user-1',
    related_entity_id: 'order-1',
    related_entity_type: 'seller_order',
    title: 'New order',
    type: 'order',
    ...overrides,
  }
}

export function createNotificationsValue(
  overrides: Partial<NotificationsContextValue> = {},
): NotificationsContextValue {
  return {
    latestNotifications: [],
    unreadCount: 0,
    summaryLoading: false,
    summaryError: null,
    markingIds: new Set(),
    markingAll: false,
    refreshSummary: async () => undefined,
    markRead: async () => ({ error: null }),
    markAllRead: async () => ({ error: null }),
    ...overrides,
  }
}

export function renderWithNotifications(
  children: ReactNode,
  value: NotificationsContextValue = createNotificationsValue(),
) {
  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>
}
