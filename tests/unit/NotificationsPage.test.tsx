import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import NotificationsPage from '../../src/pages/account/NotificationsPage'
import { getNotifications } from '../../src/features/notifications/notifications.service'
import { createNotificationsValue, makeNotification, renderWithNotifications } from '../utils/notifications'

vi.mock('../../src/features/notifications/notifications.service', () => ({
  getNotifications: vi.fn(),
}))

const mockedGetNotifications = vi.mocked(getNotifications)

function LocationProbe() {
  const location = useLocation()
  return <output aria-label="location">{location.pathname}{location.search}</output>
}

function renderPage(
  path = '/notifications',
  overrides: Parameters<typeof createNotificationsValue>[0] = {},
) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      {renderWithNotifications(
        <><NotificationsPage /><LocationProbe /></>,
        createNotificationsValue(overrides),
      )}
    </MemoryRouter>,
  )
}

function pageResult(items = [makeNotification()], total = items.length) {
  return {
    data: {
      items,
      page: 1,
      pageSize: 10,
      total,
      totalPages: Math.ceil(total / 10),
    },
    error: null,
  }
}

describe('NotificationsPage', () => {
  beforeEach(() => mockedGetNotifications.mockReset())

  it('keeps the page heading visible while loading', async () => {
    let finish!: (value: ReturnType<typeof pageResult>) => void
    mockedGetNotifications.mockReturnValue(new Promise((resolve) => { finish = resolve }))
    renderPage()
    expect(screen.getByRole('heading', { name: 'Notifications' })).toBeInTheDocument()
    expect(screen.getByRole('status', { name: 'Loading notifications...' })).toBeInTheDocument()
    finish(pageResult())
    expect(await screen.findByText('New order')).toBeInTheDocument()
  })

  it('renders a paginated result and trusted notification rows', async () => {
    mockedGetNotifications.mockResolvedValue(pageResult([makeNotification()], 11))
    renderPage()
    expect(await screen.findByText('Showing 1 of 11 notifications')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    expect(screen.getByLabelText('location')).toHaveTextContent('/notifications?page=2')
  })

  it('stores read and type filters in the URL and resets pagination', async () => {
    mockedGetNotifications.mockResolvedValue(pageResult())
    renderPage('/notifications?page=4')
    await screen.findByText('New order')
    fireEvent.change(screen.getByLabelText('Read status'), { target: { value: 'unread' } })
    await waitFor(() => expect(screen.getByLabelText('location')).toHaveTextContent('/notifications?read=unread'))
    fireEvent.change(screen.getByLabelText('Update type'), { target: { value: 'order' } })
    await waitFor(() => expect(screen.getByLabelText('location')).toHaveTextContent('read=unread&type=order'))
  })

  it('marks one through the provider and refreshes the shared summary', async () => {
    mockedGetNotifications.mockResolvedValue(pageResult())
    const markRead = vi.fn(async () => ({ error: null }))
    const refreshSummary = vi.fn(async () => undefined)
    renderPage('/notifications', { markRead, refreshSummary, unreadCount: 1 })
    await screen.findByText('New order')
    fireEvent.click(screen.getByRole('button', { name: 'Mark as read' }))
    await waitFor(() => expect(markRead).toHaveBeenCalledWith('notification-1'))
    expect(refreshSummary).toHaveBeenCalledTimes(1)
  })

  it('renders filtered and unfiltered empty states with recovery actions', async () => {
    mockedGetNotifications.mockResolvedValue(pageResult([]))
    const { unmount } = renderPage('/notifications?read=unread')
    expect(await screen.findByRole('heading', { name: "You're all caught up" })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Clear filters' })).toBeInTheDocument()
    unmount()

    mockedGetNotifications.mockResolvedValue(pageResult([]))
    renderPage()
    expect(await screen.findByRole('heading', { name: 'No notifications yet' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument()
  })

  it('shows friendly load errors and retries', async () => {
    mockedGetNotifications.mockResolvedValueOnce({ data: null, error: new Error('raw RLS detail') })
      .mockResolvedValueOnce(pageResult())
    renderPage()
    expect(await screen.findByRole('alert')).toHaveTextContent('We could not load your notifications')
    expect(screen.queryByText(/raw RLS detail/i)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('New order')).toBeInTheDocument()
  })
})
