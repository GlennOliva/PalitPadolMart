import { supabase } from '../../lib/supabase/client'
import {
  NOTIFICATION_PREVIEW_LIMIT,
  NOTIFICATIONS_PAGE_SIZE,
  type MarketplaceNotification,
  type NotificationPageResult,
  type NotificationSearchState,
} from './notifications.types'

interface NotificationSummary {
  latest: MarketplaceNotification[]
  unreadCount: number
}

export async function getNotificationSummary(): Promise<{
  data: NotificationSummary | null
  error: Error | null
}> {
  const [latestResult, unreadResult] = await Promise.all([
    supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(NOTIFICATION_PREVIEW_LIMIT),
    supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('is_read', false),
  ])

  if (latestResult.error != null) return { data: null, error: latestResult.error }
  if (unreadResult.error != null) return { data: null, error: unreadResult.error }

  return {
    data: {
      latest: latestResult.data ?? [],
      unreadCount: unreadResult.count ?? 0,
    },
    error: null,
  }
}

export async function getNotifications(
  state: NotificationSearchState,
): Promise<{ data: NotificationPageResult | null; error: Error | null }> {
  const from = (state.page - 1) * NOTIFICATIONS_PAGE_SIZE
  const to = from + NOTIFICATIONS_PAGE_SIZE - 1
  let query = supabase
    .from('notifications')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(from, to)

  if (state.read === 'unread') query = query.eq('is_read', false)
  if (state.read === 'read') query = query.eq('is_read', true)
  if (state.type !== 'all') query = query.eq('type', state.type)

  const { data, error, count } = await query
  if (error != null) return { data: null, error }

  const total = count ?? 0
  return {
    data: {
      items: data ?? [],
      page: state.page,
      pageSize: NOTIFICATIONS_PAGE_SIZE,
      total,
      totalPages: Math.ceil(total / NOTIFICATIONS_PAGE_SIZE),
    },
    error: null,
  }
}

export async function markNotificationRead(notificationId: string) {
  const { data, error } = await supabase.rpc('mark_notification_read', {
    p_notification_id: notificationId,
  })
  return { updated: data ?? false, error }
}

export async function markAllNotificationsRead() {
  const { data, error } = await supabase.rpc('mark_all_notifications_read')
  return { updatedCount: data ?? 0, error }
}
