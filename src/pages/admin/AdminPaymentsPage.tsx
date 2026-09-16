import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { PaymentStatus } from '../../features/admin/admin.types'
import type { AdminOrderListRow, AdminOrderSort, AdminPage, AdminPageItem } from '../../features/admin/admin.types'
import { parseAdminOrdersSearch, serializeAdminOrdersSearch } from '../../features/admin/admin-params'
import { listAdminOrders } from '../../features/admin/admin-commerce.service'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import PageHeader from '../../components/common/PageHeader'
import LoadingState from '../../components/common/LoadingState'
import Alert from '../../components/common/Alert'
import EmptyState from '../../components/common/EmptyState'
import Badge from '../../components/common/Badge'
import type { BadgeVariant } from '../../components/common/Badge'
import Pagination from '../../components/marketplace/Pagination'
import { formatCurrency, formatDateTime } from '../../utils/format'

type PaymentRow = AdminPageItem<AdminOrderListRow>

const PAYMENT_LABELS: Record<PaymentStatus, string> = {
  pending: 'Pending',
  submitted: 'Submitted',
  paid: 'Paid',
  failed: 'Failed',
  refunded: 'Refunded',
  partially_refunded: 'Partially refunded',
  rejected: 'Rejected',
}

const PAYMENT_BADGES: Record<PaymentStatus, BadgeVariant> = {
  pending: 'pending',
  submitted: 'submitted',
  paid: 'paid',
  failed: 'failed',
  refunded: 'refunded',
  partially_refunded: 'partially_refunded',
  rejected: 'rejected',
}

const PAYMENT_OPTIONS: { label: string; value: PaymentStatus | '' }[] = [
  { label: 'All statuses', value: '' },
  { label: 'Pending', value: 'pending' },
  { label: 'Submitted', value: 'submitted' },
  { label: 'Paid', value: 'paid' },
  { label: 'Failed', value: 'failed' },
  { label: 'Refunded', value: 'refunded' },
  { label: 'Partially refunded', value: 'partially_refunded' },
  { label: 'Rejected', value: 'rejected' },
]

const SORT_OPTIONS: { label: string; value: AdminOrderSort }[] = [
  { label: 'Newest', value: 'newest' },
  { label: 'Oldest', value: 'oldest' },
  { label: 'Total high–low', value: 'total_desc' },
  { label: 'Total low–high', value: 'total_asc' },
]

function buyerLabel(row: PaymentRow): string {
  return row.buyer_name != null && row.buyer_name.trim() !== '' ? row.buyer_name : row.buyer_email
}

export default function AdminPaymentsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const searchKey = useMemo(() => searchParams.toString(), [searchParams])
  const state = useMemo(() => parseAdminOrdersSearch(new URLSearchParams(searchKey)), [searchKey])

  const [queryInput, setQueryInput] = useState(state.search)
  const debouncedQuery = useDebouncedValue(queryInput)
  const ackedQuery = useRef(state.search)

  const [result, setResult] = useState<AdminPage<AdminOrderListRow> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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
        setError('We could not load payments. Please try again.')
        setResult(null)
      } else if (data.totalPages > 0 && state.page > data.totalPages && state.page !== 1) {
        setSearchParams(serializeAdminOrdersSearch({ ...state, page: 1 }), { replace: true })
      } else {
        setResult(data)
      }
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [state, setSearchParams])

  function clearFilters() {
    setSearchParams(serializeAdminOrdersSearch({ ...state, search: '', page: 1, sort: 'newest', paymentStatus: null }))
  }

  return (
    <div className="page admin-resource-page">
      <PageHeader
        title="Payments"
        intro="Oversight view of payment statuses across all orders."
      />

      <div className="admin-resource-toolbar">
        <div className="admin-resource-toolbar__row">
          <div className="admin-resource-toolbar__search">
            <input
              type="search"
              placeholder="Search by order number, buyer email, or store…"
              value={queryInput}
              onChange={(event) => setQueryInput(event.target.value)}
              aria-label="Search payments"
            />
          </div>
          <div className="admin-resource-toolbar__filter">
            <label>
              <span>Payment status</span>
              <select
                value={state.paymentStatus ?? ''}
                onChange={(event) => {
                  const value = event.target.value
                  setSearchParams(
                    serializeAdminOrdersSearch({
                      ...state,
                      paymentStatus: value === '' ? null : (value as PaymentStatus),
                      page: 1,
                    }),
                  )
                }}
              >
                {PAYMENT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Sort</span>
              <select
                value={state.sort}
                onChange={(event) =>
                  setSearchParams(serializeAdminOrdersSearch({ ...state, sort: event.target.value as AdminOrderSort, page: 1 }))
                }
              >
                {SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </div>

      {loading ? (
        <LoadingState label="Loading payments…" />
      ) : error != null ? (
        <Alert variant="error" message={error} />
      ) : result != null && result.items.length > 0 ? (
        <>
          <p className="admin-resource-toolbar__count" aria-live="polite">
            Showing {result.items.length} of {result.total} payment{result.total === 1 ? '' : 's'}
          </p>
          <div className="admin-resource-table">
            <table>
              <caption className="visually-hidden">Payments</caption>
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Buyer</th>
                  <th>Store</th>
                  <th>Payment Status</th>
                  <th className="admin-table--num">Amount</th>
                  <th>Method</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {result.items.map((row) => (
                  <tr key={row.order_id}>
                    <td>
                      <span className="admin-resource-code">{row.order_number}</span>
                    </td>
                    <td>{buyerLabel(row)}</td>
                    <td>{row.store_name}</td>
                    <td className="admin-resource-table__badge-cell">
                      <Badge variant={PAYMENT_BADGES[row.payment_status]}>{PAYMENT_LABELS[row.payment_status]}</Badge>
                    </td>
                    <td className="admin-table--num">{formatCurrency(row.payment_amount ?? row.total)}</td>
                    <td>{row.payment_method || '—'}</td>
                    <td>{formatDateTime(row.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            page={result.page}
            totalPages={result.totalPages}
            onPageChange={(page) => setSearchParams(serializeAdminOrdersSearch({ ...state, page }))}
          />
        </>
      ) : (
        <EmptyState
          title="No payments found"
          body="Try adjusting your search or filters."
          action={
            <button type="button" className="btn btn--primary" onClick={clearFilters}>
              Clear filters
            </button>
          }
        />
      )}
    </div>
  )
}