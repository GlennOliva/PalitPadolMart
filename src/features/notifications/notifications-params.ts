import {
  NOTIFICATION_TYPES,
  type NotificationReadFilter,
  type NotificationSearchState,
  type NotificationType,
} from './notifications.types'

const READ_FILTERS: NotificationReadFilter[] = ['all', 'unread', 'read']

export const DEFAULT_NOTIFICATION_SEARCH: NotificationSearchState = {
  read: 'all',
  type: 'all',
  page: 1,
}

export function parseNotificationSearch(params: URLSearchParams): NotificationSearchState {
  const readValue = params.get('read')
  const typeValue = params.get('type')
  const pageValue = Number(params.get('page'))

  return {
    read: READ_FILTERS.includes(readValue as NotificationReadFilter)
      ? (readValue as NotificationReadFilter)
      : 'all',
    type: NOTIFICATION_TYPES.includes(typeValue as NotificationType)
      ? (typeValue as NotificationType)
      : 'all',
    page: Number.isSafeInteger(pageValue) && pageValue > 0 ? pageValue : 1,
  }
}

export function serializeNotificationSearch(state: NotificationSearchState): URLSearchParams {
  const params = new URLSearchParams()
  if (state.read !== 'all') params.set('read', state.read)
  if (state.type !== 'all') params.set('type', state.type)
  if (state.page > 1) params.set('page', String(state.page))
  return params
}
