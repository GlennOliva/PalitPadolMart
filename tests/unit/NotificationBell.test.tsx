import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import NotificationBell from '../../src/components/notifications/NotificationBell'
import { createNotificationsValue, makeNotification, renderWithNotifications } from '../utils/notifications'

function renderBell(
  open: boolean,
  overrides: Parameters<typeof createNotificationsValue>[0] = {},
  onOpenChange = vi.fn(),
) {
  return {
    onOpenChange,
    ...render(
      <MemoryRouter>
        {renderWithNotifications(
          <NotificationBell open={open} onOpenChange={onOpenChange} />,
          createNotificationsValue(overrides),
        )}
      </MemoryRouter>,
    ),
  }
}

describe('NotificationBell', () => {
  it('announces the exact unread count while visually capping large counts', () => {
    renderBell(false, { unreadCount: 125 })
    expect(screen.getByRole('button', { name: 'Notifications, 125 unread' })).toBeInTheDocument()
    expect(screen.getByText('99+')).toHaveAttribute('aria-hidden', 'true')
  })

  it('opens as a disclosure, refreshes, and renders at most five newest rows', () => {
    const refreshSummary = vi.fn(async () => undefined)
    const notifications = Array.from({ length: 6 }, (_, index) => makeNotification({
      id: `notification-${index}`,
      event_key: `order.created:${index}`,
      title: `Update ${index}`,
    }))
    const { onOpenChange } = renderBell(false, { latestNotifications: notifications, refreshSummary })
    const trigger = screen.getByRole('button', { name: /Notifications/i })
    fireEvent.click(trigger)
    expect(onOpenChange).toHaveBeenCalledWith(true)
    expect(refreshSummary).toHaveBeenCalledTimes(1)

    renderBell(true, { latestNotifications: notifications })
    expect(screen.getAllByText(/Update \d/)).toHaveLength(5)
    expect(screen.getByRole('link', { name: 'View all notifications' })).toHaveAttribute('href', '/notifications')
  })

  it('marks one and all through owner-derived context actions', async () => {
    const markRead = vi.fn(async () => ({ error: null }))
    const markAllRead = vi.fn(async () => ({ error: null }))
    renderBell(true, {
      latestNotifications: [makeNotification()],
      unreadCount: 1,
      markRead,
      markAllRead,
    })
    fireEvent.click(screen.getByRole('button', { name: 'Mark as read' }))
    fireEvent.click(screen.getByRole('button', { name: 'Mark all read' }))
    await waitFor(() => expect(markRead).toHaveBeenCalledWith('notification-1'))
    expect(markAllRead).toHaveBeenCalledTimes(1)
  })

  it('closes on Escape and restores focus to the trigger', () => {
    const { onOpenChange } = renderBell(true, { latestNotifications: [makeNotification()] })
    onOpenChange.mockClear()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(screen.getByRole('button', { name: /Notifications/i })).toHaveFocus()
  })

  it('shows friendly load failure and retries without raw backend text', () => {
    const refreshSummary = vi.fn(async () => undefined)
    renderBell(true, {
      summaryError: 'We could not load your notifications. Please try again.',
      refreshSummary,
    })
    expect(screen.getByRole('alert')).toHaveTextContent('We could not load your notifications')
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(refreshSummary).toHaveBeenCalledTimes(1)
  })
})
