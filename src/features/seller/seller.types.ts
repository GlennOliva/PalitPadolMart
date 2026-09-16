import type { Database, Tables, TablesInsert, TablesUpdate } from '../../types/database'

export type SellerStatus = Database['public']['Enums']['seller_status']

export type SellerProfile = Tables<'seller_profiles'>
export type SellerProfileInsert = TablesInsert<'seller_profiles'>
export type SellerProfileUpdate = TablesUpdate<'seller_profiles'>

/**
 * The safe seller-profile fields a client may set. Matches the Phase 1
 * column grants exactly (store_name, description, logo_url, city, province,
 * pickup_available, delivery_available, pickup_location, pickup_instructions).
 * seller_status and user_id are never writable by the browser.
 */
export interface SellerEditableFields {
  store_name: string
  description: string
  city: string
  province: string
  pickup_available: boolean
  delivery_available: boolean
  pickup_location: string
  pickup_instructions: string
}

export type SellerApplicationInput = SellerEditableFields

/**
 * Public-facing subset of a seller profile, mirroring the
 * `public_seller_profiles` view (active sellers only, no internal columns).
 */
export interface PublicSellerProfile {
  id: string | null
  store_name: string | null
  description: string | null
  logo_url: string | null
  city: string | null
  province: string | null
  pickup_available: boolean | null
  delivery_available: boolean | null
}

/**
 * Seller logos live in the public `marketplace-products` bucket so they can
 * be rendered on the public seller profile without signed URLs. Write access
 * is owner-scoped by the storage policy: the first path segment must equal
 * the caller's seller_profiles.id (`auth_seller_id()`), which the
 * `{sellerId}/logo/{filename}` path satisfies.
 */
export const SELLER_LOGO_BUCKET = 'marketplace-products'
export const MAX_LOGO_BYTES = 5 * 1024 * 1024
export const ALLOWED_LOGO_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const

export const SELLER_SELF_UPDATE_COLUMNS = [
  'store_name',
  'description',
  'logo_url',
  'city',
  'province',
  'pickup_available',
  'delivery_available',
  'pickup_location',
  'pickup_instructions',
] as const
