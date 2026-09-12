import type { Database, Tables, TablesInsert } from '../../types/database'

export type ListingStatus = Database['public']['Enums']['listing_status']
export type ListingCondition = Database['public']['Enums']['listing_condition']

export type Listing = Tables<'listings'>
export type ListingInsert = TablesInsert<'listings'>
export type ListingImage = Tables<'listing_images'>
export type PaddleAttributes = Tables<'paddle_attributes'>
export type Category = Tables<'categories'>
export type Brand = Tables<'brands'>

/**
 * The image columns a listing query returns (public grid, detail, seller
 * management). storage_path is included so the owner can delete the backing
 * object; it is only a storage path, never sensitive.
 */
export type ListingImageSummary = Pick<
  ListingImage,
  'id' | 'url' | 'storage_path' | 'is_primary' | 'sort_order'
>

/**
 * Product photos live in the public `marketplace-products` bucket. The Phase 1
 * storage policies scope writes by the first path segment, which must equal
 * the caller's seller id, so every listing image is stored under
 * `{sellerId}/{listingId}/{filename}` and can never collide with another
 * seller. The bucket is public so image rows can store a stable public URL.
 */
export const PRODUCT_IMAGES_BUCKET = 'marketplace-products'
export const MAX_LISTING_IMAGES = 8
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024
export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const

export const MAX_LISTING_TITLE_LENGTH = 120
export const MAX_LISTING_DESCRIPTION_LENGTH = 2000
export const MAX_LISTING_LOCATION_LENGTH = 100
export const MAX_PRICE = 1_000_000

/**
 * The fields a seller may set on a listing. Mirrors the Phase 1 column grant
 * exactly (category_id, brand_id, title, description, listing_condition,
 * price, quantity, listing_status, city, province, pickup_available,
 * delivery_available). seller_id is never client-writable.
 */
export interface ListingEditableFields {
  category_id: string
  brand_id: string | null
  title: string
  description: string
  listing_condition: ListingCondition
  price: string
  quantity: string
  listing_status: ListingStatus
  city: string
  province: string
  pickup_available: boolean
  delivery_available: boolean
}

/** Paddle-only metadata, entered when the listing's category is Paddles. */
export interface PaddleAttributeInput {
  weight_grams: string
  weight_class: string
  control_score: string
  power_score: string
  skill_level: string
  playing_style: string
}

export interface ListingFormValues {
  listing: ListingEditableFields
  paddle: PaddleAttributeInput
}

/** A public listing card (active + available) with joined display data. */
export interface PublicListing {
  id: string
  title: string
  description: string
  price: number
  listing_condition: ListingCondition
  quantity: number
  city: string | null
  province: string | null
  pickup_available: boolean
  delivery_available: boolean
  created_at: string
  category: Pick<Category, 'id' | 'name' | 'slug'> | null
  brand: Pick<Brand, 'id' | 'name'> | null
  seller: { id: string; store_name: string | null } | null
  images: ListingImageSummary[]
}

/** A full public listing detail (adds paddle attributes). */
export interface PublicListingDetail extends PublicListing {
  paddle_attributes: PaddleAttributes | null
}

/** A seller's own listing row (any status) with joined display data. */
export interface SellerListing extends PublicListing {
  listing_status: ListingStatus
  paddle_attributes: PaddleAttributes | null
}

/** A photo picked for a not-yet-created listing, staged until save. */
export interface StagedListingImage {
  id: string
  file: File
  previewUrl: string
}
