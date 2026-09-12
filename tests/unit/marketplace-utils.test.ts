import { describe, it, expect } from 'vitest'
import {
  formatListingCondition,
  formatListingStatus,
  isPaddleCategorySlug,
  isPubliclyVisible,
  sortListingImages,
} from '../../src/features/marketplace/marketplace-utils'

describe('isPubliclyVisible', () => {
  it('is visible only when active and in stock', () => {
    expect(isPubliclyVisible({ listing_status: 'active', quantity: 2 })).toBe(true)
    expect(isPubliclyVisible({ listing_status: 'active', quantity: 0 })).toBe(false)
    expect(isPubliclyVisible({ listing_status: 'draft', quantity: 2 })).toBe(false)
    expect(isPubliclyVisible({ listing_status: 'sold', quantity: 0 })).toBe(false)
  })
})

describe('formatListingStatus', () => {
  it('maps every status to a readable label', () => {
    expect(formatListingStatus('draft')).toBe('Draft')
    expect(formatListingStatus('active')).toBe('Active')
    expect(formatListingStatus('sold')).toBe('Sold')
    expect(formatListingStatus('archived')).toBe('Archived')
    expect(formatListingStatus('removed')).toBe('Removed')
  })
})

describe('formatListingCondition', () => {
  it('maps every condition to a readable label', () => {
    expect(formatListingCondition('new')).toBe('New')
    expect(formatListingCondition('like_new')).toBe('Like new')
    expect(formatListingCondition('used')).toBe('Used')
    expect(formatListingCondition('heavily_used')).toBe('Heavily used')
  })
})

describe('isPaddleCategorySlug', () => {
  it('returns true only for the paddles slug', () => {
    expect(isPaddleCategorySlug('paddles')).toBe(true)
    expect(isPaddleCategorySlug('balls')).toBe(false)
    expect(isPaddleCategorySlug('')).toBe(false)
  })
})

describe('sortListingImages', () => {
  const base = { url: 'https://example.com/a.jpg', storage_path: null }

  it('puts the primary image first', () => {
    const images = [
      { id: 'b', is_primary: false, sort_order: 0, ...base },
      { id: 'a', is_primary: true, sort_order: 1, ...base },
    ]
    expect(sortListingImages(images).map((image) => image.id)).toEqual(['a', 'b'])
  })

  it('orders by sort_order within the same primary flag', () => {
    const images = [
      { id: 'c', is_primary: false, sort_order: 2, ...base },
      { id: 'a', is_primary: false, sort_order: 0, ...base },
      { id: 'b', is_primary: false, sort_order: 1, ...base },
    ]
    expect(sortListingImages(images).map((image) => image.id)).toEqual(['a', 'b', 'c'])
  })

  it('ties break on id and never mutate the input', () => {
    const images = [
      { id: 'z', is_primary: false, sort_order: 0, ...base },
      { id: 'a', is_primary: false, sort_order: 0, ...base },
    ]
    expect(sortListingImages(images).map((image) => image.id)).toEqual(['a', 'z'])
    expect(images.map((image) => image.id)).toEqual(['z', 'a'])
  })

  it('treats null, undefined, or empty collections as no images', () => {
    expect(sortListingImages(null)).toEqual([])
    expect(sortListingImages(undefined)).toEqual([])
    expect(sortListingImages([])).toEqual([])
  })
})
