import type { PostgrestError } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase/client'
import type { RecommendationCandidate, RecommendationProfile } from './recommendation.types'

const PADDLE_CANDIDATE_COLUMNS = `
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
  category:categories!inner ( id, name, slug ),
  brand:brands ( id, name, slug ),
  seller:public_seller_profiles ( id, store_name ),
  images:listing_images ( id, url, storage_path, is_primary, sort_order ),
  paddle_attributes!inner (
    weight_grams,
    weight_class,
    control_score,
    power_score,
    skill_level,
    playing_style
  )
`

/**
 * The recommendation pool: Paddles-category listings that are both active and
 * in stock and carry paddle attributes (inner joins enforce both). RLS keeps
 * non-active statuses invisible; the explicit status/quantity filters and the
 * category inner join mirror the marketplace's public visibility rules.
 */
export async function getPaddleCandidates(): Promise<{
  data: RecommendationCandidate[]
  error: PostgrestError | null
}> {
  const { data, error } = await supabase
    .from('listings')
    .select(PADDLE_CANDIDATE_COLUMNS)
    .eq('category.slug', 'paddles')
    .eq('listing_status', 'active')
    .gt('quantity', 0)
    .order('created_at', { ascending: false })

  const rows = (data ?? []) as Array<
    RecommendationCandidate & { images: RecommendationCandidate['images'] | null }
  >
  return {
    data: rows.map((row) => ({ ...row, images: row.images ?? [] })),
    error,
  }
}

// ---------------------------------------------------------------------------
// Questionnaire profile (recommendation_profiles, own-row RLS)
// ---------------------------------------------------------------------------

export async function getRecommendationProfile(userId: string) {
  return supabase
    .from('recommendation_profiles')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle<RecommendationProfile & { user_id: string }>()
}

/** Saves (or replaces) the caller's questionnaire answers. */
export async function saveRecommendationProfile(
  userId: string,
  profile: RecommendationProfile,
) {
  return supabase
    .from('recommendation_profiles')
    .upsert(
      {
        user_id: userId,
        skill_level: profile.skill_level,
        playing_style: profile.playing_style,
        preferred_weight_grams: profile.preferred_weight_grams,
        control_power_preference: profile.control_power_preference,
        budget: profile.budget,
      },
      { onConflict: 'user_id' },
    )
    .select('*')
    .single()
}

// ---------------------------------------------------------------------------
// Recommendation events (only recorded for authenticated users)
// ---------------------------------------------------------------------------

/** Logs that recommendations were generated for a user (analytics). */
export async function recordRecommendationViewed(
  userId: string,
  count: number,
): Promise<{ error: PostgrestError | null }> {
  const { error } = await supabase.from('recommendation_events').insert({
    user_id: userId,
    event_type: 'recommendation_view',
    payload: { count },
  })
  return { error }
}

/** Logs a click-through from a recommendation result to a listing. */
export async function recordRecommendationClick(
  userId: string,
  listingId: string,
): Promise<{ error: PostgrestError | null }> {
  const { error } = await supabase.from('recommendation_events').insert({
    user_id: userId,
    event_type: 'click',
    listing_id: listingId,
    payload: { source: 'recommendation' },
  })
  return { error }
}
