import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { OrderStatus, PaymentStatus } from '../../features/admin/admin.types'
import { DEFAULT_ADMIN_ORDERS_SEARCH, parseAdminOrdersSearch, serializeAdminOrdersSearch } from '../../features/admin/admin-params'
import { listAdminOrders } from '../../features/admin/admin-commerce.service'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import PageHeader from '../../components/common/PageHeader'
import LoadingState from '../../components/common/LoadingState'
import Alert from '../../components/common/Alert'
import EmptyState from '../../components/common/EmptyState'
import Badge from '../../components/common/Badge'
import Pagination from '../../components/marketplace/Pagination'
import { formatCurrency, formatDateTime } from '../../utils/format'

type SortOption = 'newest' | 'oldest' | 'total_asc' | 'total_desc'

const SORT_OPTIONS: { label: string; value: SortOption }[] = [
  { label: 'Newest', value: 'newest' },
  { label: 'Oldest', value: 'oldest' },
  { label: 'Total low–high', value: 'total_asc' },
  { label: 'Total high–low', value: 'total_desc' },
]

const ORDER_STATUS_OPTIONS: { label: string; value: OrderStatus | '' }[] = [
  { label: 'All statuses', value: '' },
  { label: 'Pending', value: 'pending' },
  { label: 'Confirmed', value: 'confirmed' },
  { label: 'Preparing', value: 'preparing' },
  { label: 'Shipped', value: 'shipped' },
  { label: 'Ready for pickup', value: 'ready_for_pickup' },
  { label: 'Completed', value: 'completed' },
  { label: 'Cancelled', value: 'cancelled' },
  { label: 'Disputed', value: 'disputed' },
]

const PAYMENT_STATUS_OPTIONS: { label: string; value: PaymentStatus | '' }[] = [
  { label: 'All payments', value: '' },
  { label: 'Submitted', value: 'submitted' },
  { label: 'Rejected', value: 'rejected' },
  { label: 'Paid', value: 'paid' },
  { label: 'Failed', value: 'failed' },
  { label: 'Refunded', value: 'refunded' },
]

export default function AdminOrdersPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const searchKey = useMemo(() => searchParams.toString(), [searchParams])
  const state = useMemo(() => parseAdminOrdersSearch(new URLSearchParams(searchKey)), [searchKey])

  const [queryInput, setQueryInput] = useState(state.search)
  const debouncedQuery = useDebouncedValue(queryInput)
  const ackedQuery = useRef(state.search)

  const [result, setResult] = useState<Awaited<ReturnType<typeof listAdminOrders>>['data']>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    if (debouncedQuery !== queryInput) return
    if (debouncedQuery === state.search) return
    if (debouncedQuery === ackedQuery.current) return
    ackedQuery.current = debouncedQuery
    setSearchParams(
      serializeAdminOrdersSearch({ ...state, search: debouncedQuery, page: 1 }),
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
    void listAdminOrders(state).then(({ data, error: loadError }) => {
      if (!active) return
      if (loadError != null || data == null) {
        setError('We could not load orders. Please try again.')
        setResult(null)
      } else if (data.totalPages > 0 && state.page > data.totalPages && state.page !== 1) {
        setSearchParams(serializeAdminOrdersSearch({ ...state, page: 1 }), { replace: true })
      } else {
        setResult(data)
      }
      setLoading(false)
    })
    return () => { active = false }
  }, [refreshKey, state, setSearchParams])

function updateFilter(patch: Partial<{ status: OrderStatus | ''; paymentStatus: PaymentStatus | ''; sort: SortOption }>) {
    const next = { ...state, page: 1 }
    if ('status' in patch && patch.status != null) next.status = patch.status === '' ? null : patch.status
    if ('paymentStatus' in patch && patch.paymentStatus != null) next.paymentStatus = patch.paymentStatus === '' ? null : patch.paymentStatus
    if ('sort' in patch && patch.sort != null) next.sort = patch.sort
    setSearchParams(serializeAdminOrdersSearch(next))
  }

  function refresh() {
    setRefreshKey((k) => k + 1)
  }

  return (
    <div className="page admin-resource-page">
      <PageHeader title="Orders" intro="Monitor all marketplace orders, payment status, and fulfillment." />

      <div className="admin-resource-toolbar">
        <div className="admin-resource-toolbar__row">
          <div className="admin-resource-toolbar__search">
            <input
              type="search"
              placeholder="Search by order number, buyer email, or store…"
              value={queryInput}
              onChange={(e) => setQueryInput(e.target.value)}
              aria-label="Search orders"
            />
          </div>
          <div className="admin-resource-toolbar__filter">
            <label>
              <span>Order status</span>
              <select value={state.status ?? ''} onChange={(e) => updateFilter({ status: e.target.value as OrderStatus | '' })}>
                {ORDER_STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Payment</span>
              <select value={state.paymentStatus ?? ''} onChange={(e) => updateFilter({ paymentStatus: e.target.value as PaymentStatus | '' })}>
                {PAYMENT_STATUS_OPTIONS.map((o) => (
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
        <LoadingState label="Loading orders…" />
      ) : error != null ? (
        <div>
          <Alert variant="error" message={error} />
          <button type="button" className="btn btn--secondary" style={{ marginTop: 'var(--space-3)' }} onClick={refresh}>Try again</button>
        </div>
      ) : result != null && result.items.length > 0 ? (
        <>
          <p className="admin-resource-toolbar__count" aria-live="polite">
            Showing {result.items.length} of {result.total} order{result.total === 1 ? '' : 's'}
          </p>
          <div className="admin-resource-table">
            <table>
              <caption className="visually-hidden">Orders</caption>
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Buyer</th>
                  <th>Store</th>
                  <th>Status</th>
                  <th>Payment</th>
                  <th>Total</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {result.items.map((row) => (
                  <tr key={row.order_id}>
                    <td>{row.order_number}</td>
                    <td>
                      <span>{row.buyer_name || row.buyer_email}</span>
                    </td>
                    <td>{row.store_name}</td>
                    <td className="admin-resource-table__badge-cell">
                      <Badge variant={row.status}>{row.status}</Badge>
                    </td>
                    <td className="admin-resource-table__badge-cell">
                      <Badge variant={row.payment_status}>{row.payment_status}</Badge>
                    </td>
                    <td>{formatCurrency(row.total)}</td>
                    <td>{formatDateTime(row.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={result.page} totalPages={result.totalPages} onPageChange={(page) => setSearchParams(serializeAdminOrdersSearch({ ...state, page }))} />
        </>
      ) : (
        <EmptyState title="No orders found" body="Try adjusting your search or filters." action={
          <button type="button" className="btn btn--primary" onClick={() => setSearchParams(serializeAdminOrdersSearch(DEFAULT_ADMIN_ORDERS_SEARCH))}>Clear filters</button>
        } />
      )}
    </div>
  )
}
