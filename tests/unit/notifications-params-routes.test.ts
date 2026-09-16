import { describe, expect, it } from 'vitest'
import {
  parseNotificationSearch,
  serializeNotificationSearch,
} from '../../src/features/notifications/notifications-params'
import { getNotificationPath } from '../../src/features/notifications/notification-routes'
import { makeNotification } from '../utils/notifications'

describe('notification URL state', () => {
  it('uses safe defaults and omits them when serialized', () => {
    expect(parseNotificationSearch(new URLSearchParams())).toEqual({
      read: 'all',
      type: 'all',
      page: 1,
    })
    expect(serializeNotificationSearch({ read: 'all', type: 'all', page: 1 }).toString()).toBe('')
  })

  it('round trips supported database-side filters and pagination', () => {
    const state = { read: 'unread' as const, type: 'dispute' as const, page: 3 }
    expect(parseNotificationSearch(serializeNotificationSearch(state))).toEqual(state)
  })

  it('rejects malformed read, type, and page values', () => {
    expect(parseNotificationSearch(new URLSearchParams('read=private&type=payment&page=-8'))).toEqual({
      read: 'all',
      type: 'all',
      page: 1,
    })
  })
})

describe('trusted notification routes', () => {
  it.each([
    ['buyer_order', '/orders/order-1'],
    ['seller_order', '/seller/orders/order-1'],
    ['inquiry', '/inquiries/order-1'],
    ['buyer_dispute', '/disputes/order-1'],
    ['seller_dispute', '/seller/disputes/order-1'],
    ['listing', '/marketplace/order-1'],
  ])('maps %s only to its allowlisted internal route', (type, expected) => {
    expect(getNotificationPath(makeNotification({ related_entity_type: type }))).toBe(expected)
  })

  it('maps non-detail seller destinations without trusting an entity id', () => {
    expect(getNotificationPath(makeNotification({ related_entity_type: 'seller_reviews' }))).toBe('/seller/reviews')
    expect(getNotificationPath(makeNotification({ related_entity_type: 'seller_status' }))).toBe('/seller/status')
  })

  it('never treats unknown database text as a destination', () => {
    expect(getNotificationPath(makeNotification({ related_entity_type: 'https://evil.example' }))).toBeNull()
    expect(getNotificationPath(makeNotification({ related_entity_type: 'admin_dispute' }))).toBeNull()
  })

  it('does not build detail routes without an entity id', () => {
    expect(getNotificationPath(makeNotification({ related_entity_id: null }))).toBeNull()
  })
})
