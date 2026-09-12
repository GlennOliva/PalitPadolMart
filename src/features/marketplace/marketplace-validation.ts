import type { ListingCondition, ListingFormValues } from './marketplace.types'
import {
  MAX_LISTING_DESCRIPTION_LENGTH,
  MAX_LISTING_LOCATION_LENGTH,
  MAX_LISTING_TITLE_LENGTH,
  MAX_PRICE,
} from './marketplace.types'

export const LISTING_CONDITIONS: ListingCondition[] = [
  'new',
  'like_new',
  'used',
  'heavily_used',
]

export const LISTING_STATUS_OPTIONS = ['draft', 'active'] as const

export const PADDLE_SKILL_LEVELS = ['beginner', 'intermediate', 'advanced', 'all'] as const
export const PADDLE_PLAYING_STYLES = ['control', 'power', 'all_court', 'balanced', 'spin'] as const

export type ListingFieldErrors = Partial<
  Record<
    | 'title'
    | 'description'
    | 'category_id'
    | 'brand_id'
    | 'listing_condition'
    | 'price'
    | 'quantity'
    | 'listing_status'
    | 'city'
    | 'province'
    | 'weight_grams'
    | 'weight_class'
    | 'control_score'
    | 'power_score'
    | 'skill_level'
    | 'playing_style',
    string
  >
>

export function validateListingTitle(value: string): string | null {
  const trimmed = value.trim()
  if (trimmed.length < 3) return 'Title must be at least 3 characters.'
  if (trimmed.length > MAX_LISTING_TITLE_LENGTH) {
    return `Title must be ${MAX_LISTING_TITLE_LENGTH} characters or fewer.`
  }
  return null
}

export function validateListingDescription(value: string): string | null {
  const trimmed = value.trim()
  if (trimmed.length === 0) return 'Description is required.'
  if (trimmed.length > MAX_LISTING_DESCRIPTION_LENGTH) {
    return `Description must be ${MAX_LISTING_DESCRIPTION_LENGTH} characters or fewer.`
  }
  return null
}

export function validateListingCategory(value: string): string | null {
  if (value.trim().length === 0) return 'Choose a category.'
  return null
}

export function validateListingCondition(value: string): string | null {
  if (!LISTING_CONDITIONS.some((condition) => condition === value)) {
    return 'Choose a condition.'
  }
  return null
}

export function validateListingPrice(value: string): string | null {
  const trimmed = value.trim()
  if (trimmed.length === 0) return 'Price is required.'
  const parsed = Number(trimmed)
  if (!Number.isFinite(parsed)) return 'Enter a valid price.'
  if (parsed < 0) return 'Price cannot be negative.'
  if (parsed > MAX_PRICE) return `Price cannot exceed ₱${MAX_PRICE.toLocaleString()}.`
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return 'Price supports at most 2 decimal places.'
  return null
}

export function validateListingQuantity(value: string, status: string): string | null {
  const trimmed = value.trim()
  if (trimmed.length === 0) return 'Quantity is required.'
  const parsed = Number(trimmed)
  if (!Number.isInteger(parsed)) return 'Quantity must be a whole number.'
  if (parsed < 0) return 'Quantity cannot be negative.'
  if (status === 'active' && parsed <= 0) {
    return 'An active listing needs at least 1 item in stock.'
  }
  return null
}

export function validateListingLocation(value: string, label: string): string | null {
  const trimmed = value.trim()
  if (trimmed.length > MAX_LISTING_LOCATION_LENGTH) {
    return `${label} must be ${MAX_LISTING_LOCATION_LENGTH} characters or fewer.`
  }
  return null
}

export function validatePaddleScore(value: string, label: string): string | null {
  const trimmed = value.trim()
  if (trimmed.length === 0) return null
  const parsed = Number(trimmed)
  if (!Number.isInteger(parsed)) return `${label} must be a whole number between 1 and 10.`
  if (parsed < 1 || parsed > 10) return `${label} must be between 1 and 10.`
  return null
}

export function validatePaddleWeight(value: string): string | null {
  const trimmed = value.trim()
  if (trimmed.length === 0) return null
  const parsed = Number(trimmed)
  if (!Number.isInteger(parsed)) return 'Weight must be a whole number of grams.'
  if (parsed < 150 || parsed > 400) return 'Weight must be between 150 and 400 grams.'
  return null
}

export function validatePaddleChoice(
  value: string,
  options: readonly string[],
  label: string,
): string | null {
  const trimmed = value.trim()
  if (trimmed.length === 0) return null
  if (!options.some((option) => option === trimmed)) {
    return `Choose a valid ${label}.`
  }
  return null
}

/**
 * Validates the full listing form. Paddle-only fields are validated only when
 * the selected category is a paddle listing; their values are optional, so an
 * empty select is always acceptable.
 */
export function validateListingForm(
  values: ListingFormValues,
  isPaddleCategory: boolean,
): ListingFieldErrors {
  const errors: ListingFieldErrors = {}

  const title = validateListingTitle(values.listing.title)
  if (title != null) errors.title = title

  const description = validateListingDescription(values.listing.description)
  if (description != null) errors.description = description

  const category = validateListingCategory(values.listing.category_id)
  if (category != null) errors.category_id = category

  const condition = validateListingCondition(values.listing.listing_condition)
  if (condition != null) errors.listing_condition = condition

  const price = validateListingPrice(values.listing.price)
  if (price != null) errors.price = price

  const quantity = validateListingQuantity(values.listing.quantity, values.listing.listing_status)
  if (quantity != null) errors.quantity = quantity

  const city = validateListingLocation(values.listing.city, 'City')
  if (city != null) errors.city = city

  const province = validateListingLocation(values.listing.province, 'Province / region')
  if (province != null) errors.province = province

  if (isPaddleCategory) {
    const weightGrams = validatePaddleWeight(values.paddle.weight_grams)
    if (weightGrams != null) errors.weight_grams = weightGrams

    const control = validatePaddleScore(values.paddle.control_score, 'Control score')
    if (control != null) errors.control_score = control

    const power = validatePaddleScore(values.paddle.power_score, 'Power score')
    if (power != null) errors.power_score = power

    const skill = validatePaddleChoice(values.paddle.skill_level, PADDLE_SKILL_LEVELS, 'skill level')
    if (skill != null) errors.skill_level = skill

    const style = validatePaddleChoice(
      values.paddle.playing_style,
      PADDLE_PLAYING_STYLES,
      'playing style',
    )
    if (style != null) errors.playing_style = style
  }

  return errors
}

export function hasListingFieldErrors(errors: ListingFieldErrors): boolean {
  return Object.values(errors).some((value) => value != null)
}
