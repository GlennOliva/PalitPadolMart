import type { PaddleAttributes, PublicListing } from '../marketplace/marketplace.types'

export type SkillLevel = 'beginner' | 'intermediate' | 'advanced'
export type PaddleSkillLevel = SkillLevel | 'all'
export type PlayingStyle = 'control' | 'power' | 'all_court' | 'balanced' | 'spin'

export const SKILL_LEVELS: SkillLevel[] = ['beginner', 'intermediate', 'advanced']
export const PLAYING_STYLES: PlayingStyle[] = ['control', 'power', 'all_court', 'balanced', 'spin']
export const CONTROL_POWER_SCALE = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const

/**
 * A user's answered questionnaire (mirrors `recommendation_profiles`).
 * Null means "no preference" — the scoring engine treats that as a neutral
 * full-score signal so incomplete profiles still produce reasonable results.
 */
export interface RecommendationProfile {
  skill_level: SkillLevel | null
  playing_style: PlayingStyle | null
  preferred_weight_grams: number | null
  /** 1 = control-heavy, 10 = power-heavy, 5 = balanced. */
  control_power_preference: number | null
  budget: number | null
}

export const EMPTY_RECOMMENDATION_PROFILE: RecommendationProfile = {
  skill_level: null,
  playing_style: null,
  preferred_weight_grams: null,
  control_power_preference: null,
  budget: null,
}

/** The raw form state of the questionnaire (string inputs before coercion). */
export interface RecommendationFormValues {
  skill_level: SkillLevel | ''
  playing_style: PlayingStyle | ''
  control_power_preference: string
  preferred_weight_grams: string
  budget: string
}

/**
 * A paddle listing plus its one-to-one attributes — everything the scoring
 * engine needs. Only active, in-stock, Paddles-category listings qualify.
 */
export interface RecommendationCandidate extends PublicListing {
  paddle_attributes: PaddleAttributes
}

export interface ScoreBreakdown {
  total: number
  budget: number
  skill: number
  style: number
  weight: number
  controlPower: number
}

export interface ScoredPaddle {
  listing: RecommendationCandidate
  breakdown: ScoreBreakdown
  reasons: string[]
}
