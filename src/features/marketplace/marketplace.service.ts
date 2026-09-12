import type { PostgrestError } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase/client'
import { buildListingImagePath } from './listing-images'
import type {
  Brand,
  Category,
  Listing,
  ListingEditableFields,
  ListingImage,
  ListingImageSummary,
  ListingInsert,
  ListingStatus,
  PaddleAttributeInput,
  PaddleAttributes,
  PublicListing,
  PublicListingDetail,
  SellerListing,
} from './marketplace.types'
import { PRODUCT_IMAGES_BUCKET } from './marketplace.types'

export function toNullableText(value: string | null): string | null {
  const trimmed = value?.trim() ?? ''
  return trimmed.length > 0 ? trimmed : null
}

function toNullableInt(value: string): number | null {
  const trimmed = value.trim()
  if (trimmed.length === 0) return null
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : null
}

/** Shared display columns for public listing rows (grid, detail, favorites). */
export const LISTING_DISPLAY_COLUMNS = `
  id,
  title,
  description,
  price,
  listing_condition,
  quantity,
  city,
  province,
  pickup_available,
  delivery_available,
  created_at,
  category:categories ( id, name, slug ),
  brand:brands ( id, name ),
  seller:public_seller_profiles ( id, store_name ),
  images:listing_images ( id, url, storage_path, is_primary, sort_order )
`

function toListingInsert(sellerId: string, input: ListingEditableFields): ListingInsert {
  return {
    seller_id: sellerId,
    category_id: input.category_id,
    brand_id: toNullableText(input.brand_id),
    title: input.title.trim(),
    description: input.description.trim(),
    listing_condition: input.listing_condition,
    price: Number(input.price),
    quantity: Number(input.quantity),
    listing_status: input.listing_status,
    city: toNullableText(input.city),
    province: toNullableText(input.province),
    pickup_available: input.pickup_available,
    delivery_available: input.delivery_available,
  }
}

function toListingUpdate(input: ListingEditableFields) {
  return {
    category_id: input.category_id,
    brand_id: toNullableText(input.brand_id),
    title: input.title.trim(),
    description: input.description.trim(),
    listing_condition: input.listing_condition,
    price: Number(input.price),
    quantity: Number(input.quantity),
    listing_status: input.listing_status,
    city: toNullableText(input.city),
    province: toNullableText(input.province),
    pickup_available: input.pickup_available,
    delivery_available: input.delivery_available,
  }
}

function toPaddlePayload(listingId: string, input: PaddleAttributeInput) {
  return {
    listing_id: listingId,
    weight_grams: toNullableInt(input.weight_grams),
    weight_class: toNullableText(input.weight_class),
    control_score: toNullableInt(input.control_score),
    power_score: toNullableInt(input.power_score),
    skill_level: toNullableText(input.skill_level),
    playing_style: toNullableText(input.playing_style),
  }
}

// ---------------------------------------------------------------------------
// Listing normalization
// ---------------------------------------------------------------------------

/**
 * PostgREST can represent an embedded to-many relationship (e.g. a listing's
 * `listing_images`) as `null` when the payload is null or no rows match.
 * Normalize it to `[]` so UI code always receives a predictable array.
 */
function normalizeListingImages<T extends { images: ListingImageSummary[] | null }>(
  row: T,
): T & { images: ListingImageSummary[] } {
  return { ...row, images: row.images ?? [] }
}

// ---------------------------------------------------------------------------
// Reference data (categories and brands are database-managed, never hardcoded)
// ---------------------------------------------------------------------------

export async function getActiveCategories() {
  return supabase
    .from('categories')
    .select('*')
    .eq('is_active', true)
    .order('sort_order')
}

export async function getActiveBrands() {
  return supabase
    .from('brands')
    .select('*')
    .eq('is_active', true)
    .order('name')
}

// ---------------------------------------------------------------------------
// Public marketplace
// ---------------------------------------------------------------------------

/**
 * Public marketplace grid: only listings that are both active and in stock.
 * RLS already hides every non-active status from guests; quantity > 0 is the
 * availability half of the visibility rule.
 */
export async function getPublicListings(): Promise<{
  data: PublicListing[]
  error: PostgrestError | null
}> {
  const { data, error } = await supabase
    .from('listings')
    .select(LISTING_DISPLAY_COLUMNS)
    .eq('listing_status', 'active')
    .gt('quantity', 0)
    .order('created_at', { ascending: false })

  const rows = (data ?? []) as Array<PublicListing & { images: ListingImageSummary[] | null }>
  return { data: rows.map(normalizeListingImages), error }
}

