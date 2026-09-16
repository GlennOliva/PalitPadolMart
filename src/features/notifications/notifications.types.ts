import type { Enums, Tables } from '../../types/database'

export type MarketplaceNotification = Tables<'notifications'>
export type NotificationType = Enums<'notification_type'>
export type NotificationReadFilter = 'all' | 'unread' | 'read'

export interface NotificationSearchState {
  read: NotificationReadFilter
  type: NotificationType | 'all'
  page: number
}

export interface NotificationPageResult {
  items: MarketplaceNotification[]
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export const NOTIFICATION_PREVIEW_LIMIT = 5
export const NOTIFICATIONS_PAGE_SIZE = 10

export const NOTIFICATION_TYPES: NotificationType[] = [
  'order',
  'inquiry',
  'dispute',
  'review',
  'report',
  'system',
]
