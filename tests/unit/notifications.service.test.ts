import { beforeEach, describe, expect, it, vi } from 'vitest'

const { from, rpc } = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }))

vi.mock('../../src/lib/supabase/client', () => ({ supabase: { from, rpc } }))

import {
  getNotifications,
  getNotificationSummary,
  markAllNotificationsRead,
  markNotificationRead,
} from '../../src/features/notifications/notifications.service'
import { makeNotification } from '../utils/notifications'

function makeQuery(result: object) {
  const query = {
    select: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    eq: vi.fn(),
    range: vi.fn(),
    then: (resolve: (value: object) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  }
  query.select.mockReturnValue(query)
  query.order.mockReturnValue(query)
  query.limit.mockReturnValue(query)
  query.eq.mockReturnValue(query)
  query.range.mockReturnValue(query)
  return query
}

describe('notifications.service', () => {
  beforeEach(() => {
    from.mockReset()
    rpc.mockReset()
  })

  it('loads only the five newest preview rows plus an exact unread count', async () => {
    const latest = makeQuery({ data: [makeNotification()], error: null })
    const unread = makeQuery({ data: null, count: 7, error: null })
    from.mockReturnValueOnce(latest).mockReturnValueOnce(unread)

    const result = await getNotificationSummary()
    expect(result.data).toEqual({ latest: [makeNotification()], unreadCount: 7 })
    expect(latest.order).toHaveBeenNthCalledWith(1, 'created_at', { ascending: false })
    expect(latest.order).toHaveBeenNthCalledWith(2, 'id', { ascending: false })
    expect(latest.limit).toHaveBeenCalledWith(5)
    expect(unread.select).toHaveBeenCalledWith('id', { count: 'exact', head: true })
    expect(unread.eq).toHaveBeenCalledWith('is_read', false)
  })

  it('returns the first summary query error without leaking a partial result', async () => {
    const failure = new Error('query failed')
    from.mockReturnValueOnce(makeQuery({ data: null, error: failure }))
      .mockReturnValueOnce(makeQuery({ data: null, count: 0, error: null }))
    expect(await getNotificationSummary()).toEqual({ data: null, error: failure })
  })

  it('applies read/type filters and database range pagination', async () => {
    const query = makeQuery({ data: [makeNotification()], count: 21, error: null })
    from.mockReturnValue(query)
    const result = await getNotifications({ read: 'unread', type: 'order', page: 2 })

    expect(query.range).toHaveBeenCalledWith(10, 19)
    expect(query.eq).toHaveBeenCalledWith('is_read', false)
    expect(query.eq).toHaveBeenCalledWith('type', 'order')
    expect(result.data).toMatchObject({ page: 2, pageSize: 10, total: 21, totalPages: 3 })
  })

  it('marks one notification through an owner-derived RPC only', async () => {
    rpc.mockResolvedValue({ data: true, error: null })
    expect(await markNotificationRead('notification-1')).toEqual({ updated: true, error: null })
    expect(rpc).toHaveBeenCalledWith('mark_notification_read', {
      p_notification_id: 'notification-1',
    })
  })

  it('marks all notifications without accepting a recipient id', async () => {
    rpc.mockResolvedValue({ data: 4, error: null })
    expect(await markAllNotificationsRead()).toEqual({ updatedCount: 4, error: null })
    expect(rpc).toHaveBeenCalledWith('mark_all_notifications_read')
  })
})
