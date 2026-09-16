import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { AdminSellerActionInput, AdminSellerListRow, AdminSellersSearchState, SellerStatus } from '../../features/admin/admin.types'
import type { AdminPageItem } from '../../features/admin/admin.types'
import { DEFAULT_ADMIN_SELLERS_SEARCH, parseAdminSellersSearch, serializeAdminSellersSearch } from '../../features/admin/admin-params'
import { listAdminSellers, approveSeller, rejectSeller, suspendSeller, reactivateSeller } from '../../features/admin/admin-users.service'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import PageHeader from '../../components/common/PageHeader'
import LoadingState from '../../components/common/LoadingState'
import Alert from '../../components/common/Alert'
import EmptyState from '../../components/common/EmptyState'
import Badge from '../../components/common/Badge'
import AdminActionDialog from '../../components/admin/AdminActionDialog'
import Pagination from '../../components/marketplace/Pagination'
import { formatDate } from '../../utils/format'

type SortOption = 'newest' | 'oldest' | 'store_asc' | 'store_desc'

const SORT_OPTIONS: { label: string; value: SortOption }[] = [
  { label: 'Newest', value: 'newest' },
  { label: 'Oldest', value: 'oldest' },
  { label: 'Store A–Z', value: 'store_asc' },
  { label: 'Store Z–A', value: 'store_desc' },
]

const STATUS_OPTIONS: { label: string; value: SellerStatus | '' }[] = [
  { label: 'All statuses', value: '' },
  { label: 'Pending', value: 'pending' },
  { label: 'Active', value: 'active' },
  { label: 'Suspended', value: 'suspended' },
  { label: 'Rejected', value: 'rejected' },
]

type ActionKind = 'approve' | 'reject' | 'suspend' | 'reactivate'

