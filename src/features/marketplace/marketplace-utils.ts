import type {
  ListingCondition,
  ListingImageSummary,
  ListingStatus,
} from './marketplace.types'

export function isPubliclyVisible(listing: {
  listing_status: ListingStatus
  quantity: number
}): boolean {
  return listing.listing_status === 'active' && listing.quantity > 0
}

export function formatListingStatus(status: ListingStatus): string {
  const labels: Record<ListingStatus, string> = {
    draft: 'Draft',
    active: 'Active',
    sold: 'Sold',
    archived: 'Archived',
    removed: 'Removed',
  }
  return labels[status]
}

export function formatListingCondition(condition: ListingCondition): string {
  const labels: Record<ListingCondition, string> = {
    new: 'New',
    like_new: 'Like new',
    used: 'Used',
    heavily_used: 'Heavily used',
  }
  return labels[condition]
}

export function isPaddleCategorySlug(slug: string): boolean {
  return slug === 'paddles'
}

/**
 * Supabase can surface an embedded to-many relationship (like `listing_images`)
 * as `null` when the payload is null or a query returns no rows. Treat nullish
 * input as an empty collection so callers always get a sortable array.
 */
export function sortListingImages(
  images: ListingImageSummary[] | null | undefined,
): ListingImageSummary[] {
  return [...(images ?? [])].sort((a, b) => {
    if (a.is_primary !== b.is_primary) return a.is_primary ? -1 : 1
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order
    return a.id.localeCompare(b.id)
  })
}

export function primaryListingImage(
  images: ListingImageSummary[] | null | undefined,
): ListingImageSummary | null {
  return sortListingImages(images)[0] ?? null
}
