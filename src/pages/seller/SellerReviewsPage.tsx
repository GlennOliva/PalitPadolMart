import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useSeller } from '../../features/seller/useSeller'
import {
  getMySellerReviews,
  getMySellerRatingSummary,
  getMySellerRatingDistribution,
} from '../../features/reviews/reviews.service'
import type {
  ReviewSortOption,
  SellerReviewWithListing,
} from '../../features/reviews/reviews.types'
import { SELLER_REVIEWS_PAGE_SIZE } from '../../features/reviews/reviews.types'
import StarRating from '../../components/reviews/StarRating'
import RatingDistribution from '../../components/reviews/RatingDistribution'
import LoadingState from '../../components/common/LoadingState'
import EmptyState from '../../components/common/EmptyState'
import Alert from '../../components/common/Alert'
import { formatDate } from '../../utils/format'

const RATING_FILTERS: { label: string; value: number | null }[] = [
  { label: 'All Ratings', value: null },
  { label: '5 Stars', value: 5 },
  { label: '4 Stars', value: 4 },
  { label: '3 Stars', value: 3 },
  { label: '2 Stars', value: 2 },
  { label: '1 Star', value: 1 },
]

const SORT_OPTIONS: { label: string; value: ReviewSortOption }[] = [
  { label: 'Newest', value: 'newest' },
  { label: 'Highest Rating', value: 'highest' },
  { label: 'Lowest Rating', value: 'lowest' },
]

