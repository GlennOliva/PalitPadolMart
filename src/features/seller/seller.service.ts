import type { PostgrestError } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase/client'
import { buildSellerLogoPath } from './seller-logo'
import {
  SELLER_LOGO_BUCKET,
  type PublicSellerProfile,
  type SellerApplicationInput,
  type SellerDashboardSummary,
  type SellerEditableFields,
  type SellerProfile,
} from './seller.types'

export function toNullableText(value: string): string | null {
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

export async function getMySellerProfile(userId: string) {
  return supabase
    .from('seller_profiles')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle<SellerProfile>()
}

/**
 * Creates a seller application. Only user_id (from the session) and the safe
 * editable fields are sent; seller_status is deliberately omitted so the
 * `seller_profiles_force_pending` trigger and column default control it.
 */
export async function createSellerApplication(
  userId: string,
  input: SellerApplicationInput,
) {
  return supabase
    .from('seller_profiles')
    .insert({
      user_id: userId,
      store_name: input.store_name.trim(),
      description: toNullableText(input.description),
      city: toNullableText(input.city),
      province: toNullableText(input.province),
      pickup_available: input.pickup_available,
      delivery_available: input.delivery_available,
      pickup_location: toNullableText(input.pickup_location),
      pickup_instructions: toNullableText(input.pickup_instructions),
    })
    .select('*')
    .single<SellerProfile>()
}

/**
 * Updates the caller's own seller profile. The query is scoped by user_id (the
 * session owner) rather than a client-supplied seller id, so a wrong id can
 * never target another row; RLS and column grants remain authoritative.
 */
export async function updateMySellerProfile(userId: string, fields: SellerEditableFields) {
  return supabase
    .from('seller_profiles')
    .update({
      store_name: fields.store_name.trim(),
      description: toNullableText(fields.description),
      city: toNullableText(fields.city),
      province: toNullableText(fields.province),
      pickup_available: fields.pickup_available,
      delivery_available: fields.delivery_available,
      pickup_location: toNullableText(fields.pickup_location),
      pickup_instructions: toNullableText(fields.pickup_instructions),
    })
    .eq('user_id', userId)
    .select('*')
    .single<SellerProfile>()
}

async function setSellerLogo(userId: string, logoPath: string | null) {
  return supabase
    .from('seller_profiles')
    .update({ logo_url: logoPath })
    .eq('user_id', userId)
    .select('*')
    .single<SellerProfile>()
}

export async function uploadSellerLogo(sellerId: string, userId: string, file: File) {
  const path = buildSellerLogoPath(sellerId, file.name)
  const { error: uploadError } = await supabase.storage
    .from(SELLER_LOGO_BUCKET)
    .upload(path, file, {
      upsert: true,
      contentType: file.type,
      cacheControl: '3600',
    })
  if (uploadError != null) return { path: null as string | null, error: uploadError }

  const { error: dbError } = await setSellerLogo(userId, path)
  if (dbError != null) return { path: null as string | null, error: dbError }

  return { path, error: null }
}

export async function removeSellerLogo(
  _sellerId: string,
  userId: string,
  logoPath: string | null,
) {
  if (logoPath != null) {
    const { error: removeError } = await supabase.storage
      .from(SELLER_LOGO_BUCKET)
      .remove([logoPath])
    if (removeError != null) return { error: removeError }
  }
  const { error: dbError } = await setSellerLogo(userId, null)
  return { error: dbError }
}

/**
 * The marketplace-products bucket is public, so a stable public URL (not a
 * signed URL) is returned for display on public seller profiles.
 */
export function getPublicLogoUrl(logoPath: string | null): string | null {
  if (logoPath == null) return null
  const { data } = supabase.storage.from(SELLER_LOGO_BUCKET).getPublicUrl(logoPath)
  return data.publicUrl
}

const COUNT = { count: 'exact', head: true } as const

/**
 * Real numbers from the database (server-side counts) — no faked metrics.
 * Orders in `paid`/`completed` states count toward sales value; everything
 * else is either not yet transacted or cancelled/disputed.
 */
export async function getSellerDashboardSummary(
  sellerId: string,
): Promise<{ data: SellerDashboardSummary | null; error: PostgrestError | null }> {
  const [active, draft, sold, pendingOrders, completedOrders, revenue, reviews] =
    await Promise.all([
      supabase
        .from('listings')
        .select('*', COUNT)
        .eq('seller_id', sellerId)
        .eq('listing_status', 'active'),
      supabase
        .from('listings')
        .select('*', COUNT)
        .eq('seller_id', sellerId)
        .eq('listing_status', 'draft'),
      supabase
        .from('listings')
        .select('*', COUNT)
        .eq('seller_id', sellerId)
        .eq('listing_status', 'sold'),
      supabase
        .from('orders')
        .select('*', COUNT)
        .eq('seller_id', sellerId)
        .eq('status', 'pending'),
      supabase
        .from('orders')
        .select('*', COUNT)
        .eq('seller_id', sellerId)
        .eq('status', 'completed'),
      supabase
        .from('orders')
        .select('total')
        .eq('seller_id', sellerId)
        .in('status', ['paid', 'completed']),
      supabase
        .from('reviews')
        .select('rating, seller_rating')
        .eq('seller_id', sellerId)
        .eq('status', 'approved'),
    ])

  const firstError = [active, draft, sold, pendingOrders, completedOrders, revenue, reviews]
    .map((result) => result.error)
    .find((error) => error != null)

  if (firstError != null) {
    return { data: null, error: firstError }
  }

  const approved = reviews.data ?? []
  const averageRating =
    approved.length > 0
      ? approved.reduce((sum, review) => sum + (review.seller_rating ?? review.rating), 0) /
        approved.length
      : null

  return {
    data: {
      activeListings: active.count ?? 0,
      draftListings: draft.count ?? 0,
      soldListings: sold.count ?? 0,
      pendingOrders: pendingOrders.count ?? 0,
      completedOrders: completedOrders.count ?? 0,
      completedSalesValue: (revenue.data ?? []).reduce((sum, order) => sum + order.total, 0),
      approvedReviews: approved.length,
      averageRating,
    },
    error: null,
  }
}

export interface PublicSellerResult {
  seller: PublicSellerProfile | null
  rating: number | null
  reviewCount: number
  error: PostgrestError | null
}

/**
 * Public seller profile: only rows from the `public_seller_profiles` view
 * (active sellers, public columns) plus the approved-review aggregate. The
 * RLS-approved-reviews policy makes this readable by guests.
 */
export async function getPublicSellerProfile(
  sellerId: string,
): Promise<PublicSellerResult> {
  const [profileResult, reviewsResult] = await Promise.all([
    supabase
      .from('public_seller_profiles')
      .select('*')
      .eq('id', sellerId)
      .maybeSingle<PublicSellerProfile>(),
    supabase
      .from('reviews')
      .select('rating, seller_rating')
      .eq('seller_id', sellerId)
      .eq('status', 'approved'),
  ])

  const error = profileResult.error ?? reviewsResult.error
  if (error != null) {
    return { seller: null, rating: null, reviewCount: 0, error }
  }

  const reviews = reviewsResult.data ?? []
  const rating =
    reviews.length > 0
      ? reviews.reduce((sum, review) => sum + (review.seller_rating ?? review.rating), 0) /
        reviews.length
      : null

  return {
    seller: profileResult.data,
    rating,
    reviewCount: reviews.length,
    error: null,
  }
}
