import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { RefundStatus } from '../../features/admin/admin.types'
import type { AdminRefundListRow, AdminPage, AdminPageItem, AdminRefundSort, AdminRefundEventRow } from '../../features/admin/admin.types'
import { parseAdminRefundsSearch, serializeAdminRefundsSearch } from '../../features/admin/admin-params'
import { listAdminRefunds, listAdminRefundEvents } from '../../features/admin/admin-cases.service'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import PageHeader from '../../components/common/PageHeader'
import LoadingState from '../../components/common/LoadingState'
import Alert from '../../components/common/Alert'
import EmptyState from '../../components/common/EmptyState'
import Badge from '../../components/common/Badge'
import type { BadgeVariant } from '../../components/common/Badge'
import AdminDetailDrawer from '../../components/admin/AdminDetailDrawer'
import Pagination from '../../components/marketplace/Pagination'
import { formatCurrency, formatDateTime } from '../../utils/format'

type RefundRow = AdminPageItem<AdminRefundListRow>

const REFUND_LABELS: Record<RefundStatus, string> = {
  requested: 'Requested',
  approved: 'Approved',
  rejected: 'Rejected',
  completed: 'Completed',
}

const REFUND_BADGES: Record<RefundStatus, BadgeVariant> = {
  requested: 'pending',
  approved: 'approved',
  rejected: 'rejected',
  completed: 'completed',
}

const STATUS_OPTIONS: { label: string; value: RefundStatus | '' }[] = [
  { label: 'All statuses', value: '' },
  { label: 'Requested', value: 'requested' },
  { label: 'Approved', value: 'approved' },
  { label: 'Rejected', value: 'rejected' },
  { label: 'Completed', value: 'completed' },
]

const SORT_OPTIONS: { label: string; value: AdminRefundSort }[] = [
  { label: 'Newest', value: 'newest' },
  { label: 'Oldest', value: 'oldest' },
  { label: 'Amount high–low', value: 'amount_desc' },
  { label: 'Amount low–high', value: 'amount_asc' },
]

function shortId(value: string): string {
  return value.length <= 8 ? value : `${value.slice(0, 8)}…`
}

function formatJson(value: unknown): string {
  if (value == null) return 'null'
  if (typeof value === 'string') return value
  return JSON.stringify(value, null, 2)
}

