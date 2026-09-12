import { REVIEW_COMMENT_MAX_LENGTH } from './reviews.types'

export interface ReviewFieldErrors {
  productRating?: string
  sellerRating?: string
  comment?: string
}

export const RATING = {
  min: 1,
  max: 5,
} as const

function isValidRating(value: number | undefined): boolean {
  return (
    value != null &&
    Number.isInteger(value) &&
    value >= RATING.min &&
    value <= RATING.max
  )
}

/**
 * Client-side validation for the review form. The server (`submit_review`)
 * remains authoritative; this only gives fast, specific feedback.
 */
export function validateReviewInput(input: {
  productRating: number | undefined
  sellerRating: number | undefined
  comment: string
}): ReviewFieldErrors {
  const errors: ReviewFieldErrors = {}
  if (!isValidRating(input.productRating)) {
    errors.productRating = `Choose a product rating from ${RATING.min} to ${RATING.max} stars.`
  }
  if (!isValidRating(input.sellerRating)) {
    errors.sellerRating = `Choose a seller rating from ${RATING.min} to ${RATING.max} stars.`
  }
  if (input.comment.trim().length > REVIEW_COMMENT_MAX_LENGTH) {
    errors.comment = `Your review must be at most ${REVIEW_COMMENT_MAX_LENGTH} characters.`
  }
  return errors
}

export const hasReviewFormErrors = (errors: ReviewFieldErrors): boolean =>
  errors.productRating != null || errors.sellerRating != null || errors.comment != null