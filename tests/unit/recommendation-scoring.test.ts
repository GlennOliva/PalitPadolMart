import { describe, it, expect } from 'vitest'
import {
  SCORE_WEIGHTS,
  buildExplanation,
  controlPowerBias,
  rankPaddles,
  scoreBudget,
  scoreControlPower,
  scorePaddle,
  scoreSkill,
  scoreStyle,
  scoreWeight,
} from '../../src/features/recommendation/scoring'
import type {
  PaddleSkillLevel,
  PlayingStyle,
  RecommendationCandidate,
  RecommendationProfile,
  SkillLevel,
} from '../../src/features/recommendation/recommendation.types'

function profile(overrides: Partial<RecommendationProfile> = {}): RecommendationProfile {
  return {
    skill_level: null,
    playing_style: null,
    preferred_weight_grams: null,
    control_power_preference: null,
    budget: null,
    ...overrides,
  }
}

function candidate(
  overrides: Partial<RecommendationCandidate> = {},
  attrs: Partial<RecommendationCandidate['paddle_attributes']> = {},
): RecommendationCandidate {
  return {
    id: 'list-1',
    title: 'Pro Paddle',
    description: 'A paddle',
    price: 5000,
    listing_condition: 'like_new',
    quantity: 1,
    city: null,
    province: null,
    pickup_available: true,
    delivery_available: false,
    created_at: '2026-01-01T00:00:00Z',
    category: { id: 'c1', name: 'Paddles', slug: 'paddles' },
    brand: { id: 'b1', name: 'Joola' },
    seller: { id: 's1', store_name: 'Ace Paddles' },
    images: [],
    paddle_attributes: {
      weight_grams: 230,
      weight_class: 'Midweight',
      control_score: 5,
      power_score: 5,
      skill_level: 'all',
      playing_style: 'balanced',
      ...attrs,
    } as RecommendationCandidate['paddle_attributes'],
    ...overrides,
  }
}

describe('weights', () => {
  it('sums to exactly 100', () => {
    const total = Object.values(SCORE_WEIGHTS).reduce((sum, weight) => sum + weight, 0)
    expect(total).toBe(100)
  })
})

describe('scoreBudget', () => {
  it('is neutral when no budget is set', () => {
    expect(scoreBudget(profile(), 9000)).toBe(SCORE_WEIGHTS.budget)
  })

  it('gives full marks at or under budget', () => {
    expect(scoreBudget(profile({ budget: 5000 }), 5000)).toBe(25)
    expect(scoreBudget(profile({ budget: 5000 }), 4500)).toBe(25)
  })

  it('gives partial marks slightly above budget', () => {
    expect(scoreBudget(profile({ budget: 5000 }), 6000)).toBe(20)
    expect(scoreBudget(profile({ budget: 5000 }), 7500)).toBe(13)
  })

  it('gives zero at or beyond twice the budget', () => {
    expect(scoreBudget(profile({ budget: 5000 }), 10000)).toBe(0)
    expect(scoreBudget(profile({ budget: 5000 }), 20000)).toBe(0)
  })
})

describe('scoreSkill', () => {
  it('is neutral when no skill is set', () => {
    expect(scoreSkill(profile(), 'beginner')).toBe(SCORE_WEIGHTS.skill)
  })

  it('treats an all-levels paddle as a perfect match', () => {
    const p = profile({ skill_level: 'beginner' })
    expect(scoreSkill(p, 'all')).toBe(20)
    expect(scoreSkill(p, null)).toBe(20)
  })

  it('gives exact matches full marks and scales by level distance', () => {
    const p = profile({ skill_level: 'beginner' })
    expect(scoreSkill(p, 'beginner')).toBe(20)
    expect(scoreSkill(p, 'intermediate')).toBe(10)
    expect(scoreSkill(p, 'advanced')).toBe(0)
  })
})