export default function AdminRefundsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const searchKey = useMemo(() => searchParams.toString(), [searchParams])
  const state = useMemo(() => parseAdminRefundsSearch(new URLSearchParams(searchKey)), [searchKey])

  const [queryInput, setQueryInput] = useState(state.search)
  const debouncedQuery = useDebouncedValue(queryInput)
  const ackedQuery = useRef(state.search)

  const [result, setResult] = useState<AdminPage<AdminRefundListRow> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [selected, setSelected] = useState<RefundRow | null>(null)
  const [events, setEvents] = useState<AdminPageItem<AdminRefundEventRow>[]>([])
  const [drawerLoading, setDrawerLoading] = useState(false)
  const [drawerError, setDrawerError] = useState<string | null>(null)

  useEffect(() => {
    if (debouncedQuery !== queryInput) return
    if (debouncedQuery === state.search) return
    if (debouncedQuery === ackedQuery.current) return
    ackedQuery.current = debouncedQuery
    setSearchParams(
      serializeAdminRefundsSearch({ ...state, search: debouncedQuery, page: 1 }),
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
    void listAdminRefunds(state).then(({ data, error: loadError }) => {
      if (!active) return
      if (loadError != null || data == null) {
        setError('We could not load refunds. Please try again.')
        setResult(null)
      } else if (data.totalPages > 0 && state.page > data.totalPages && state.page !== 1) {
        setSearchParams(serializeAdminRefundsSearch({ ...state, page: 1 }), { replace: true })
      } else {
        setResult(data)
      }
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [state, setSearchParams])

  async function openRefund(row: RefundRow) {
    setSelected(row)
    setDrawerLoading(true)
    setDrawerError(null)
    setEvents([])
    const { data: eventData, error: eventError } = await listAdminRefundEvents(row.refund_id)
    if (eventError != null) {
      setDrawerError('We could not load the refund timeline. Please try again.')
      return
    }
    setEvents(eventData?.items ?? [])
    setDrawerLoading(false)
  }

  function closeDrawer() {
    setSelected(null)
    setEvents([])
    setDrawerError(null)
  }

  function clearFilters() {
    setSearchParams(serializeAdminRefundsSearch({ ...state, search: '', page: 1, sort: 'newest', status: null }))
  }

  return (
    <div className="page admin-resource-page">
      <PageHeader
        title="Refunds"
        intro="Oversight view of refund requests and their fulfillment timelines."
      />

      <div className="admin-resource-toolbar">
        <div className="admin-resource-toolbar__row">
          <div className="admin-resource-toolbar__search">
            <input
              type="search"
              placeholder="Search by order number, buyer, or store…"
              value={queryInput}
              onChange={(event) => setQueryInput(event.target.value)}
              aria-label="Search refunds"
            />
          </div>
          <div className="admin-resource-toolbar__filter">
            <label>
              <span>Status</span>
              <select
                value={state.status ?? ''}
                onChange={(event) => {
                  const value = event.target.value
                  setSearchParams(
                    serializeAdminRefundsSearch({
                      ...state,
                      status: value === '' ? null : (value as RefundStatus),
                      page: 1,
                    }),
                  )
                }}
              >
                {STATUS_OPTIONS.map((option) => (
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
                  setSearchParams(serializeAdminRefundsSearch({ ...state, sort: event.target.value as AdminRefundSort, page: 1 }))
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
        <LoadingState label="Loading refunds…" />
      ) : error != null ? (
        <Alert variant="error" message={error} />
      ) : result != null && result.items.length > 0 ? (
        <>
          <p className="admin-resource-toolbar__count" aria-live="polite">
            Showing {result.items.length} of {result.total} refund{result.total === 1 ? '' : 's'}
          </p>
          <div className="admin-resource-table admin-resource-table--clickable">
            <table>
              <caption className="visually-hidden">Refunds</caption>
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Buyer</th>
                  <th>Store</th>
                  <th className="admin-table--num">Amount</th>
                  <th>Status</th>
                  <th>Dispute</th>
                  <th>Requested</th>
                  <th>Completed</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {result.items.map((row) => (
                  <tr key={row.refund_id} onClick={() => void openRefund(row)}>
                    <td>
                      <span className="admin-resource-code">{row.order_number}</span>
                    </td>
                    <td>{row.buyer_name}</td>
                    <td>{row.store_name}</td>
                    <td className="admin-table--num">{formatCurrency(row.amount)}</td>
                    <td className="admin-resource-table__badge-cell">
                      <Badge variant={REFUND_BADGES[row.status]}>{REFUND_LABELS[row.status]}</Badge>
                    </td>
                    <td>{row.dispute_id != null ? shortId(row.dispute_id) : '—'}</td>
                    <td>{row.requested_at != null ? formatDateTime(row.requested_at) : '—'}</td>
                    <td>{row.completed_at != null ? formatDateTime(row.completed_at) : '—'}</td>
                    <td>
                      <div className="admin-resource-table__actions">
                        <button
                          type="button"
                          className="btn btn--ghost btn--sm"
                          onClick={() => void openRefund(row)}
                        >
                          Details
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            page={result.page}
            totalPages={result.totalPages}
            onPageChange={(page) => setSearchParams(serializeAdminRefundsSearch({ ...state, page }))}
          />
        </>
      ) : (
        <EmptyState
          title="No refunds found"
          body="Try adjusting your search or filters."
          action={
            <button type="button" className="btn btn--primary" onClick={clearFilters}>
              Clear filters
            </button>
          }
        />
      )}

      <AdminDetailDrawer
        open={selected != null}
        title={selected != null ? `Refund — ${selected.order_number}` : 'Refund'}
        onClose={closeDrawer}
      >
        {drawerLoading ? (
          <LoadingState label="Loading refund details…" />
        ) : drawerError != null ? (
          <Alert variant="error" message={drawerError} />
        ) : selected != null ? (
          <>
            <section className="admin-detail-section" aria-label="Refund information">
              <h3 className="admin-detail-section__title">Refund information</h3>
              <dl className="admin-detail-definition">
                <div className="admin-detail-definition__row">
                  <dt>Order</dt>
                  <dd>{selected.order_number}</dd>
                </div>
                <div className="admin-detail-definition__row">
                  <dt>Buyer</dt>
                  <dd>{selected.buyer_name}</dd>
                </div>
                <div className="admin-detail-definition__row">
                  <dt>Store</dt>
                  <dd>{selected.store_name}</dd>
                </div>
                <div className="admin-detail-definition__row">
                  <dt>Amount</dt>
                  <dd>{formatCurrency(selected.amount)}</dd>
                </div>
                <div className="admin-detail-definition__row">
                  <dt>Status</dt>
                  <dd>
                    <Badge variant={REFUND_BADGES[selected.status]}>{REFUND_LABELS[selected.status]}</Badge>
                  </dd>
                </div>
                <div className="admin-detail-definition__row">
                  <dt>Dispute</dt>
                  <dd>{selected.dispute_id != null ? shortId(selected.dispute_id) : '—'}</dd>
                </div>
                <div className="admin-detail-definition__row">
                  <dt>Requested</dt>
                  <dd>{selected.requested_at != null ? formatDateTime(selected.requested_at) : '—'}</dd>
                </div>
                <div className="admin-detail-definition__row">
                  <dt>Reviewed</dt>
                  <dd>{selected.reviewed_at != null ? formatDateTime(selected.reviewed_at) : '—'}</dd>
                </div>
                <div className="admin-detail-definition__row">
                  <dt>Completed</dt>
                  <dd>{selected.completed_at != null ? formatDateTime(selected.completed_at) : '—'}</dd>
                </div>
              </dl>
            </section>

            <section className="admin-detail-section" aria-label="Refund events">
              <h3 className="admin-detail-section__title">Refund events</h3>
              {events.length === 0 ? (
                <p className="admin-detail-empty">No events have been recorded.</p>
              ) : (
                <ol className="admin-detail-events">
                  {events.map((event) => (
                    <li key={event.event_id} className="admin-detail-events__item">
                      <div className="admin-detail-events__meta">
                        <strong>{event.event_type}</strong>
                        <span className="admin-detail-sub">
                          {event.from_status} → {event.to_status} · {formatDateTime(event.created_at)}
                        </span>
                        <span className="admin-detail-sub">Actor {shortId(event.actor_id)}</span>
                      </div>
                      {event.details == null ? null : (
                        <pre className="admin-detail-code">{formatJson(event.details)}</pre>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </>
        ) : null}
      </AdminDetailDrawer>
    </div>
  )
}