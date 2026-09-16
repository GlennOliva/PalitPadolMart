import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { AdminReviewActionInput, AdminReviewListRow, ReviewStatus } from '../../features/admin/admin.types'
import type { AdminPageItem } from '../../features/admin/admin.types'
import { DEFAULT_ADMIN_REVIEWS_SEARCH, parseAdminReviewsSearch, serializeAdminReviewsSearch } from '../../features/admin/admin-params'
import { listAdminReviews, hideReview, restoreReview } from '../../features/admin/admin-marketplace.service'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import PageHeader from '../../components/common/PageHeader'
import LoadingState from '../../components/common/LoadingState'
import Alert from '../../components/common/Alert'
import EmptyState from '../../components/common/EmptyState'
import Badge from '../../components/common/Badge'
import AdminActionDialog from '../../components/admin/AdminActionDialog'
import Pagination from '../../components/marketplace/Pagination'
import { formatDate } from '../../utils/format'

type SortOption = 'newest' | 'oldest' | 'rating_asc' | 'rating_desc'

const SORT_OPTIONS: { label: string; value: SortOption }[] = [
  { label: 'Newest', value: 'newest' },
  { label: 'Oldest', value: 'oldest' },
  { label: 'Rating low–high', value: 'rating_asc' },
  { label: 'Rating high–low', value: 'rating_desc' },
]

const STATUS_OPTIONS: { label: string; value: ReviewStatus | '' }[] = [
  { label: 'All statuses', value: '' },
  { label: 'Approved', value: 'approved' },
  { label: 'Hidden', value: 'hidden' },
]

const RATING_OPTIONS: { label: string; value: number | '' }[] = [
  { label: 'All ratings', value: '' },
  { label: '5 stars', value: 5 },
  { label: '4 stars', value: 4 },
  { label: '3 stars', value: 3 },
  { label: '2 stars', value: 2 },
  { label: '1 star', value: 1 },
]

function renderStars(rating: number): string {
  return '\u2605'.repeat(rating) + '\u2606'.repeat(5 - rating)
}

