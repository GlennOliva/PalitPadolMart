import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { AdminListingActionInput, AdminListingListRow, ListingStatus } from '../../features/admin/admin.types'
import type { AdminPageItem } from '../../features/admin/admin.types'
import { DEFAULT_ADMIN_LISTINGS_SEARCH, parseAdminListingsSearch, serializeAdminListingsSearch } from '../../features/admin/admin-params'
import { listAdminListings, removeListing, restoreListing } from '../../features/admin/admin-marketplace.service'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import PageHeader from '../../components/common/PageHeader'
import LoadingState from '../../components/common/LoadingState'
import Alert from '../../components/common/Alert'
import EmptyState from '../../components/common/EmptyState'
import Badge from '../../components/common/Badge'
import AdminActionDialog from '../../components/admin/AdminActionDialog'
import Pagination from '../../components/marketplace/Pagination'
import { formatCurrency, formatDate } from '../../utils/format'

type SortOption = 'newest' | 'oldest' | 'price_asc' | 'price_desc' | 'title_asc'

const SORT_OPTIONS: { label: string; value: SortOption }[] = [
  { label: 'Newest', value: 'newest' },
  { label: 'Oldest', value: 'oldest' },
  { label: 'Price low–high', value: 'price_asc' },
  { label: 'Price high–low', value: 'price_desc' },
  { label: 'Title A–Z', value: 'title_asc' },
]

const STATUS_OPTIONS: { label: string; value: ListingStatus | '' }[] = [
  { label: 'All statuses', value: '' },
  { label: 'Draft', value: 'draft' },
  { label: 'Active', value: 'active' },
  { label: 'Sold', value: 'sold' },
  { label: 'Archived', value: 'archived' },
  { label: 'Removed', value: 'removed' },
]

export default function AdminListingsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const searchKey = useMemo(() => searchParams.toString(), [searchParams])
  const state = useMemo(() => parseAdminListingsSearch(new URLSearchParams(searchKey)), [searchKey])

  const [queryInput, setQueryInput] = useState(state.search)
  const debouncedQuery = useDebouncedValue(queryInput)
  const ackedQuery = useRef(state.search)

  const [result, setResult] = useState<Awaited<ReturnType<typeof listAdminListings>>['data']>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [actionKind, setActionKind] = useState<'remove' | 'restore'>('remove')
  const [actionTarget, setActionTarget] = useState<AdminPageItem<AdminListingListRow> | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  useEffect(() => {
    if (debouncedQuery !== queryInput) return
    if (debouncedQuery === state.search) return
    if (debouncedQuery === ackedQuery.current) return
    ackedQuery.current = debouncedQuery
    setSearchParams(
      serializeAdminListingsSearch({ ...state, search: debouncedQuery, page: 1 }),
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
    void listAdminListings(state).then(({ data, error: loadError }) => {
      if (!active) return
      if (loadError != null || data == null) {
        setError('We could not load listings. Please try again.')
        setResult(null)
      } else if (data.totalPages > 0 && state.page > data.totalPages && state.page !== 1) {
        setSearchParams(serializeAdminListingsSearch({ ...state, page: 1 }), { replace: true })
      } else {
        setResult(data)
      }
      setLoading(false)
    })
    return () => { active = false }
  }, [refreshKey, state, setSearchParams])

  function updateFilter(patch: Partial<{ status: ListingStatus | ''; sort: SortOption }>) {
    const next = { ...state, page: 1 }
    if ('status' in patch) next.status = patch.status != null && patch.status !== '' ? patch.status : null
    if ('sort' in patch) next.sort = patch.sort ?? state.sort
    setSearchParams(serializeAdminListingsSearch(next))
  }

  function openDialog(kind: 'remove' | 'restore', listing: AdminPageItem<AdminListingListRow>) {
    setActionKind(kind)
    setActionTarget(listing)
    setActionError(null)
    setDialogOpen(true)
  }

  async function handleConfirm(reason: string) {
    if (actionTarget == null) return
    setActionLoading(true)
    setActionError(null)
    const input: AdminListingActionInput = { listingId: actionTarget.listing_id, reason }
    const fn = actionKind === 'remove' ? removeListing : restoreListing
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

  function canRemove(status: ListingStatus) {
    return status === 'active' || status === 'draft' || status === 'sold' || status === 'archived'
  }

  return (
    <div className="page admin-resource-page">
      <PageHeader title="Listings" intro="Review and moderate marketplace listings." />

      {actionError != null && !dialogOpen && <Alert variant="error" message={actionError} />}

      <div className="admin-resource-toolbar">
        <div className="admin-resource-toolbar__row">
          <div className="admin-resource-toolbar__search">
            <input
              type="search"
              placeholder="Search by title or store name…"
              value={queryInput}
              onChange={(e) => setQueryInput(e.target.value)}
              aria-label="Search listings"
            />
          </div>
          <div className="admin-resource-toolbar__filter">
            <label>
              <span>Status</span>
              <select value={state.status ?? ''} onChange={(e) => updateFilter({ status: e.target.value as ListingStatus | '' })}>
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
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
        <LoadingState label="Loading listings…" />
      ) : error != null ? (
        <Alert variant="error" message={error} />
      ) : result != null && result.items.length > 0 ? (
        <>
          <p className="admin-resource-toolbar__count" aria-live="polite">
            Showing {result.items.length} of {result.total} listing{result.total === 1 ? '' : 's'}
          </p>
          <div className="admin-resource-table">
            <table>
              <caption className="visually-hidden">Marketplace listings</caption>
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Price</th>
                  <th>Status</th>
                  <th>Category</th>
                  <th>Brand</th>
                  <th>Store</th>
                  <th>Reports</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {result.items.map((row) => (
                  <tr key={row.listing_id}>
                    <td>{row.title}</td>
                    <td>{formatCurrency(row.price)}</td>
                    <td className="admin-resource-table__badge-cell">
                      <Badge variant={row.listing_status}>{row.listing_status}</Badge>
                    </td>
                    <td>{row.category_name}</td>
                    <td>{row.brand_name}</td>
                    <td>{row.store_name}</td>
                    <td>{row.active_report_count > 0 ? (
                      <Badge variant="disputed">{row.active_report_count}</Badge>
                    ) : (
                      <span style={{ color: 'var(--color-text-muted)' }}>0</span>
                    )}</td>
                    <td>{formatDate(row.created_at)}</td>
                    <td>
                      <div className="admin-resource-table__actions">
                        {canRemove(row.listing_status) && (
                          <button type="button" className="btn btn--secondary" onClick={() => openDialog('remove', row)}>Remove</button>
                        )}
                        {row.listing_status === 'removed' && (
                          <button type="button" className="btn btn--secondary" onClick={() => openDialog('restore', row)}>Restore</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={result.page} totalPages={result.totalPages} onPageChange={(page) => setSearchParams(serializeAdminListingsSearch({ ...state, page }))} />
        </>
      ) : (
        <EmptyState title="No listings found" body="Try adjusting your search or filters." action={
          <button type="button" className="btn btn--primary" onClick={() => setSearchParams(serializeAdminListingsSearch(DEFAULT_ADMIN_LISTINGS_SEARCH))}>Clear filters</button>
        } />
      )}

      <AdminActionDialog
        open={dialogOpen}
        title={actionTarget != null ? `${actionKind === 'remove' ? 'Remove' : 'Restore'} listing — ${actionTarget.title}` : actionKind === 'remove' ? 'Remove listing' : 'Restore listing'}
        description="This action requires a reason and cannot be undone."
        confirmLabel={actionKind === 'remove' ? 'Remove' : 'Restore'}
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