describe('scoreStyle', () => {
  it('is neutral when no style is set', () => {
    expect(scoreStyle(profile(), 'power')).toBe(SCORE_WEIGHTS.style)
  })

  it('rewards exact matches and versatile paddles', () => {
    const p = profile({ playing_style: 'control' })
    expect(scoreStyle(p, 'control')).toBe(20)
    expect(scoreStyle(p, 'balanced')).toBe(16)
  })

  it('discounts opposing control/power styles', () => {
    const p = profile({ playing_style: 'control' })
    expect(scoreStyle(p, 'power')).toBe(4)
  })

  it('gives half marks when the paddle has no style', () => {
    expect(scoreStyle(profile({ playing_style: 'spin' }), null)).toBe(10)
  })
})

describe('controlPowerBias', () => {
  it('is null when either attribute is missing', () => {
    expect(controlPowerBias(null, 5)).toBeNull()
    expect(controlPowerBias(5, null)).toBeNull()
  })

  it('maps control/power scores onto the 1-10 preference scale', () => {
    expect(controlPowerBias(5, 5)).toBe(5)
    expect(controlPowerBias(3, 7)).toBe(7)
    expect(controlPowerBias(7, 3)).toBe(3)
  })

  it('clamps to the 1-10 scale', () => {
    expect(controlPowerBias(10, 1)).toBe(1)
    expect(controlPowerBias(1, 10)).toBe(9.5)
  })
})

describe('scoreControlPower', () => {
  it('is neutral when no preference is set', () => {
    expect(scoreControlPower(profile(), 5, 5)).toBe(SCORE_WEIGHTS.controlPower)
  })

  it('gives full marks for an exact bias match', () => {
    const p = profile({ control_power_preference: 7 })
    expect(scoreControlPower(p, 3, 7)).toBe(20)
  })

  it('loses 4 points per step of distance and floors at zero', () => {
    const p = profile({ control_power_preference: 8 })
    expect(scoreControlPower(p, 4, 8)).toBe(16)
    expect(scoreControlPower(p, 10, 1)).toBe(0)
  })

  it('gives half marks when the paddle has no bias', () => {
    expect(scoreControlPower(profile({ control_power_preference: 5 }), null, null)).toBe(10)
  })
})

describe('scoreWeight', () => {
  it('is neutral when no weight is preferred', () => {
    expect(scoreWeight(profile(), 230)).toBe(SCORE_WEIGHTS.weight)
  })

  it('gives full marks at the exact weight and tapers to zero', () => {
    const p = profile({ preferred_weight_grams: 230 })
    expect(scoreWeight(p, 230)).toBe(15)
    expect(scoreWeight(p, 225)).toBe(14)
    expect(scoreWeight(p, 230 + 40)).toBe(7)
    expect(scoreWeight(p, 230 - 75)).toBe(0)
    expect(scoreWeight(p, 100)).toBe(0)
  })

  it('gives half marks when the paddle has no weight', () => {
    expect(scoreWeight(profile({ preferred_weight_grams: 230 }), null)).toBe(8)
  })
})

describe('scorePaddle', () => {
  it('scores a perfect match at the maximum of 100', () => {
    const p = profile({
      skill_level: 'intermediate',
      playing_style: 'balanced',
      preferred_weight_grams: 230,
      control_power_preference: 5,
      budget: 5000,
    })
    const breakdown = scorePaddle(p, candidate())
    expect(breakdown).toEqual({
      total: 100,
      budget: 25,
      skill: 20,
      style: 20,
      weight: 15,
      controlPower: 20,
    })
  })

  it('caps the total at 100 and never goes negative', () => {
    const p = profile({
      skill_level: 'advanced',
      playing_style: 'power',
      preferred_weight_grams: 180,
      control_power_preference: 2,
      budget: 3000,
    })
    const attrs = {
      skill_level: 'beginner' as PaddleSkillLevel,
      playing_style: 'control' as PlayingStyle,
      weight_grams: 300,
      control_score: 9,
      power_score: 2,
    }
    const breakdown = scorePaddle(p, candidate({ price: 20000 }, attrs))
    expect(breakdown.total).toBeGreaterThanOrEqual(0)
    expect(breakdown.total).toBeLessThanOrEqual(100)
  })
})

