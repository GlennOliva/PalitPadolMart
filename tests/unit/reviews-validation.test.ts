import { describe, it, expect } from 'vitest'
import {
  validateReviewInput,
  hasReviewFormErrors,
  RATING,
} from '../../src/features/reviews/reviews-validation'
import { REVIEW_COMMENT_MAX_LENGTH } from '../../src/features/reviews/reviews.types'

describe('validateReviewInput', () => {
  it('accepts valid integer ratings and a short comment', () => {
    const errors = validateReviewInput({ productRating: 5, sellerRating: 1, comment: 'Great!' })
    expect(errors).toEqual({})
    expect(hasReviewFormErrors(errors)).toBe(false)
  })

  it('rejects out-of-range product ratings', () => {
    for (const value of [0, -1, 6, 100]) {
      const errors = validateReviewInput({ productRating: value, sellerRating: 3, comment: '' })
      expect(errors.productRating).toContain(`${RATING.min} to ${RATING.max}`)
      expect(hasReviewFormErrors(errors)).toBe(true)
    }
  })

  it('rejects non-integer ratings', () => {
    const errors = validateReviewInput({ productRating: 3.5, sellerRating: 3, comment: '' })
    expect(errors.productRating).toBeDefined()
  })

  it('rejects out-of-range seller ratings', () => {
    const errors = validateReviewInput({ productRating: 3, sellerRating: 7, comment: '' })
    expect(errors.sellerRating).toBeDefined()
    expect(hasReviewFormErrors(errors)).toBe(true)
  })

  it('rejects a comment longer than the max length', () => {
    const errors = validateReviewInput({
      productRating: 4,
      sellerRating: 4,
      comment: 'x'.repeat(REVIEW_COMMENT_MAX_LENGTH + 1),
    })
    expect(errors.comment).toContain(String(REVIEW_COMMENT_MAX_LENGTH))
  })

  it('allows a comment exactly at the max length', () => {
    const errors = validateReviewInput({
      productRating: 4,
      sellerRating: 4,
      comment: 'x'.repeat(REVIEW_COMMENT_MAX_LENGTH),
    })
    expect(errors.comment).toBeUndefined()
  })

  it('treats an undefined rating as invalid', () => {
    const errors = validateReviewInput({ productRating: undefined, sellerRating: 2, comment: '' })
    expect(errors.productRating).toBeDefined()
    expect(hasReviewFormErrors(errors)).toBe(true)
  })
})