import type { PostgrestError } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase/client'
import { LISTING_DISPLAY_COLUMNS } from '../marketplace/marketplace.service'
import type { PublicListing } from '../marketplace/marketplace.types'
import type { FavoriteListing } from './favorites.types'

/**
 * Unique constraint violation. The favorites table has `unique (user_id,
 * listing_id)`, so a duplicate insert is expected when the user taps the heart
 * twice in a row; it is not an error.
 */
const UNIQUE_VIOLATION = '23505'

/** All of the caller's favorites, newest first, with available listing data. */
export async function getMyFavorites(
  userId: string,
): Promise<{ data: FavoriteListing[]; error: PostgrestError | null }> {
  const { data, error } = await supabase
    .from('favorites')
    .select(`id, listing_id, listing_title, created_at, listing:listings(${LISTING_DISPLAY_COLUMNS})`)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  const rows = (data ?? []) as Array<{
    id: string
    listing_id: string
    listing_title: string | null
    created_at: string
    listing: PublicListing | null
  }>
  return { data: rows, error }
}

/** The listing ids the caller has favorited (drives heart state in the UI). */
export async function getFavoriteListingIds(
  userId: string,
): Promise<{ data: string[]; error: PostgrestError | null }> {
  const { data, error } = await supabase
    .from('favorites')
    .select('listing_id')
    .eq('user_id', userId)
  return { data: (data ?? []).map((row) => row.listing_id), error }
}

/**
 * Adds a favorite. RLS forces `user_id = auth.uid()`, so a duplicate is the
 * only expected failure and is treated as success.
 */
export async function addFavorite(
  userId: string,
  listingId: string,
): Promise<{ error: PostgrestError | null }> {
  const { error } = await supabase.from('favorites').insert({
    user_id: userId,
    listing_id: listingId,
  })
  if (error != null && error.code !== UNIQUE_VIOLATION) return { error }
  return { error: null }
}

/** Removes the caller's favorite for a listing (scoped by user + listing). */
export async function removeFavorite(
  userId: string,
  listingId: string,
): Promise<{ error: PostgrestError | null }> {
  const { error } = await supabase
    .from('favorites')
    .delete()
    .eq('user_id', userId)
    .eq('listing_id', listingId)
  return { error }
}