/** Public product detail for one active, in-stock listing. */
export async function getPublicListing(
  listingId: string,
): Promise<{ data: PublicListingDetail | null; error: PostgrestError | null }> {
  const { data, error } = await supabase
    .from('listings')
    .select(`${LISTING_DISPLAY_COLUMNS}, paddle_attributes ( * )`)
    .eq('id', listingId)
    .eq('listing_status', 'active')
    .gt('quantity', 0)
    .maybeSingle()

  const row = (data ?? null) as (PublicListingDetail & {
    images: ListingImageSummary[] | null
  }) | null
  return { data: row == null ? null : normalizeListingImages(row), error }
}

// ---------------------------------------------------------------------------
// Seller listing management
// ---------------------------------------------------------------------------

/** The caller's own listings in any status, newest first. */
export async function getSellerListings(
  sellerId: string,
): Promise<{ data: SellerListing[]; error: PostgrestError | null }> {
  const { data, error } = await supabase
    .from('listings')
    .select(`${LISTING_DISPLAY_COLUMNS}, listing_status, paddle_attributes ( * )`)
    .eq('seller_id', sellerId)
    .order('created_at', { ascending: false })

  const rows = (data ?? []) as Array<SellerListing & { images: ListingImageSummary[] | null }>
  return { data: rows.map(normalizeListingImages), error }
}

/** One of the caller's own listings in any status. */
export async function getSellerListing(
  sellerId: string,
  listingId: string,
): Promise<{ data: SellerListing | null; error: PostgrestError | null }> {
  const { data, error } = await supabase
    .from('listings')
    .select(`${LISTING_DISPLAY_COLUMNS}, listing_status, paddle_attributes ( * )`)
    .eq('id', listingId)
    .eq('seller_id', sellerId)
    .maybeSingle()

  const row = (data ?? null) as (SellerListing & {
    images: ListingImageSummary[] | null
  }) | null
  return { data: row == null ? null : normalizeListingImages(row), error }
}

/** Creates a draft listing (status is normalized client-side to draft/active). */
export async function createListing(
  sellerId: string,
  input: ListingEditableFields,
): Promise<{ data: Listing | null; error: PostgrestError | null }> {
  const { data, error } = await supabase
    .from('listings')
    .insert(toListingInsert(sellerId, input))
    .select('*')
    .single()

  return { data: data ?? null, error }
}

/** Updates the caller's own listing, scoped by both id and seller id. */
export async function updateListing(
  sellerId: string,
  listingId: string,
  input: ListingEditableFields,
): Promise<{ data: Listing | null; error: PostgrestError | null }> {
  const { data, error } = await supabase
    .from('listings')
    .update(toListingUpdate(input))
    .eq('id', listingId)
    .eq('seller_id', sellerId)
    .select('*')
    .single()

  return { data: data ?? null, error }
}

async function setListingStatus(
  sellerId: string,
  listingId: string,
  listing_status: ListingStatus,
) {
  return supabase
    .from('listings')
    .update({ listing_status })
    .eq('id', listingId)
    .eq('seller_id', sellerId)
    .select('*')
    .single<Listing>()
}

/** Publish a draft, or take a listing back to draft (seller-scoped). */
export async function publishListing(sellerId: string, listingId: string) {
  return setListingStatus(sellerId, listingId, 'active')
}

/** Archive is the safe removal path — listings are never hard-deleted here. */
export async function archiveListing(sellerId: string, listingId: string) {
  return setListingStatus(sellerId, listingId, 'archived')
}

/** Marks a listing sold: zero stock and status sold (matches marketplace rules). */
export async function markListingSold(sellerId: string, listingId: string) {
  return supabase
    .from('listings')
    .update({ listing_status: 'sold', quantity: 0 })
    .eq('id', listingId)
    .eq('seller_id', sellerId)
    .select('*')
    .single<Listing>()
}

// ---------------------------------------------------------------------------
// Paddle attributes
// ---------------------------------------------------------------------------

export async function savePaddleAttributes(
  listingId: string,
  input: PaddleAttributeInput,
): Promise<{ data: PaddleAttributes | null; error: PostgrestError | null }> {
  const { data, error } = await supabase
    .from('paddle_attributes')
    .upsert(toPaddlePayload(listingId, input), { onConflict: 'listing_id' })
    .select('*')
    .single()

  return { data: data ?? null, error }
}