describe('rankPaddles', () => {
  it('orders by score descending', () => {
    const weak = candidate(
      { id: 'weak', price: 20000, created_at: '2026-01-02T00:00:00Z' },
      { skill_level: 'advanced' as PaddleSkillLevel, playing_style: 'power' as PlayingStyle },
    )
    const strong = candidate({ id: 'strong' }, { skill_level: 'all' as PaddleSkillLevel })
    const results = rankPaddles(profile({ budget: 6000 }), [weak, strong])
    expect(results[0].listing.id).toBe('strong')
    expect(results[1].listing.id).toBe('weak')
  })

  it('breaks ties newest first', () => {
    const p = profile()
    const older = candidate({ id: 'older', created_at: '2026-01-01T00:00:00Z' })
    const newer = candidate({ id: 'newer', created_at: '2026-01-02T00:00:00Z' })
    const results = rankPaddles(p, [older, newer])
    expect(results[0].listing.id).toBe('newer')
    expect(results[1].listing.id).toBe('older')
  })

  it('scores every candidate without mutating the input', () => {
    const candidates = [candidate({ id: 'a' }), candidate({ id: 'b' })]
    const before = candidates.map((item) => item.id)
    rankPaddles(profile(), candidates)
    expect(candidates.map((item) => item.id)).toEqual(before)
  })
})

describe('buildExplanation', () => {
  it('produces one reason per answered preference', () => {
    const p = profile({
      skill_level: 'intermediate',
      playing_style: 'spin',
      preferred_weight_grams: 230,
      control_power_preference: 5,
      budget: 6000,
    })
    const reasons = buildExplanation(p, scorePaddle(p, candidate()), candidate())
    expect(reasons).toHaveLength(5)
    expect(reasons.join(' ')).toContain('budget')
    expect(reasons.join(' ')).toContain('every level')
    expect(reasons.join(' ')).toContain('playing style')
    expect(reasons.join(' ')).toContain('weighs 230g')
    expect(reasons.join(' ')).toContain('control/power')
  })

  it('produces no reasons when nothing is answered', () => {
    expect(buildExplanation(profile(), scorePaddle(profile(), candidate()), candidate())).toEqual([])
  })

  it('names the paddle character from its control/power bias', () => {
    const p = profile({ control_power_preference: 5 })
    const powerPaddle = candidate({}, { control_score: 2, power_score: 10 })
    const controlPaddle = candidate({}, { control_score: 10, power_score: 2 })
    expect(buildExplanation(p, scorePaddle(p, powerPaddle), powerPaddle)[0]).toContain('power-first')
    expect(buildExplanation(p, scorePaddle(p, controlPaddle), controlPaddle)[0]).toContain('control-first')
  })

  it('describes skill matches for non-exact levels', () => {
    const p = profile({ skill_level: 'advanced' as SkillLevel })
    const paddle = candidate({}, { skill_level: 'beginner' as PaddleSkillLevel })
    expect(buildExplanation(p, scorePaddle(p, paddle), paddle)[0]).toContain('advanced')
  })

  it('says a paddle exceeds the budget when it scores zero budget points', () => {
    const p = profile({ budget: 3000 })
    const paddle = candidate({ price: 20000 })
    const reasons = buildExplanation(p, scorePaddle(p, paddle), paddle)
    expect(reasons[0]).toContain('exceeds your ₱3,000.00 budget')
  })

  it('never claims a weight match when the paddle weight is missing', () => {
    const p = profile({ preferred_weight_grams: 230 })
    const paddle = candidate({}, { weight_grams: null })
    const reasons = buildExplanation(p, scorePaddle(p, paddle), paddle)
    expect(reasons.join(' ')).not.toContain('weighs')
  })
})
