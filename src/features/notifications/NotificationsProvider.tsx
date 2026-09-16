import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { supabase } from '../../lib/supabase/client'
import { useAuth } from '../auth/useAuth'
import { markAllNotificationsRead, markNotificationRead, getNotificationSummary } from './notifications.service'
import { NotificationsContext } from './notifications-context'
import type { MarketplaceNotification } from './notifications.types'

const LOAD_ERROR = 'We could not load your notifications. Please try again.'
const UPDATE_ERROR = 'We could not update your notifications. Please try again.'

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [latestNotifications, setLatestNotifications] = useState<MarketplaceNotification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [summaryError, setSummaryError] = useState<string | null>(null)
  const [markingIds, setMarkingIds] = useState<Set<string>>(new Set())
  const [markingAll, setMarkingAll] = useState(false)
  const userIdRef = useRef<string | null>(null)
  const requestIdRef = useRef(0)

  const refreshSummary = useCallback(async () => {
    const userId = userIdRef.current
    const requestId = ++requestIdRef.current
    if (userId == null) {
      setLatestNotifications([])
      setUnreadCount(0)
      setSummaryError(null)
      setSummaryLoading(false)
      return
    }

    setSummaryLoading(true)
    setSummaryError(null)
    const { data, error } = await getNotificationSummary()
    if (requestId !== requestIdRef.current || userId !== userIdRef.current) return

    if (error != null || data == null) {
      setSummaryError(LOAD_ERROR)
    } else {
      setLatestNotifications(data.latest)
      setUnreadCount(data.unreadCount)
    }
    setSummaryLoading(false)
  }, [])

  useEffect(() => {
    userIdRef.current = user?.id ?? null
    requestIdRef.current += 1
    setMarkingIds(new Set())
    setMarkingAll(false)
    void refreshSummary()

    if (user == null) return

    const channel = supabase
      .channel(`notifications:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `recipient_id=eq.${user.id}`,
        },
        () => void refreshSummary(),
      )
      .subscribe()

    const onFocus = () => void refreshSummary()
    window.addEventListener('focus', onFocus)

    return () => {
      window.removeEventListener('focus', onFocus)
      void supabase.removeChannel(channel)
    }
  }, [refreshSummary, user])

  const markRead = useCallback(async (notificationId: string) => {
    const target = latestNotifications.find((notification) => notification.id === notificationId)
    const wasUnread = target?.is_read === false

    setMarkingIds((current) => new Set(current).add(notificationId))
    if (wasUnread) {
      setLatestNotifications((current) => current.map((notification) =>
        notification.id === notificationId ? { ...notification, is_read: true } : notification,
      ))
      setUnreadCount((current) => Math.max(0, current - 1))
    }

    const result = await markNotificationRead(notificationId)
    setMarkingIds((current) => {
      const next = new Set(current)
      next.delete(notificationId)
      return next
    })

    if (result.error != null) {
      if (wasUnread) {
        setLatestNotifications((current) => current.map((notification) =>
          notification.id === notificationId ? { ...notification, is_read: false } : notification,
        ))
        setUnreadCount((current) => current + 1)
      }
      return { error: new Error(UPDATE_ERROR) }
    }

    return { error: null }
  }, [latestNotifications])

  const markAllRead = useCallback(async () => {
    const previous = latestNotifications
    const previousCount = unreadCount
    setMarkingAll(true)
    setLatestNotifications((current) => current.map((notification) => ({ ...notification, is_read: true })))
    setUnreadCount(0)

    const result = await markAllNotificationsRead()
    setMarkingAll(false)
    if (result.error != null) {
      setLatestNotifications(previous)
      setUnreadCount(previousCount)
      return { error: new Error(UPDATE_ERROR) }
    }

    return { error: null }
  }, [latestNotifications, unreadCount])

  return (
    <NotificationsContext.Provider
      value={{
        latestNotifications,
        unreadCount,
        summaryLoading,
        summaryError,
        markingIds,
        markingAll,
        refreshSummary,
        markRead,
        markAllRead,
      }}
    >
      {children}
    </NotificationsContext.Provider>
  )
}