export async function removePaddleAttributes(listingId: string) {
  return supabase.from('paddle_attributes').delete().eq('listing_id', listingId)
}

// ---------------------------------------------------------------------------
// Listing images
// ---------------------------------------------------------------------------

/**
 * Uploads one photo to `marketplace-products/{sellerId}/{listingId}/…` and
 * records it. The first photo becomes the primary image and every photo is
 * numbered by sort_order. The suffix keeps retries of the same file unique.
 */
export async function uploadListingImage(
  sellerId: string,
  listingId: string,
  file: File,
  suffix: string = crypto.randomUUID(),
): Promise<{ data: ListingImage | null; error: Error | null }> {
  const path = buildListingImagePath(sellerId, listingId, file.name, suffix)
  const { error: uploadError } = await supabase.storage
    .from(PRODUCT_IMAGES_BUCKET)
    .upload(path, file, {
      upsert: false,
      contentType: file.type,
      cacheControl: '3600',
    })
  if (uploadError != null) return { data: null, error: uploadError }

  const { data: urlData } = supabase.storage
    .from(PRODUCT_IMAGES_BUCKET)
    .getPublicUrl(path)

  const { data: existing, error: existingError } = await supabase
    .from('listing_images')
    .select('id')
    .eq('listing_id', listingId)

  if (existingError != null) return { data: null, error: existingError }
  const existingImages = existing ?? []
  const isFirst = existingImages.length === 0
  const { data, error } = await supabase
    .from('listing_images')
    .insert({
      listing_id: listingId,
      storage_path: path,
      url: urlData.publicUrl,
      sort_order: existingImages.length,
      is_primary: isFirst,
    })
    .select('*')
    .single()

  return { data: data ?? null, error }
}

/**
 * Removes a photo from storage and the listing. If the removed photo was the
 * primary, the next photo is promoted so a listing always keeps exactly one
 * primary image while photos remain.
 */
export async function removeListingImage(
  listingId: string,
  imageId: string,
  storagePath: string | null,
): Promise<{ error: Error | null }> {
  if (storagePath != null) {
    const { error: removeError } = await supabase.storage
      .from(PRODUCT_IMAGES_BUCKET)
      .remove([storagePath])
    if (removeError != null) return { error: removeError }
  }

  const { error: deleteError } = await supabase
    .from('listing_images')
    .delete()
    .eq('id', imageId)
    .eq('listing_id', listingId)
  if (deleteError != null) return { error: deleteError }

  const { data: remaining } = await supabase
    .from('listing_images')
    .select('id, is_primary')
    .eq('listing_id', listingId)
    .order('sort_order')
  if (remaining == null) return { error: null }

  const hasPrimary = remaining.some((image) => image.is_primary)
  if (!hasPrimary && remaining.length > 0) {
    return setPrimaryListingImage(listingId, remaining[0].id)
  }
  return { error: null }
}

/**
 * Chooses the primary photo. The single-primary partial index requires the
 * old primary to be cleared first, so this runs as clear-then-set.
 */
export async function setPrimaryListingImage(
  listingId: string,
  imageId: string,
): Promise<{ error: PostgrestError | null }> {
  const { error: clearError } = await supabase
    .from('listing_images')
    .update({ is_primary: false })
    .eq('listing_id', listingId)
  if (clearError != null) return { error: clearError }

  const { error: setError } = await supabase
    .from('listing_images')
    .update({ is_primary: true })
    .eq('id', imageId)
    .eq('listing_id', listingId)
  return { error: setError }
}

/** Persists a new display order for a listing's photos. */
export async function reorderListingImages(
  listingId: string,
  orderedIds: string[],
): Promise<{ error: PostgrestError | null }> {
  for (let index = 0; index < orderedIds.length; index += 1) {
    const { error } = await supabase
      .from('listing_images')
      .update({ sort_order: index })
      .eq('id', orderedIds[index])
      .eq('listing_id', listingId)
    if (error != null) return { error }
  }
  return { error: null }
}

// ---------------------------------------------------------------------------
// Reference data helpers (typed re-exports for callers)
// ---------------------------------------------------------------------------

export type ActiveCategory = Category
export type ActiveBrand = Brand
