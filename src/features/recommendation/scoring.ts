import { formatCurrency } from '../../utils/format'
import type {
  PaddleSkillLevel,
  PlayingStyle,
  RecommendationCandidate,
  RecommendationProfile,
  ScoreBreakdown,
  ScoredPaddle,
  SkillLevel,
} from './recommendation.types'

/**
 * Deterministic weighted scoring (MASTER_BUILD_SPEC §15). Each component is
 * capped at its weight so the maximum possible score is exactly 100:
 *
 *   budget match           25
 *   skill compatibility    20
 *   playing-style match    20
 *   weight preference      15
 *   control/power fit      20
 *
 * Weights are grouped so the algorithm can be swapped for a better model later
 * without touching the marketplace code — only this module changes.
 */
export const SCORE_WEIGHTS = {
  budget: 25,
  skill: 20,
  style: 20,
  weight: 15,
  controlPower: 20,
} as const

const SKILL_ORDER: Record<PaddleSkillLevel, number> = {
  beginner: 0,
  intermediate: 1,
  advanced: 2,
  all: -1,
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

/**
 * Budget: full marks at or under budget, a linear falloff for paddles up to
 * twice the budget, and zero beyond that (MASTER_BUILD_SPEC §15). This keeps
 * the spec's "slightly above budget" tier meaningful while never recommending
 * products dramatically outside the user's budget. An unset budget never
 * penalizes a paddle.
 */
export function scoreBudget(profile: RecommendationProfile, price: number): number {
  if (profile.budget == null) return SCORE_WEIGHTS.budget
  if (price <= 0 || price <= profile.budget) return SCORE_WEIGHTS.budget
  const ratio = price / profile.budget
  return Math.round(SCORE_WEIGHTS.budget * clamp01(2 - ratio))
}

/**
 * Skill: `all` paddles and exact matches score full; one-level differences
 * lose half; two-level differences get zero. An unset preference is neutral.
 */
export function scoreSkill(
  profile: RecommendationProfile,
  paddleSkill: PaddleSkillLevel | null,
): number {
  if (profile.skill_level == null) return SCORE_WEIGHTS.skill
  if (paddleSkill == null || paddleSkill === 'all') return SCORE_WEIGHTS.skill
  const userLevel = SKILL_ORDER[profile.skill_level]
  const paddleLevel = SKILL_ORDER[paddleSkill]
  const distance = Math.abs(userLevel - paddleLevel)
  return Math.max(0, SCORE_WEIGHTS.skill - 10 * distance)
}

/** Compatibility matrix (0..1) between a paddle's style and the user's. */
const STYLE_MATRIX: Record<PlayingStyle, Record<PlayingStyle, number>> = {
  control: { control: 1, balanced: 0.8, power: 0.2, all_court: 0.8, spin: 0.5 },
  power: { control: 0.2, balanced: 0.8, power: 1, all_court: 0.8, spin: 0.8 },
  balanced: { control: 0.8, balanced: 1, power: 0.8, all_court: 0.9, spin: 0.8 },
  all_court: { control: 0.8, balanced: 0.9, power: 0.8, all_court: 1, spin: 0.7 },
  spin: { control: 0.5, balanced: 0.7, power: 0.8, all_court: 0.7, spin: 1 },
}

/**
 * Playing style: exact matches score full; versatile paddles (balanced /
 * all-court) stay strong across styles; opposing control-vs-power styles are
 * heavily discounted. An unset preference is neutral.
 */
export function scoreStyle(
  profile: RecommendationProfile,
  paddleStyle: PlayingStyle | null,
): number {
  if (profile.playing_style == null) return SCORE_WEIGHTS.style
  if (paddleStyle == null) return SCORE_WEIGHTS.style * 0.5
  const compatibility = STYLE_MATRIX[paddleStyle]?.[profile.playing_style] ?? 0.5
  return Math.round(SCORE_WEIGHTS.style * compatibility)
}

/**
 * Weight: full marks within ~±15g of the preference, tapering to zero at
 * ±75g. A missing weight on the paddle or a missing preference is neutral.
 */
export function scoreWeight(
  profile: RecommendationProfile,
  paddleWeightGrams: number | null,
): number {
  if (profile.preferred_weight_grams == null) return SCORE_WEIGHTS.weight
  if (paddleWeightGrams == null) return Math.round(SCORE_WEIGHTS.weight * 0.5)
  const distance = Math.abs(profile.preferred_weight_grams - paddleWeightGrams)
  return Math.max(0, Math.round(SCORE_WEIGHTS.weight - distance * 0.2))
}

/**
 * Maps a paddle's control/power scores onto the 1–10 preference scale
 * (1 = control-heavy, 10 = power-heavy, 5 = balanced).
 */
export function controlPowerBias(controlScore: number | null, powerScore: number | null): number | null {
  if (controlScore == null || powerScore == null) return null
  const bias = (powerScore - controlScore) / 2 + 5
  return Math.min(10, Math.max(1, bias))
}

/**
 * Control/power fit: measured as distance between the paddle's bias and the
 * user's preference, losing 4 points per step. Unset preference is neutral.
 */
export function scoreControlPower(
  profile: RecommendationProfile,
  controlScore: number | null,
  powerScore: number | null,
): number {
  if (profile.control_power_preference == null) return SCORE_WEIGHTS.controlPower
  const bias = controlPowerBias(controlScore, powerScore)
  if (bias == null) return Math.round(SCORE_WEIGHTS.controlPower * 0.5)
  const distance = Math.abs(bias - profile.control_power_preference)
  return Math.max(0, Math.round(SCORE_WEIGHTS.controlPower - 4 * distance))
}

/** Scores one paddle against the user's profile (max 100). */
export function scorePaddle(
  profile: RecommendationProfile,
  paddle: RecommendationCandidate,
): ScoreBreakdown {
  const attrs = paddle.paddle_attributes
  const skill = (attrs.skill_level as PaddleSkillLevel | null) ?? null
  const style = (attrs.playing_style as PlayingStyle | null) ?? null

  const budget = scoreBudget(profile, paddle.price)
  const skillScore = scoreSkill(profile, skill)
  const styleScore = scoreStyle(profile, style)
  const weight = scoreWeight(profile, attrs.weight_grams)
  const controlPower = scoreControlPower(profile, attrs.control_score, attrs.power_score)

  return {
    total: Math.min(100, budget + skillScore + styleScore + weight + controlPower),
    budget,
    skill: skillScore,
    style: styleScore,
    weight,
    controlPower,
  }
}

const SKILL_LABELS: Record<SkillLevel, string> = {
  beginner: 'beginner',
  intermediate: 'intermediate',
  advanced: 'advanced',
}

const STYLE_LABELS: Record<PlayingStyle, string> = {
  control: 'control',
  power: 'power',
  balanced: 'balanced',
  all_court: 'all-court',
  spin: 'spin',
}

/**
 * Human-readable reasons the paddle matched, shown as "Why it matches". Only
 * the preferences the user actually answered produce a reason.
 */
export function buildExplanation(
  profile: RecommendationProfile,
  breakdown: ScoreBreakdown,
  paddle: RecommendationCandidate,
): string[] {
  const attrs = paddle.paddle_attributes
  const reasons: string[] = []

  if (profile.budget != null) {
    if (breakdown.budget === SCORE_WEIGHTS.budget) {
      reasons.push(`fits your ${formatCurrency(profile.budget)} budget`)
    } else if (breakdown.budget === 0) {
      reasons.push(`exceeds your ${formatCurrency(profile.budget)} budget`)
    } else {
      reasons.push(`close to your ${formatCurrency(profile.budget)} budget`)
    }
  }

  if (profile.skill_level != null) {
    const level = SKILL_LABELS[profile.skill_level]
    const paddleSkill = attrs.skill_level
    if (paddleSkill === 'all') {
      reasons.push(`suits every level, including ${level}`)
    } else if (paddleSkill === profile.skill_level) {
      reasons.push(`matches your ${level} skill level`)
    } else {
      reasons.push(`fits a ${level} skill level`)
    }
  }

  if (profile.playing_style != null) {
    const style = STYLE_LABELS[profile.playing_style]
    reasons.push(
      attrs.playing_style === profile.playing_style
        ? `suits your ${style} playing style`
        : `works well for a ${style} playing style`,
    )
  }

  if (profile.preferred_weight_grams != null && attrs.weight_grams != null) {
    reasons.push(
      `weighs ${attrs.weight_grams}g, close to your ${profile.preferred_weight_grams}g preference`,
    )
  }

  if (profile.control_power_preference != null && attrs.control_score != null && attrs.power_score != null) {
    const bias = controlPowerBias(attrs.control_score, attrs.power_score)
    const character = bias != null && bias < 4.5 ? 'control-first' : bias != null && bias > 5.5 ? 'power-first' : 'balanced'
    reasons.push(`${character} build fits your control/power preference`)
  }

  return reasons
}

/** Ranks every candidate for a profile, highest score first, ties newest first. */
export function rankPaddles(
  profile: RecommendationProfile,
  candidates: RecommendationCandidate[],
): ScoredPaddle[] {
  return candidates
    .map((listing) => {
      const breakdown = scorePaddle(profile, listing)
      return {
        listing,
        breakdown,
        reasons: buildExplanation(profile, breakdown, listing),
      }
    })
    .sort((a, b) => {
      if (b.breakdown.total !== a.breakdown.total) return b.breakdown.total - a.breakdown.total
      return b.listing.created_at.localeCompare(a.listing.created_at)
    })
}
