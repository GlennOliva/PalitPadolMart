import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import Alert from '../../components/common/Alert'
import EmptyState from '../../components/common/EmptyState'
import LoadingState from '../../components/common/LoadingState'
import PageHeader from '../../components/common/PageHeader'
import Pagination from '../../components/marketplace/Pagination'
import NotificationList from '../../components/notifications/NotificationList'
import { useNotifications } from '../../features/notifications/notifications-context'
import {
  DEFAULT_NOTIFICATION_SEARCH,
  parseNotificationSearch,
  serializeNotificationSearch,
} from '../../features/notifications/notifications-params'
import { getNotifications } from '../../features/notifications/notifications.service'
import type {
  NotificationPageResult,
  NotificationReadFilter,
  NotificationType,
} from '../../features/notifications/notifications.types'

const TYPE_OPTIONS: Array<{ value: NotificationType | 'all'; label: string }> = [
  { value: 'all', label: 'All types' },
  { value: 'order', label: 'Orders' },
  { value: 'inquiry', label: 'Inquiries' },
  { value: 'dispute', label: 'Disputes' },
  { value: 'review', label: 'Reviews' },
  { value: 'report', label: 'Reports' },
  { value: 'system', label: 'Account' },
]

export default function NotificationsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const searchKey = useMemo(() => searchParams.toString(), [searchParams])
  const state = useMemo(
    () => parseNotificationSearch(new URLSearchParams(searchKey)),
    [searchKey],
  )
  const { unreadCount, markingIds, markingAll, markRead, markAllRead, refreshSummary } = useNotifications()
  const [result, setResult] = useState<NotificationPageResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [mutationError, setMutationError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)
    void getNotifications(state).then(({ data, error: loadError }) => {
      if (!active) return
      if (loadError != null || data == null) {
        setError('We could not load your notifications. Please try again.')
        setResult(null)
      } else if (data.totalPages > 0 && state.page > data.totalPages) {
        setSearchParams(serializeNotificationSearch({ ...state, page: 1 }), { replace: true })
      } else {
        setResult(data)
      }
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [refreshKey, setSearchParams, state])

  function updateFilters(patch: { read?: NotificationReadFilter; type?: NotificationType | 'all' }) {
    setSearchParams(serializeNotificationSearch({ ...state, ...patch, page: 1 }))
  }

  async function handleMarkRead(notificationId: string) {
    setMutationError(null)
    const update = await markRead(notificationId)
    if (update.error != null) {
      setMutationError(update.error.message)
      return
    }
    setResult((current) => current == null ? null : {
      ...current,
      items: current.items.map((notification) =>
        notification.id === notificationId ? { ...notification, is_read: true } : notification,
      ),
    })
    await refreshSummary()
    if (state.read === 'unread') setRefreshKey((current) => current + 1)
  }

  async function handleMarkAllRead() {
    setMutationError(null)
    const update = await markAllRead()
    if (update.error != null) {
      setMutationError(update.error.message)
      return
    }
    setResult((current) => current == null ? null : {
      ...current,
      items: current.items.map((notification) => ({ ...notification, is_read: true })),
    })
    if (state.read === 'unread') setRefreshKey((current) => current + 1)
  }

  const hasFilters = state.read !== 'all' || state.type !== 'all'
  const emptyTitle = state.read === 'unread'
    ? "You're all caught up"
    : state.read === 'read'
      ? 'No read notifications'
      : hasFilters
        ? 'No matching notifications'
        : 'No notifications yet'

  return (
    <div className="container page notifications-page">
      <PageHeader
        title="Notifications"
        intro="Review order, inquiry, review, dispute, and account updates in one place."
        actions={
          <button
            type="button"
            className="btn btn--secondary"
            disabled={unreadCount === 0 || markingAll}
            onClick={() => void handleMarkAllRead()}
          >
            {markingAll ? 'Marking all...' : 'Mark all as read'}
          </button>
        }
      />

      <div className="notification-filters" role="group" aria-label="Notification filters">
        <label>
          <span>Read status</span>
          <select
            value={state.read}
            onChange={(event) => updateFilters({ read: event.target.value as NotificationReadFilter })}
          >
            <option value="all">All notifications</option>
            <option value="unread">Unread</option>
            <option value="read">Read</option>
          </select>
        </label>
        <label>
          <span>Update type</span>
          <select
            value={state.type}
            onChange={(event) => updateFilters({ type: event.target.value as NotificationType | 'all' })}
          >
            {TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
      </div>

      {mutationError != null ? <Alert variant="error" message={mutationError} /> : null}

      {loading ? (
        <LoadingState label="Loading notifications..." />
      ) : error != null ? (
        <div className="notification-state">
          <Alert variant="error" message={error} />
          <button type="button" className="btn btn--secondary" onClick={() => setRefreshKey((current) => current + 1)}>
            Try again
          </button>
        </div>
      ) : result != null && result.items.length > 0 ? (
        <>
          <p className="notifications-result-count" aria-live="polite">
            Showing {result.items.length} of {result.total} {result.total === 1 ? 'notification' : 'notifications'}
          </p>
          <NotificationList
            notifications={result.items}
            markingIds={markingIds}
            onMarkRead={(id) => void handleMarkRead(id)}
          />
          <Pagination
            page={result.page}
            totalPages={result.totalPages}
            onPageChange={(page) => setSearchParams(serializeNotificationSearch({ ...state, page }))}
          />
        </>
      ) : (
        <EmptyState
          title={emptyTitle}
          body={hasFilters
            ? 'Try another filter to review more marketplace updates.'
            : 'Marketplace updates will appear here as you buy, sell, and communicate.'}
          action={hasFilters ? (
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => setSearchParams(serializeNotificationSearch(DEFAULT_NOTIFICATION_SEARCH))}
            >
              Clear filters
            </button>
          ) : undefined}
        />
      )}
    </div>
  )
}