export default function AdminReviewsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const searchKey = useMemo(() => searchParams.toString(), [searchParams])
  const state = useMemo(() => parseAdminReviewsSearch(new URLSearchParams(searchKey)), [searchKey])

  const [queryInput, setQueryInput] = useState(state.search)
  const debouncedQuery = useDebouncedValue(queryInput)
  const ackedQuery = useRef(state.search)

  const [result, setResult] = useState<Awaited<ReturnType<typeof listAdminReviews>>['data']>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [actionKind, setActionKind] = useState<'hide' | 'restore'>('hide')
  const [actionTarget, setActionTarget] = useState<AdminPageItem<AdminReviewListRow> | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  useEffect(() => {
    if (debouncedQuery !== queryInput) return
    if (debouncedQuery === state.search) return
    if (debouncedQuery === ackedQuery.current) return
    ackedQuery.current = debouncedQuery
    setSearchParams(
      serializeAdminReviewsSearch({ ...state, search: debouncedQuery, page: 1 }),
      { replace: true },
    )
  }, [debouncedQuery, queryInput, state, setSearchParams])

  useEffect(() => {
    if (state.search === ackedQuery.current) return
    setQueryInput(state.search)
    ackedQuery.current = state.search
  }, [state.search])

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)
    void listAdminReviews(state).then(({ data, error: loadError }) => {
      if (!active) return
      if (loadError != null || data == null) {
        setError('We could not load reviews. Please try again.')
        setResult(null)
      } else if (data.totalPages > 0 && state.page > data.totalPages && state.page !== 1) {
        setSearchParams(serializeAdminReviewsSearch({ ...state, page: 1 }), { replace: true })
      } else {
        setResult(data)
      }
      setLoading(false)
    })
    return () => { active = false }
  }, [refreshKey, state, setSearchParams])

  function updateFilter(patch: Partial<{ status: ReviewStatus | ''; rating: number | ''; sort: SortOption }>) {
    const next = { ...state, page: 1 }
    if ('status' in patch) next.status = patch.status != null && patch.status !== '' ? patch.status : null
    if ('rating' in patch) next.rating = patch.rating != null && patch.rating !== '' ? patch.rating : null
    if ('sort' in patch) next.sort = patch.sort ?? state.sort
    setSearchParams(serializeAdminReviewsSearch(next))
  }

  function openDialog(kind: 'hide' | 'restore', review: AdminPageItem<AdminReviewListRow>) {
    setActionKind(kind)
    setActionTarget(review)
    setActionError(null)
    setDialogOpen(true)
  }

  async function handleConfirm(reason: string) {
    if (actionTarget == null) return
    setActionLoading(true)
    setActionError(null)
    const input: AdminReviewActionInput = { reviewId: actionTarget.review_id, reason }
    const fn = actionKind === 'hide' ? hideReview : restoreReview
    const { error: actionErr } = await fn(input)
    setActionLoading(false)
    if (actionErr != null) {
      setActionError(actionErr.message)
      setDialogOpen(false)
      return
    }
    setDialogOpen(false)
    setRefreshKey((k) => k + 1)
  }

  return (
    <div className="page admin-resource-page">
      <PageHeader title="Reviews" intro="Moderate customer reviews across the marketplace." />

      {actionError != null && !dialogOpen && <Alert variant="error" message={actionError} />}

      <div className="admin-resource-toolbar">
        <div className="admin-resource-toolbar__row">
          <div className="admin-resource-toolbar__search">
            <input
              type="search"
              placeholder="Search by comment, listing, reviewer, or store…"
              value={queryInput}
              onChange={(e) => setQueryInput(e.target.value)}
              aria-label="Search reviews"
            />
          </div>
          <div className="admin-resource-toolbar__filter">
            <label>
              <span>Status</span>
              <select value={state.status ?? ''} onChange={(e) => updateFilter({ status: e.target.value as ReviewStatus | '' })}>
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Rating</span>
              <select value={state.rating ?? ''} onChange={(e) => updateFilter({ rating: e.target.value === '' ? '' : Number(e.target.value) })}>
                {RATING_OPTIONS.map((o) => (
                  <option key={String(o.value)} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Sort</span>
              <select value={state.sort} onChange={(e) => updateFilter({ sort: e.target.value as SortOption })}>
                {SORT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </div>

      {loading ? (
        <LoadingState label="Loading reviews…" />
      ) : error != null ? (
        <Alert variant="error" message={error} />
      ) : result != null && result.items.length > 0 ? (
        <>
          <p className="admin-resource-toolbar__count" aria-live="polite">
            Showing {result.items.length} of {result.total} review{result.total === 1 ? '' : 's'}
          </p>
          <div className="admin-resource-table">
            <table>
              <caption className="visually-hidden">Product and seller reviews</caption>
              <thead>
                <tr>
                  <th>Rating</th>
                  <th>Listing</th>
                  <th>Reviewer</th>
                  <th>Store</th>
                  <th>Status</th>
                  <th>Order</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {result.items.map((row) => (
                  <tr key={row.review_id}>
                    <td>
                      <span className="admin-resource-table__stars" aria-label={`${row.rating} out of 5 stars`}>
                        {renderStars(row.rating)}
                      </span>
                    </td>
                    <td>{row.listing_title}</td>
                    <td>{row.reviewer_name}</td>
                    <td>{row.store_name}</td>
                    <td className="admin-resource-table__badge-cell">
                      <Badge variant={row.status}>{row.status}</Badge>
                    </td>
                    <td>{row.order_number}</td>
                    <td>{formatDate(row.created_at)}</td>
                    <td>
                      <div className="admin-resource-table__actions">
                        {row.status === 'approved' && (
                          <button type="button" className="btn btn--secondary" onClick={() => openDialog('hide', row)}>Hide</button>
                        )}
                        {row.status === 'hidden' && (
                          <button type="button" className="btn btn--secondary" onClick={() => openDialog('restore', row)}>Restore</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={result.page} totalPages={result.totalPages} onPageChange={(page) => setSearchParams(serializeAdminReviewsSearch({ ...state, page }))} />
        </>
      ) : (
        <EmptyState title="No reviews found" body="Try adjusting your search or filters." action={
          <button type="button" className="btn btn--primary" onClick={() => setSearchParams(serializeAdminReviewsSearch(DEFAULT_ADMIN_REVIEWS_SEARCH))}>Clear filters</button>
        } />
      )}

      <AdminActionDialog
        open={dialogOpen}
        title={actionTarget != null ? `${actionKind === 'hide' ? 'Hide' : 'Restore'} review — ${actionTarget.reviewer_name}` : actionKind === 'hide' ? 'Hide review' : 'Restore review'}
        description="This action requires a reason and cannot be undone."
        confirmLabel={actionKind === 'hide' ? 'Hide' : 'Restore'}
        loading={actionLoading}
        loadingLabel="Working…"
        reasonRequired
        reasonPlaceholder="Explain why this action is being taken…"
        onCancel={() => setDialogOpen(false)}
        onConfirm={handleConfirm}
      />
    </div>
  )
}