export default function AdminSellersPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const searchKey = useMemo(() => searchParams.toString(), [searchParams])
  const state = useMemo(() => parseAdminSellersSearch(new URLSearchParams(searchKey)), [searchKey])

  const [queryInput, setQueryInput] = useState(state.search)
  const debouncedQuery = useDebouncedValue(queryInput)
  const ackedQuery = useRef(state.search)

  const [result, setResult] = useState<AdminSellersSearchState extends never ? never : Awaited<ReturnType<typeof listAdminSellers>>['data']>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [actionKind, setActionKind] = useState<ActionKind>('approve')
  const [actionTarget, setActionTarget] = useState<AdminPageItem<AdminSellerListRow> | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  useEffect(() => {
    if (debouncedQuery !== queryInput) return
    if (debouncedQuery === state.search) return
    if (debouncedQuery === ackedQuery.current) return
    ackedQuery.current = debouncedQuery
    setSearchParams(
      serializeAdminSellersSearch({ ...state, search: debouncedQuery, page: 1 }),
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
    void listAdminSellers(state).then(({ data, error: loadError }) => {
      if (!active) return
      if (loadError != null || data == null) {
        setError('We could not load sellers. Please try again.')
        setResult(null)
      } else if (data.totalPages > 0 && state.page > data.totalPages && state.page !== 1) {
        setSearchParams(serializeAdminSellersSearch({ ...state, page: 1 }), { replace: true })
      } else {
        setResult(data)
      }
      setLoading(false)
    })
    return () => { active = false }
  }, [refreshKey, state, setSearchParams])

  function updateFilter(patch: Partial<{ status: SellerStatus | ''; sort: SortOption }>) {
    const next = { ...state, page: 1 }
    if ('status' in patch) next.status = patch.status != null && patch.status !== '' ? patch.status : null
    if ('sort' in patch) next.sort = patch.sort ?? state.sort
    setSearchParams(serializeAdminSellersSearch(next))
  }

  function openDialog(kind: ActionKind, seller: AdminPageItem<AdminSellerListRow>) {
    setActionKind(kind)
    setActionTarget(seller)
    setActionError(null)
    setDialogOpen(true)
  }

  async function handleConfirm(reason: string) {
    if (actionTarget == null) return
    setActionLoading(true)
    setActionError(null)
    const input: AdminSellerActionInput = { sellerId: actionTarget.seller_id, reason }
    const actionMap: Record<ActionKind, (i: AdminSellerActionInput) => Promise<{ data: unknown; error: { message: string } | null }>> = {
      approve: approveSeller,
      reject: rejectSeller,
      suspend: suspendSeller,
      reactivate: reactivateSeller,
    }
    const { error: actionErr } = await actionMap[actionKind](input)
    setActionLoading(false)
    if (actionErr != null) {
      setActionError(actionErr.message)
      setDialogOpen(false)
      return
    }
    setDialogOpen(false)
    setRefreshKey((k) => k + 1)
  }

  const DIALOG_TITLE: Record<ActionKind, string> = {
    approve: 'Approve seller',
    reject: 'Reject seller',
    suspend: 'Suspend seller',
    reactivate: 'Reactivate seller',
  }

  const DIALOG_CONFIRM: Record<ActionKind, string> = {
    approve: 'Approve',
    reject: 'Reject',
    suspend: 'Suspend',
    reactivate: 'Reactivate',
  }

  return (
    <div className="page admin-resource-page">
      <PageHeader title="Sellers" intro="Manage seller applications, status, and store access." />

      {actionError != null && !dialogOpen && <Alert variant="error" message={actionError} />}

      <div className="admin-resource-toolbar">
        <div className="admin-resource-toolbar__row">
          <div className="admin-resource-toolbar__search">
            <input
              type="search"
              placeholder="Search by store name or email…"
              value={queryInput}
              onChange={(e) => setQueryInput(e.target.value)}
              aria-label="Search sellers"
            />
          </div>
          <div className="admin-resource-toolbar__filter">
            <label>
              <span>Status</span>
              <select value={state.status ?? ''} onChange={(e) => updateFilter({ status: e.target.value as SellerStatus | '' })}>
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
        <LoadingState label="Loading sellers…" />
      ) : error != null ? (
        <Alert variant="error" message={error} />
      ) : result != null && result.items.length > 0 ? (
        <>
          <p className="admin-resource-toolbar__count" aria-live="polite">
            Showing {result.items.length} of {result.total} seller{result.total === 1 ? '' : 's'}
          </p>
          <div className="admin-resource-table">
            <table>
              <caption className="visually-hidden">Seller accounts</caption>
              <thead>
                <tr>
                  <th>Store</th>
                  <th>Owner</th>
                  <th>Status</th>
                  <th>Listings</th>
                  <th>Orders</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {result.items.map((row) => (
                  <tr key={row.seller_id}>
                    <td>{row.store_name}</td>
                    <td>{row.display_name || row.email}</td>
                    <td className="admin-resource-table__badge-cell">
                      <Badge variant={row.seller_status}>{row.seller_status}</Badge>
                    </td>
                    <td>{row.listing_count}</td>
                    <td>{row.order_count}</td>
                    <td>{formatDate(row.created_at)}</td>
                    <td>
                      <div className="admin-resource-table__actions">
                        {row.seller_status === 'pending' && (
                          <>
                            <button type="button" className="btn btn--secondary" onClick={() => openDialog('approve', row)}>Approve</button>
                            <button type="button" className="btn btn--secondary" onClick={() => openDialog('reject', row)}>Reject</button>
                          </>
                        )}
                        {row.seller_status === 'active' && (
                          <button type="button" className="btn btn--secondary" onClick={() => openDialog('suspend', row)}>Suspend</button>
                        )}
                        {row.seller_status === 'suspended' && (
                          <button type="button" className="btn btn--secondary" onClick={() => openDialog('reactivate', row)}>Reactivate</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={result.page} totalPages={result.totalPages} onPageChange={(page) => setSearchParams(serializeAdminSellersSearch({ ...state, page }))} />
        </>
      ) : (
        <EmptyState title="No sellers found" body="Try adjusting your search or filters." action={
          <button type="button" className="btn btn--primary" onClick={() => setSearchParams(serializeAdminSellersSearch(DEFAULT_ADMIN_SELLERS_SEARCH))}>Clear filters</button>
        } />
      )}

      <AdminActionDialog
        open={dialogOpen}
        title={actionTarget != null ? `${DIALOG_TITLE[actionKind]} — ${actionTarget.store_name}` : DIALOG_TITLE[actionKind]}
        description="This action requires a reason and cannot be undone."
        confirmLabel={DIALOG_CONFIRM[actionKind]}
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
