import { describe, it, expect } from 'vitest'
import {
  hasSellerErrors,
  validateSellerApplication,
  validateSellerDescription,
  validateSellerLocation,
  validateStoreName,
} from '../../src/features/seller/seller-validation'

describe('seller form validation', () => {
  describe('validateStoreName', () => {
    it('requires a store name', () => {
      expect(validateStoreName('')).toBe('Store name is required.')
      expect(validateStoreName('   ')).toBe('Store name is required.')
    })

    it('rejects names longer than 120 characters', () => {
      expect(validateStoreName('a'.repeat(121))).toBe(
        'Store name must be 120 characters or fewer.',
      )
    })

    it('accepts a valid store name', () => {
      expect(validateStoreName('Ace Paddles PH')).toBeNull()
    })
  })

  describe('validateSellerDescription', () => {
    it('allows an empty description', () => {
      expect(validateSellerDescription('')).toBeNull()
    })

    it('rejects descriptions longer than 1000 characters', () => {
      expect(validateSellerDescription('a'.repeat(1001))).toBe(
        'Description must be 1000 characters or fewer.',
      )
    })

    it('accepts a description within the limit', () => {
      expect(validateSellerDescription('Paddles and bags.')).toBeNull()
    })
  })

  describe('validateSellerLocation', () => {
    it('allows an empty location', () => {
      expect(validateSellerLocation('', 'City')).toBeNull()
    })

    it('rejects locations longer than 100 characters', () => {
      expect(validateSellerLocation('a'.repeat(101), 'City')).toBe(
        'City must be 100 characters or fewer.',
      )
    })
  })

  describe('validateSellerApplication', () => {
    const valid = {
      store_name: 'Ace Paddles PH',
      description: 'Fresh paddles.',
      city: 'Cebu City',
      province: 'Cebu',
      pickup_available: true,
      delivery_available: false,
      pickup_location: 'Metro Park, Dumanjug',
      pickup_instructions: 'Look for the white van.',
    }

    it('returns no errors for a valid application', () => {
      expect(validateSellerApplication(valid)).toEqual({})
    })

    it('reports a missing store name but leaves toggles untouched', () => {
      const errors = validateSellerApplication({ ...valid, store_name: '  ' })
      expect(errors.store_name).toBe('Store name is required.')
      expect(errors.pickup_available).toBeUndefined()
      expect(errors.delivery_available).toBeUndefined()
    })
  })

  describe('hasSellerErrors', () => {
    it('returns false when there are no errors', () => {
      expect(hasSellerErrors({})).toBe(false)
    })

    it('returns true when any field has an error', () => {
      expect(hasSellerErrors({ store_name: 'Store name is required.' })).toBe(true)
    })
  })
})
