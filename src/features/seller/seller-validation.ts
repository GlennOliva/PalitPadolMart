import { MAX_NAME_LENGTH } from '../auth/validation'
import type { SellerApplicationInput } from './seller.types'

export const MAX_SELLER_DESCRIPTION_LENGTH = 1000
export const MAX_SELLER_LOCATION_LENGTH = 100
export const MAX_PICKUP_LOCATION_LENGTH = 200
export const MAX_PICKUP_INSTRUCTIONS_LENGTH = 500

export type SellerFieldErrors = Partial<Record<keyof SellerApplicationInput, string>>

export function validateStoreName(value: string): string | null {
  const trimmed = value.trim()
  if (trimmed.length === 0) return 'Store name is required.'
  if (trimmed.length > MAX_NAME_LENGTH) {
    return `Store name must be ${MAX_NAME_LENGTH} characters or fewer.`
  }
  return null
}

export function validateSellerDescription(value: string): string | null {
  const trimmed = value.trim()
  if (trimmed.length > MAX_SELLER_DESCRIPTION_LENGTH) {
    return `Description must be ${MAX_SELLER_DESCRIPTION_LENGTH} characters or fewer.`
  }
  return null
}

export function validateSellerLocation(value: string, label: string): string | null {
  const trimmed = value.trim()
  if (trimmed.length > MAX_SELLER_LOCATION_LENGTH) {
    return `${label} must be ${MAX_SELLER_LOCATION_LENGTH} characters or fewer.`
  }
  return null
}

export function validatePickupLocation(value: string): string | null {
  const trimmed = value.trim()
  if (trimmed.length > MAX_PICKUP_LOCATION_LENGTH) {
    return `Pickup location must be ${MAX_PICKUP_LOCATION_LENGTH} characters or fewer.`
  }
  return null
}

export function validatePickupInstructions(value: string): string | null {
  const trimmed = value.trim()
  if (trimmed.length > MAX_PICKUP_INSTRUCTIONS_LENGTH) {
    return `Pickup instructions must be ${MAX_PICKUP_INSTRUCTIONS_LENGTH} characters or fewer.`
  }
  return null
}

export function validateSellerApplication(input: SellerApplicationInput): SellerFieldErrors {
  const errors: SellerFieldErrors = {}
  const storeName = validateStoreName(input.store_name)
  if (storeName != null) errors.store_name = storeName
  const description = validateSellerDescription(input.description)
  if (description != null) errors.description = description
  const city = validateSellerLocation(input.city, 'City')
  if (city != null) errors.city = city
  const province = validateSellerLocation(input.province, 'Province / region')
  if (province != null) errors.province = province
  const pickupLocation = validatePickupLocation(input.pickup_location)
  if (pickupLocation != null) errors.pickup_location = pickupLocation
  const pickupInstructions = validatePickupInstructions(input.pickup_instructions)
  if (pickupInstructions != null) errors.pickup_instructions = pickupInstructions
  return errors
}

export function hasSellerErrors(errors: SellerFieldErrors): boolean {
  return Object.values(errors).some((value) => value != null)
}
