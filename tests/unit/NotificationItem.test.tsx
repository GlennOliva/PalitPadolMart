import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import NotificationItem from '../../src/components/notifications/NotificationItem'
import { makeNotification } from '../utils/notifications'

describe('NotificationItem', () => {
  it('renders semantic unread status, time, and a trusted destination', () => {
    render(
      <MemoryRouter>
        <ul>
          <NotificationItem notification={makeNotification()} marking={false} onMarkRead={() => undefined} />
        </ul>
      </MemoryRouter>,
    )

    expect(screen.getByText('Unread')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /New order/i })).toHaveAttribute('href', '/seller/orders/order-1')
    expect(screen.getByText(/2026/).closest('time')).toHaveAttribute('datetime', '2026-09-13T00:00:00.000Z')
  })

  it('marks an unread row from its dedicated action', () => {
    const onMarkRead = vi.fn()
    render(
      <MemoryRouter>
        <ul><NotificationItem notification={makeNotification()} marking={false} onMarkRead={onMarkRead} /></ul>
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Mark as read' }))
    expect(onMarkRead).toHaveBeenCalledWith('notification-1')
  })

  it('marks during trusted navigation without nesting the action in the link', () => {
    const onMarkRead = vi.fn()
    render(
      <MemoryRouter>
        <ul><NotificationItem notification={makeNotification()} marking={false} onMarkRead={onMarkRead} /></ul>
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByRole('link', { name: /New order/i }))
    expect(onMarkRead).toHaveBeenCalledWith('notification-1')
    expect(screen.getByRole('button', { name: 'Mark as read' }).closest('a')).toBeNull()
  })

  it('omits read controls and unread signaling for read rows', () => {
    render(
      <MemoryRouter>
        <ul><NotificationItem notification={makeNotification({ is_read: true })} onMarkRead={() => undefined} /></ul>
      </MemoryRouter>,
    )
    expect(screen.queryByText('Unread')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Mark as read' })).not.toBeInTheDocument()
  })

  it('renders unknown targets as text and never as a link', () => {
    render(
      <MemoryRouter>
        <ul><NotificationItem notification={makeNotification({ related_entity_type: 'external_url' })} onMarkRead={() => undefined} /></ul>
      </MemoryRouter>,
    )
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(screen.getByText('New order')).toBeInTheDocument()
  })
})
