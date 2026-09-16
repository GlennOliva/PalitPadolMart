import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

const { channel, removeChannel, getNotificationSummary, markNotificationRead, markAllNotificationsRead } = vi.hoisted(() => ({
  channel: vi.fn(),
  removeChannel: vi.fn(),
  getNotificationSummary: vi.fn(),
  markNotificationRead: vi.fn(),
  markAllNotificationsRead: vi.fn(),
}))

vi.mock('../../src/lib/supabase/client', () => ({
  supabase: { channel, removeChannel },
}))

vi.mock('../../src/features/notifications/notifications.service', () => ({
  getNotificationSummary,
  markNotificationRead,
  markAllNotificationsRead,
}))

import { NotificationsProvider } from '../../src/features/notifications/NotificationsProvider'
import { useNotifications } from '../../src/features/notifications/notifications-context'
import { createAuthValue, makeProfile, makeUser, renderWithAuth } from '../utils/auth'
import { makeNotification } from '../utils/notifications'

function Consumer() {
  const notifications = useNotifications()
  return (
    <div>
      <span>{notifications.unreadCount} unread</span>
      <span>{notifications.latestNotifications[0]?.is_read ? 'read' : 'unread'}</span>
      {notifications.summaryError != null ? <span>{notifications.summaryError}</span> : null}
      <button type="button" onClick={() => void notifications.markRead('notification-1')}>Read one</button>
      <button type="button" onClick={() => void notifications.markAllRead()}>Read all</button>
    </div>
  )
}

function renderProvider(auth = createAuthValue()) {
  return render(renderWithAuth(
    <NotificationsProvider><Consumer /></NotificationsProvider>,
    auth,
  ))
}

describe('NotificationsProvider', () => {
  beforeEach(() => {
    getNotificationSummary.mockReset()
    markNotificationRead.mockReset()
    markAllNotificationsRead.mockReset()
    channel.mockReset()
    removeChannel.mockReset()
    const subscription = {
      on: vi.fn(),
      subscribe: vi.fn(),
    }
    subscription.on.mockReturnValue(subscription)
    subscription.subscribe.mockReturnValue(subscription)
    channel.mockReturnValue(subscription)
  })

  it('does not query or subscribe for a guest', async () => {
    renderProvider()
    await waitFor(() => expect(screen.getByText('0 unread')).toBeInTheDocument())
    expect(getNotificationSummary).not.toHaveBeenCalled()
    expect(channel).not.toHaveBeenCalled()
  })

  it('loads summary state and subscribes only to the current recipient', async () => {
    getNotificationSummary.mockResolvedValue({
      data: { latest: [makeNotification()], unreadCount: 1 },
      error: null,
    })
    renderProvider(createAuthValue({
      status: 'authenticated',
      isAuthenticated: true,
      user: makeUser(),
      profile: makeProfile(),
    }))
    expect(await screen.findByText('1 unread')).toBeInTheDocument()
    expect(channel).toHaveBeenCalledWith('notifications:user-1')
  })

  it('optimistically marks one and keeps the count non-negative', async () => {
    getNotificationSummary.mockResolvedValue({
      data: { latest: [makeNotification()], unreadCount: 1 },
      error: null,
    })
    markNotificationRead.mockResolvedValue({ updated: true, error: null })
    renderProvider(createAuthValue({
      status: 'authenticated',
      isAuthenticated: true,
      user: makeUser(),
      profile: makeProfile(),
    }))
    await screen.findByText('1 unread')
    fireEvent.click(screen.getByRole('button', { name: 'Read one' }))
    expect(screen.getByText('0 unread')).toBeInTheDocument()
    expect(screen.getByText('read')).toBeInTheDocument()
    await waitFor(() => expect(markNotificationRead).toHaveBeenCalledWith('notification-1'))
  })

  it('rolls back a failed mark-all mutation with friendly state', async () => {
    getNotificationSummary.mockResolvedValue({
      data: { latest: [makeNotification()], unreadCount: 1 },
      error: null,
    })
    markAllNotificationsRead.mockResolvedValue({ updatedCount: 0, error: new Error('raw RLS') })
    renderProvider(createAuthValue({
      status: 'authenticated',
      isAuthenticated: true,
      user: makeUser(),
      profile: makeProfile(),
    }))
    await screen.findByText('1 unread')
    fireEvent.click(screen.getByRole('button', { name: 'Read all' }))
    await waitFor(() => expect(screen.getByText('1 unread')).toBeInTheDocument())
    expect(screen.getByText('unread')).toBeInTheDocument()
  })

  it('maps summary failures to friendly copy', async () => {
    getNotificationSummary.mockResolvedValue({ data: null, error: new Error('raw query') })
    renderProvider(createAuthValue({
      status: 'authenticated',
      isAuthenticated: true,
      user: makeUser(),
      profile: makeProfile(),
    }))
    expect(await screen.findByText('We could not load your notifications. Please try again.')).toBeInTheDocument()
    expect(screen.queryByText('raw query')).not.toBeInTheDocument()
  })
})
