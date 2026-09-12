import type { Tables } from '../../types/database'
import type { PublicListing } from '../marketplace/marketplace.types'

export type Favorite = Tables<'favorites'>

/**
 * A favorite with its joined listing data. The listing embed comes back `null`
 * whenever RLS hides the row (archived/sold/removed listings are invisible to
 * buyers); the `listing_title` snapshot keeps the item identifiable anyway.
 */
export interface FavoriteListing {
  id: string
  listing_id: string
  listing_title: string | null
  created_at: string
  listing: PublicListing | null
}
