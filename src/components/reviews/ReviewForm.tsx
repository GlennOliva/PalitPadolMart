import { useState } from 'react'
import StarRatingInput from './StarRatingInput'
import Alert from '../common/Alert'
import SubmitButton from '../common/SubmitButton'
import { validateReviewInput, hasReviewFormErrors } from '../../features/reviews/reviews-validation'
import {
  reviewErrorLabel,
  submitReview,
} from '../../features/reviews/reviews.service'
import { REVIEW_COMMENT_MAX_LENGTH } from '../../features/reviews/reviews.types'
import type { ReviewRecord } from '../../features/reviews/reviews.types'

interface ReviewFormProps {
  orderItemId: string
  productTitle: string
  onSuccess: (review: ReviewRecord) => void
}

/**
 * Buyer-facing review form. Mirrors the hardened submit pattern from the
 * payment panel: validate → submit via the security-definer RPC → map the
 * structured error code to user copy. The server remains authoritative.
 */
export default function ReviewForm({ orderItemId, productTitle, onSuccess }: ReviewFormProps) {
  const [productRating, setProductRating] = useState<number | undefined>(undefined)
  const [sellerRating, setSellerRating] = useState<number | undefined>(undefined)
  const [comment, setComment] = useState('')
  const [fieldErrors, setFieldErrors] = useState<{ productRating?: string; sellerRating?: string; comment?: string }>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const errors = validateReviewInput({ productRating, sellerRating, comment })
    setFieldErrors(errors)
    if (hasReviewFormErrors(errors)) return

    setSubmitting(true)
    setSubmitError(null)
    void submitReview({
      orderItemId,
      productRating: productRating as number,
      sellerRating: sellerRating as number,
      comment,
    }).then((result) => {
      setSubmitting(false)
      if (result.error != null || result.data == null) {
        setSubmitError(reviewErrorLabel(result.error?.code ?? 'UNKNOWN'))
        return
      }
      onSuccess(result.data)
    })
  }

  return (
    <form className="review-form" onSubmit={handleSubmit} noValidate>
      <p className="review-form__title">Reviewing: {productTitle}</p>

      <StarRatingInput
        id="review-product-rating"
        label="Product rating"
        value={productRating}
        onChange={setProductRating}
        error={fieldErrors.productRating}
      />

      <StarRatingInput
        id="review-seller-rating"
        label="Seller rating"
        value={sellerRating}
        onChange={setSellerRating}
        error={fieldErrors.sellerRating}
      />

      <div className="form-field">
        <label className="form-field__label" htmlFor="review-comment">
          Review
        </label>
        <textarea
          className="form-field__textarea"
          id="review-comment"
          rows={5}
          maxLength={REVIEW_COMMENT_MAX_LENGTH}
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          aria-invalid={fieldErrors.comment != null ? true : undefined}
          placeholder="Share your experience with this paddle and seller (optional)."
        />
        {fieldErrors.comment != null ? (
          <p className="form-field__error">{fieldErrors.comment}</p>
        ) : (
          <p className="form-field__hint">
            {comment.length}/{REVIEW_COMMENT_MAX_LENGTH} characters
          </p>
        )}
      </div>

      {submitError != null ? <Alert variant="error" message={submitError} /> : null}
      <p className="review-form__note">
        By submitting, you confirm this was a verified purchase. Your review is posted
        publicly and cannot be edited.
      </p>

      <SubmitButton loading={submitting} loadingLabel="Submitting review…">
        Submit review
      </SubmitButton>
    </form>
  )
}