export default function SellerReviewsPage() {
  const { sellerProfile } = useSeller()

  const [summary, setSummary] = useState<{ count: number; average: number | null } | null>(null)
  const [distribution, setDistribution] = useState<Record<number, number>>({})
  const [reviews, setReviews] = useState<SellerReviewWithListing[]>([])
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [ratingFilter, setRatingFilter] = useState<number | null>(null)
  const [sort, setSort] = useState<ReviewSortOption>('newest')

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    void Promise.all([
      getMySellerRatingSummary(),
      getMySellerRatingDistribution(),
      getMySellerReviews(1, SELLER_REVIEWS_PAGE_SIZE, ratingFilter, sort),
    ]).then(([summaryResult, distResult, listResult]) => {
      setLoading(false)
      if (summaryResult.error != null || listResult.error != null) {
        setError("We couldn't load your reviews right now.")
        return
      }
      const sum = summaryResult.data
      setSummary({ count: sum?.reviewCount ?? 0, average: sum?.averageRating ?? null })
      setDistribution(distResult.data ?? {})
      setReviews(listResult.data?.reviews ?? [])
      setPage(1)
      setHasMore(listResult.data?.hasMore ?? false)
    })
  }, [ratingFilter, sort])

  useEffect(() => {
    load()
  }, [load])

  const loadMore = () => {
    const next = page + 1
    setLoadingMore(true)
    void getMySellerReviews(next, SELLER_REVIEWS_PAGE_SIZE, ratingFilter, sort).then((result) => {
      setLoadingMore(false)
      if (result.error != null) return
      setReviews((prev) => [...prev, ...(result.data?.reviews ?? [])])
      setPage(next)
      setHasMore(result.data?.hasMore ?? false)
    })
  }

  if (sellerProfile == null) {
    return <LoadingState label="Loading your seller account…" />
  }

  return (
    <div className="container page">
      <h1 className="page__title">Customer Reviews</h1>
      <p className="page__intro">
        Reviews from completed customer purchases appear here.
      </p>

      {loading ? (
        <LoadingState label="Loading your reviews…" />
      ) : error != null ? (
        <Alert variant="error" message={error} />
      ) : (
        <>
          {/* Rating summary card */}
          <section className="seller-reviews-summary glass glass--strong" aria-label="Rating summary">
            <div className="seller-reviews-summary__main">
              <h2 className="seller-reviews-summary__heading">Overall Rating</h2>
              {summary != null && summary.count > 0 && summary.average != null ? (
                <>
                  <div className="seller-reviews-summary__rating">
                    <StarRating rating={summary.average} size="lg" label={`${summary.average.toFixed(1)} out of 5 stars`} />
                    <span className="seller-reviews-summary__average">
                      {summary.average.toFixed(1)}
                    </span>
                  </div>
                  <p className="seller-reviews-summary__count">
                    {summary.count} verified review{summary.count === 1 ? '' : 's'}
                  </p>
                </>
              ) : (
                <p className="seller-reviews-summary__empty">No reviews yet</p>
              )}
            </div>
            {summary != null && summary.count > 0 ? (
              <div className="seller-reviews-summary__distribution">
                <h3 className="seller-reviews-summary__dist-title">Rating Distribution</h3>
                <RatingDistribution counts={distribution} total={summary.count} />
              </div>
            ) : null}
          </section>

          {/* Filters */}
          <div
            className="seller-reviews-filters"
            role="group"
            aria-label="Filter and sort reviews"
          >
            <div className="seller-reviews-filters__group">
              <label htmlFor="seller-review-rating-filter" className="seller-reviews-filters__label">
                Filter
              </label>
              <select
                id="seller-review-rating-filter"
                className="seller-reviews-filters__select"
                value={ratingFilter ?? ''}
                onChange={(e) => {
                  const val = e.target.value
                  setRatingFilter(val === '' ? null : Number(val))
                }}
              >
                {RATING_FILTERS.map((opt) => (
                  <option key={opt.label} value={opt.value ?? ''}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="seller-reviews-filters__group">
              <label htmlFor="seller-review-sort" className="seller-reviews-filters__label">
                Sort
              </label>
              <select
                id="seller-review-sort"
                className="seller-reviews-filters__select"
                value={sort}
                onChange={(e) => setSort(e.target.value as ReviewSortOption)}
              >
                {SORT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Review list */}
          {reviews.length === 0 ? (
            <EmptyState
              title="No customer reviews yet"
              body="Reviews from completed customer purchases will appear here."
            />
          ) : (
            <ul className="review-list" aria-label="Customer reviews">
              {reviews.map((review) => (
                <li key={review.id} className="review-card">
                  <div className="review-card__header">
                    <div className="review-card__author">
                      {review.reviewerAvatar != null ? (
                        <img
                          className="review-card__avatar"
                          src={review.reviewerAvatar}
                          alt=""
                          loading="lazy"
                        />
                      ) : (
                        <span className="review-card__avatar review-card__avatar--fallback" aria-hidden="true">
                          {review.reviewerName.charAt(0).toUpperCase()}
                        </span>
                      )}
                      <div>
                        <p className="review-card__name">{review.reviewerName}</p>
                        {review.listingTitle != null ? (
                          <p className="review-card__meta">
                            {review.listingId != null ? (
                              <Link to={`/marketplace/${review.listingId}`}>
                                {review.listingTitle}
                              </Link>
                            ) : (
                              review.listingTitle
                            )}
                          </p>
                        ) : null}
                        <p className="review-card__date">
                          Verified purchase · {formatDate(review.createdAt)}
                        </p>
                      </div>
                    </div>
                    <StarRating rating={review.rating} size="sm" />
                  </div>
                  {review.comment != null && review.comment.length > 0 ? (
                    <p className="review-card__comment">{review.comment}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}

          {hasMore ? (
            <div className="review-section__more">
              <button
                type="button"
                className="btn btn--secondary"
                disabled={loadingMore}
                onClick={loadMore}
              >
                {loadingMore ? 'Loading…' : 'Load more reviews'}
              </button>
            </div>
          ) : null}
        </>
      )}

      <nav className="page-actions" aria-label="Related actions">
        <Link className="btn" to="/seller/dashboard">
          Back to dashboard
        </Link>
      </nav>
    </div>
  )
}
