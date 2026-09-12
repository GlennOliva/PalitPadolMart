import { describe, it, expect } from 'vitest'
import type { ListingFormValues } from '../../src/features/marketplace/marketplace.types'
import {
  hasListingFieldErrors,
  validateListingForm,
  validateListingPrice,
  validateListingQuantity,
  validateListingTitle,
  validatePaddleScore,
  validatePaddleWeight,
} from '../../src/features/marketplace/marketplace-validation'

function emptyForm(): ListingFormValues {
  return {
    listing: {
      category_id: '',
      brand_id: null,
      title: '',
      description: '',
      listing_condition: 'new',
      price: '',
      quantity: '1',
      listing_status: 'draft',
      city: '',
      province: '',
      pickup_available: false,
      delivery_available: false,
    },
    paddle: {
      weight_grams: '',
      weight_class: '',
      control_score: '',
      power_score: '',
      skill_level: '',
      playing_style: '',
    },
  }
}

describe('validateListingTitle', () => {
  it('rejects titles shorter than 3 characters', () => {
    expect(validateListingTitle('AB')).not.toBeNull()
  })

  it('accepts titles of at least 3 characters', () => {
    expect(validateListingTitle('  Ace Paddle  ')).toBeNull()
  })

  it('rejects titles longer than 120 characters', () => {
    expect(validateListingTitle('x'.repeat(121))).not.toBeNull()
    expect(validateListingTitle('x'.repeat(120))).toBeNull()
  })
})

describe('validateListingPrice', () => {
  it('requires a price', () => {
    expect(validateListingPrice('  ')).not.toBeNull()
  })

  it('rejects non-numeric input', () => {
    expect(validateListingPrice('abc')).not.toBeNull()
  })

  it('rejects negative prices', () => {
    expect(validateListingPrice('-5')).not.toBeNull()
  })

  it('rejects more than 2 decimal places', () => {
    expect(validateListingPrice('1.999')).not.toBeNull()
    expect(validateListingPrice('1.99')).toBeNull()
  })

  it('accepts whole pesos', () => {
    expect(validateListingPrice('2500')).toBeNull()
  })
})

describe('validateListingQuantity', () => {
  it('requires a whole number', () => {
    expect(validateListingQuantity('2.5', 'draft')).not.toBeNull()
    expect(validateListingQuantity('3', 'draft')).toBeNull()
  })

  it('rejects zero stock for active listings', () => {
    expect(validateListingQuantity('0', 'active')).not.toBeNull()
    expect(validateListingQuantity('0', 'draft')).toBeNull()
    expect(validateListingQuantity('1', 'active')).toBeNull()
  })
})

describe('validatePaddleWeight', () => {
  it('accepts empty values', () => {
    expect(validatePaddleWeight('')).toBeNull()
  })

  it('accepts a valid gram weight', () => {
    expect(validatePaddleWeight('220')).toBeNull()
  })

  it('rejects out-of-range weights', () => {
    expect(validatePaddleWeight('100')).not.toBeNull()
    expect(validatePaddleWeight('500')).not.toBeNull()
  })
})

describe('validatePaddleScore', () => {
  it('accepts empty values', () => {
    expect(validatePaddleScore('', 'Control score')).toBeNull()
  })

  it('accepts scores between 1 and 10', () => {
    expect(validatePaddleScore('7', 'Control score')).toBeNull()
  })

  it('rejects out-of-range or fractional scores', () => {
    expect(validatePaddleScore('0', 'Control score')).not.toBeNull()
    expect(validatePaddleScore('11', 'Control score')).not.toBeNull()
    expect(validatePaddleScore('7.5', 'Control score')).not.toBeNull()
  })
})

describe('validateListingForm', () => {
  it('collects errors for an empty form', () => {
    const errors = validateListingForm(emptyForm(), false)
    expect(errors.title).toBeDefined()
    expect(errors.description).toBeDefined()
    expect(errors.category_id).toBeDefined()
    expect(errors.price).toBeDefined()
    expect(hasListingFieldErrors(errors)).toBe(true)
  })

  it('passes a fully filled paddle form', () => {
    const form = emptyForm()
    form.listing.title = 'Selkirk Vanguard Power'
    form.listing.description = 'A great paddle in top shape.'
    form.listing.category_id = 'cat-1'
    form.listing.price = '8500'
    form.listing.quantity = '2'
    form.paddle.weight_grams = '220'
    form.paddle.control_score = '8'
    form.paddle.power_score = '9'
    form.paddle.skill_level = 'intermediate'
    form.paddle.playing_style = 'all_court'

    const errors = validateListingForm(form, true)
    expect(hasListingFieldErrors(errors)).toBe(false)
  })

  it('skips paddle validation when the category is not a paddle', () => {
    const form = emptyForm()
    form.listing.title = 'Tournament Balls'
    form.listing.description = 'A dozen indoor balls.'
    form.listing.category_id = 'cat-2'
    form.listing.price = '1200'
    form.listing.quantity = '1'
    form.paddle.weight_grams = '999'

    const errors = validateListingForm(form, false)
    expect(errors.weight_grams).toBeUndefined()
  })

  it('rejects zero quantity when the seller sets status active', () => {
    const form = emptyForm()
    form.listing.title = 'Test paddle'
    form.listing.description = 'A paddle.'
    form.listing.category_id = 'cat-1'
    form.listing.price = '1000'
    form.listing.quantity = '0'
    form.listing.listing_status = 'active'

    const errors = validateListingForm(form, false)
    expect(errors.quantity).toBeDefined()
  })
})
