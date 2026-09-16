import type { MarketplaceNotification } from './notifications.types'

export function getNotificationPath(notification: MarketplaceNotification): string | null {
  const entityId = notification.related_entity_id

  switch (notification.related_entity_type) {
    case 'buyer_order':
      return entityId == null ? null : `/orders/${entityId}`
    case 'seller_order':
      return entityId == null ? null : `/seller/orders/${entityId}`
    case 'inquiry':
      return entityId == null ? null : `/inquiries/${entityId}`
    case 'buyer_dispute':
      return entityId == null ? null : `/disputes/${entityId}`
    case 'seller_dispute':
      return entityId == null ? null : `/seller/disputes/${entityId}`
    case 'seller_reviews':
      return '/seller/reviews'
    case 'seller_status':
      return '/seller/status'
    case 'listing':
      return entityId == null ? null : `/marketplace/${entityId}`
    default:
      return null
  }
}
