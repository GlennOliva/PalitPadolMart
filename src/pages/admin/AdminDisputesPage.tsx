import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../../features/auth/useAuth'
import type { DisputeStatus, RefundStatus } from '../../features/admin/admin.types'
import type {
  AdminDisputeDetailRow,
  AdminDisputeEventRow,
  AdminDisputeEvidenceRow,
  AdminDisputeListRow,
  AdminDisputeMessageRow,
  AdminPage,
  AdminPageItem,
} from '../../features/admin/admin.types'
import { parseAdminDisputesSearch, serializeAdminDisputesSearch } from '../../features/admin/admin-params'
import {
  claimDispute,
  getAdminDispute,
  listAdminDisputeEvents,
  listAdminDisputeEvidence,
  listAdminDisputeMessages,
  listAdminDisputes,
  resolveDispute,
} from '../../features/admin/admin-cases.service'
import { validateAdminReason } from '../../features/admin/admin-validation'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import PageHeader from '../../components/common/PageHeader'
import LoadingState from '../../components/common/LoadingState'
import Alert from '../../components/common/Alert'
import EmptyState from '../../components/common/EmptyState'
import Badge from '../../components/common/Badge'
import type { BadgeVariant } from '../../components/common/Badge'
import AdminActionDialog from '../../components/admin/AdminActionDialog'
import AdminDetailDrawer from '../../components/admin/AdminDetailDrawer'
import Pagination from '../../components/marketplace/Pagination'
import { formatCurrency, formatDateTime } from '../../utils/format'

type DisputeRow = AdminPageItem<AdminDisputeListRow>

const DISPUTE_LABELS: Record<DisputeStatus, string> = {
  open: 'Open',
  under_review: 'Under review',
  resolved: 'Resolved',
  closed: 'Closed',
}

const DISPUTE_BADGES: Record<DisputeStatus, BadgeVariant> = {
  open: 'open',
  under_review: 'under_review',
  resolved: 'resolved',
  closed: 'closed',
}

const REFUND_BADGES: Record<RefundStatus, BadgeVariant> = {
  requested: 'pending',
  approved: 'approved',
  rejected: 'rejected',
  completed: 'completed',
}

const STATUS_OPTIONS: { label: string; value: DisputeStatus | '' }[] = [
  { label: 'All statuses', value: '' },
  { label: 'Open', value: 'open' },
  { label: 'Under review', value: 'under_review' },
  { label: 'Resolved', value: 'resolved' },
  { label: 'Closed', value: 'closed' },
]

const SORT_OPTIONS: { label: string; value: 'newest' | 'oldest' }[] = [
  { label: 'Newest', value: 'newest' },
  { label: 'Oldest', value: 'oldest' },
]

function shortId(value: string): string {
  return value.length <= 8 ? value : `${value.slice(0, 8)}…`
}

function formatBytes(value: number): string {
  if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`
  if (value >= 1024) return `${(value / 1024).toFixed(0)} KB`
  return `${value} B`
}

function formatJson(value: unknown): string {
  if (value == null) return 'null'
  if (typeof value === 'string') return value
  return JSON.stringify(value, null, 2)
}

interface ResolveDisputeDialogProps {
  open: boolean
  title: string
  loading: boolean
  error: string | null
  onCancel: () => void
  onResolve: (resolution: string, reason: string) => void
}

function ResolveDisputeDialog({
  open,
  title,
  loading,
  error,
  onCancel,
  onResolve,
}: ResolveDisputeDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const resolutionRef = useRef<HTMLTextAreaElement>(null)
  const reasonRef = useRef<HTMLTextAreaElement>(null)
  const restoreFocusRef = useRef<HTMLElement | null>(null)
  const wasOpenRef = useRef(false)
  const resolutionId = useId()
  const resolutionTitleId = useId()
  const reasonId = useId()
  const resolutionErrorId = useId()
  const reasonErrorId = useId()
  const [resolution, setResolution] = useState('')
  const [reason, setReason] = useState('')
  const [resolutionError, setResolutionError] = useState<string | null>(null)
  const [reasonError, setReasonError] = useState<string | null>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (dialog == null) return

    if (open && !wasOpenRef.current) {
      restoreFocusRef.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null
      setResolution('')
      setReason('')
      setResolutionError(null)
      setReasonError(null)
      if (!dialog.open) {
        if (typeof dialog.showModal === 'function') dialog.showModal()
        else dialog.setAttribute('open', '')
      }
      window.setTimeout(() => resolutionRef.current?.focus(), 0)
    } else if (!open && wasOpenRef.current) {
      if (dialog.open) {
        if (typeof dialog.close === 'function') dialog.close()
        else dialog.removeAttribute('open')
      }
      window.setTimeout(() => restoreFocusRef.current?.focus(), 0)
    }

    wasOpenRef.current = open
  }, [open])

  useEffect(
    () => () => {
      if (wasOpenRef.current) restoreFocusRef.current?.focus()
    },
    [],
  )

  const requestCancel = () => {
    if (!loading) onCancel()
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const normalizedResolution = resolution.trim()
    const normalizedReason = reason.trim()
    const resolutionMessage =
      normalizedResolution.length === 0 || normalizedResolution.length > 2000
        ? 'Resolution must contain 1 to 2000 characters.'
        : null
    const reasonMessage = validateAdminReason(normalizedReason)
    setResolutionError(resolutionMessage)
    setReasonError(reasonMessage)
    if (resolutionMessage != null) {
      resolutionRef.current?.focus()
      return
    }
    if (reasonMessage != null) {
      reasonRef.current?.focus()
      return
    }
    onResolve(normalizedResolution, normalizedReason)
  }

  return (
    <dialog
      ref={dialogRef}
      className="admin-action-dialog"
      aria-labelledby={resolutionTitleId}
      aria-busy={loading || undefined}
      onCancel={(event) => {
        event.preventDefault()
        requestCancel()
      }}
    >
      <form className="admin-taxonomy-form" onSubmit={handleSubmit} noValidate>
        <header className="admin-action-dialog__header">
          <p className="admin-action-dialog__eyebrow">Administrative action</p>
          <h2 id={resolutionTitleId}>{title}</h2>
        </header>

        <div className="form-field">
          <label className="form-field__label" htmlFor={resolutionId}>
            Resolution
            <span className="form-field__required"> *</span>
          </label>
          <textarea
            ref={resolutionRef}
            id={resolutionId}
            className="form-field__textarea"
            value={resolution}
            placeholder="Enter the outcome and next steps for this dispute…"
            maxLength={2000}
            required
            disabled={loading}
            aria-invalid={resolutionError != null ? true : undefined}
            aria-describedby={resolutionError == null ? undefined : resolutionErrorId}
            onChange={(event) => {
              setResolution(event.target.value)
              if (resolutionError != null) setResolutionError(null)
            }}
          />
          {resolutionError == null ? null : (
            <p id={resolutionErrorId} className="form-field__error">
              {resolutionError}
            </p>
          )}
        </div>

        <div className="form-field">
          <label className="form-field__label" htmlFor={reasonId}>
            Reason
            <span className="form-field__required"> *</span>
          </label>
          <textarea
            ref={reasonRef}
            id={reasonId}
            className="form-field__textarea"
            value={reason}
            placeholder="Why is this action being taken?"
            maxLength={1000}
            required
            disabled={loading}
            aria-invalid={reasonError != null ? true : undefined}
            aria-describedby={reasonError == null ? undefined : reasonErrorId}
            onChange={(event) => {
              setReason(event.target.value)
              if (reasonError != null) setReasonError(null)
            }}
          />
          {reasonError == null ? null : (
            <p id={reasonErrorId} className="form-field__error">
              {reasonError}
            </p>
          )}
        </div>

        {error == null ? null : <Alert variant="error" message={error} />}

        <div className="admin-action-dialog__actions">
          <button type="button" className="btn btn--ghost" disabled={loading} onClick={requestCancel}>
            Cancel
          </button>
          <button type="submit" className="btn btn--primary" disabled={loading}>
            {loading ? (
              <>
                <span className="spinner spinner--sm" aria-hidden="true" />
                Resolving…
              </>
            ) : (
              'Resolve dispute'
            )}
          </button>
        </div>
      </form>
    </dialog>
  )
}

export default function AdminDisputesPage() {
  const { user } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const searchKey = useMemo(() => searchParams.toString(), [searchParams])
  const state = useMemo(() => parseAdminDisputesSearch(new URLSearchParams(searchKey)), [searchKey])

  const [queryInput, setQueryInput] = useState(state.search)
  const debouncedQuery = useDebouncedValue(queryInput)
  const ackedQuery = useRef(state.search)

  const [result, setResult] = useState<AdminPage<AdminDisputeListRow> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const [selected, setSelected] = useState<DisputeRow | null>(null)
  const [detail, setDetail] = useState<AdminDisputeDetailRow | null>(null)
  const [messages, setMessages] = useState<AdminPageItem<AdminDisputeMessageRow>[]>([])
  const [evidence, setEvidence] = useState<AdminPageItem<AdminDisputeEvidenceRow>[]>([])
  const [events, setEvents] = useState<AdminPageItem<AdminDisputeEventRow>[]>([])
  const [drawerLoading, setDrawerLoading] = useState(false)
  const [drawerError, setDrawerError] = useState<string | null>(null)

  const [claimTarget, setClaimTarget] = useState<DisputeRow | null>(null)
  const [claimLoading, setClaimLoading] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [resolveTarget, setResolveTarget] = useState<DisputeRow | null>(null)
  const [resolveLoading, setResolveLoading] = useState(false)
  const [resolveError, setResolveError] = useState<string | null>(null)

  useEffect(() => {
    if (debouncedQuery !== queryInput) return
    if (debouncedQuery === state.search) return
    if (debouncedQuery === ackedQuery.current) return
    ackedQuery.current = debouncedQuery
    setSearchParams(
      serializeAdminDisputesSearch({ ...state, search: debouncedQuery, page: 1 }),
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
    void listAdminDisputes(state).then(({ data, error: loadError }) => {
      if (!active) return
      if (loadError != null || data == null) {
        setError('We could not load disputes. Please try again.')
        setResult(null)
      } else if (data.totalPages > 0 && state.page > data.totalPages && state.page !== 1) {
        setSearchParams(serializeAdminDisputesSearch({ ...state, page: 1 }), { replace: true })
      } else {
        setResult(data)
      }
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [refreshKey, state, setSearchParams])

  async function openDispute(row: DisputeRow) {
    setSelected(row)
    setDrawerLoading(true)
    setDrawerError(null)
    setDetail(null)
    setMessages([])
    setEvidence([])
    setEvents([])
    const [detailRes, messagesRes, evidenceRes, eventsRes] = await Promise.all([
      getAdminDispute(row.dispute_id),
      listAdminDisputeMessages(row.dispute_id),
      listAdminDisputeEvidence(row.dispute_id),
      listAdminDisputeEvents(row.dispute_id),
    ])
    if (detailRes.error != null || detailRes.data == null) {
      setDrawerError('We could not load the full dispute details. Please try again.')
      return
    }
    setDetail(detailRes.data)
    setMessages(messagesRes.data?.items ?? [])
    setEvidence(evidenceRes.data?.items ?? [])
    setEvents(eventsRes.data?.items ?? [])
    setDrawerLoading(false)
  }

  function closeDrawer() {
    setSelected(null)
    setDetail(null)
    setMessages([])
    setEvidence([])
    setEvents([])
    setDrawerError(null)
  }

  async function handleClaim(reason: string) {
    if (claimTarget == null) return
    setClaimLoading(true)
    setActionError(null)
    const { error: claimError } = await claimDispute({
      disputeId: claimTarget.dispute_id,
      reason,
    })
    setClaimLoading(false)
    setClaimTarget(null)
    if (claimError != null) {
      setActionError(claimError.message)
      return
    }
    setRefreshKey((key) => key + 1)
    if (selected != null && selected.dispute_id === claimTarget.dispute_id) {
      void openDispute(claimTarget)
    }
  }

  async function handleResolve(resolution: string, reason: string) {
    if (resolveTarget == null) return
    setResolveLoading(true)
    setResolveError(null)
    const { error: resolveFailure } = await resolveDispute({
      disputeId: resolveTarget.dispute_id,
      resolution,
      reason,
    })
    setResolveLoading(false)
    setResolveTarget(null)
    if (resolveFailure != null) {
      setResolveError(resolveFailure.message)
      return
    }
    setRefreshKey((key) => key + 1)
    if (selected != null && selected.dispute_id === resolveTarget.dispute_id) {
      void openDispute(resolveTarget)
    }
  }

  function canClaim(row: DisputeRow | AdminDisputeDetailRow): boolean {
    return row.status === 'open' && row.assigned_admin_id == null
  }

  function canResolve(row: DisputeRow | AdminDisputeDetailRow): boolean {
    return row.status === 'under_review' && row.assigned_admin_id === user?.id
  }

  function clearFilters() {
    setSearchParams(serializeAdminDisputesSearch({ ...state, search: '', page: 1, sort: 'oldest', status: null, assignedToMe: false }))
  }

  return (
    <div className="page admin-resource-page">
      <PageHeader
        title="Disputes"
        intro="Review order disputes, messages, evidence, and resolution requests."
      />

      {actionError != null && <Alert variant="error" message={actionError} />}

      <div className="admin-resource-toolbar">
        <div className="admin-resource-toolbar__row">
          <div className="admin-resource-toolbar__search">
            <input
              type="search"
              placeholder="Search by order, buyer, store, or reason…"
              value={queryInput}
              onChange={(event) => setQueryInput(event.target.value)}
              aria-label="Search disputes"
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
                    serializeAdminDisputesSearch({
                      ...state,
                      status: value === '' ? null : (value as DisputeStatus),
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
                  setSearchParams(
                    serializeAdminDisputesSearch({ ...state, sort: event.target.value as 'newest' | 'oldest', page: 1 }),
                  )
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
        <LoadingState label="Loading disputes…" />
      ) : error != null ? (
        <Alert variant="error" message={error} />
      ) : result != null && result.items.length > 0 ? (
        <>
          <p className="admin-resource-toolbar__count" aria-live="polite">
            Showing {result.items.length} of {result.total} dispute{result.total === 1 ? '' : 's'}
          </p>
          <div className="admin-resource-table admin-resource-table--clickable">
            <table>
              <caption className="visually-hidden">Disputes</caption>
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Buyer</th>
                  <th>Store</th>
                  <th>Reason</th>
                  <th>Status</th>
                  <th className="admin-table--num">Refund</th>
                  <th>Assigned</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {result.items.map((row) => (
                  <tr key={row.dispute_id} onClick={() => void openDispute(row)}>
                    <td>
                      <span className="admin-resource-code">{row.order_number}</span>
                    </td>
                    <td>{row.buyer_name}</td>
                    <td>{row.store_name}</td>
                    <td className="admin-resource-table__truncate" title={row.reason}>
                      {row.reason}
                    </td>
                    <td className="admin-resource-table__badge-cell">
                      <Badge variant={DISPUTE_BADGES[row.status]}>{DISPUTE_LABELS[row.status]}</Badge>
                    </td>
                    <td className="admin-table--num">
                      {row.refund_amount != null ? formatCurrency(row.refund_amount) : '—'}
                    </td>
                    <td>{row.assigned_admin_email || '—'}</td>
                    <td>{formatDateTime(row.created_at)}</td>
                    <td>
                      <div className="admin-resource-table__actions">
                        <button type="button" className="btn btn--secondary" onClick={(event) => {
                          event.stopPropagation()
                          void openDispute(row)
                        }}>
                          Details
                        </button>
                        {canClaim(row) && (
                          <button type="button" className="btn btn--secondary" onClick={(event) => {
                            event.stopPropagation()
                            setActionError(null)
                            setClaimTarget(row)
                          }}>
                            Claim
                          </button>
                        )}
                        {canResolve(row) && (
                          <button type="button" className="btn btn--secondary" onClick={(event) => {
                            event.stopPropagation()
                            setResolveError(null)
                            setResolveTarget(row)
                          }}>
                            Resolve
                          </button>
                        )}
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
            onPageChange={(page) => setSearchParams(serializeAdminDisputesSearch({ ...state, page }))}
          />
        </>
      ) : (
        <EmptyState
          title="No disputes found"
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
        title={selected != null ? `Dispute — ${selected.order_number}` : 'Dispute'}
        onClose={closeDrawer}
      >
        {drawerLoading ? (
          <LoadingState label="Loading dispute details…" />
        ) : drawerError != null ? (
          <Alert variant="error" message={drawerError} />
        ) : detail != null ? (
          <>
            <section className="admin-detail-section" aria-label="Dispute information">
              <h3 className="admin-detail-section__title">Dispute information</h3>
              <dl className="admin-detail-definition">
                <div className="admin-detail-definition__row">
                  <dt>Order</dt>
                  <dd>{detail.order_number}</dd>
                </div>
                <div className="admin-detail-definition__row">
                  <dt>Buyer</dt>
                  <dd>
                    {detail.buyer_name}
                    <span className="admin-detail-sub"> {detail.buyer_email}</span>
                  </dd>
                </div>
                <div className="admin-detail-definition__row">
                  <dt>Store</dt>
                  <dd>{detail.store_name}</dd>
                </div>
                <div className="admin-detail-definition__row">
                  <dt>Status</dt>
                  <dd>
                    <Badge variant={DISPUTE_BADGES[detail.status]}>{DISPUTE_LABELS[detail.status]}</Badge>
                  </dd>
                </div>
                <div className="admin-detail-definition__row">
                  <dt>Reason</dt>
                  <dd>{detail.reason}</dd>
                </div>
                <div className="admin-detail-definition__row">
                  <dt>Description</dt>
                  <dd>{detail.description || '—'}</dd>
                </div>
                <div className="admin-detail-definition__row">
                  <dt>Refund</dt>
                  <dd>
                    {detail.refund_amount != null ? (
                      <>
                        {formatCurrency(detail.refund_amount)}{' '}
                        <Badge variant={REFUND_BADGES[detail.refund_status]}>{detail.refund_status}</Badge>
                      </>
                    ) : (
                      '—'
                    )}
                  </dd>
                </div>
                <div className="admin-detail-definition__row">
                  <dt>Opened by</dt>
                  <dd>{detail.opened_by || '—'}</dd>
                </div>
                <div className="admin-detail-definition__row">
                  <dt>Assigned to</dt>
                  <dd>{detail.assigned_admin_email || '—'}</dd>
                </div>
                <div className="admin-detail-definition__row">
                  <dt>Resolution</dt>
                  <dd>{detail.resolution || '—'}</dd>
                </div>
                <div className="admin-detail-definition__row">
                  <dt>Created</dt>
                  <dd>{formatDateTime(detail.created_at)}</dd>
                </div>
                <div className="admin-detail-definition__row">
                  <dt>Updated</dt>
                  <dd>{formatDateTime(detail.updated_at)}</dd>
                </div>
              </dl>
            </section>

            {(canClaim(detail) || canResolve(detail)) && (
              <div className="admin-detail-actions">
                {canClaim(detail) && (
                  <button
                    type="button"
                    className="btn btn--primary"
                    onClick={() => {
                      setActionError(null)
                      setClaimTarget(selected)
                    }}
                  >
                    Claim dispute
                  </button>
                )}
                {canResolve(detail) && (
                  <button
                    type="button"
                    className="btn btn--primary"
                    onClick={() => {
                      setResolveError(null)
                      setResolveTarget(selected)
                    }}
                  >
                    Resolve dispute
                  </button>
                )}
              </div>
            )}

            <section className="admin-detail-section" aria-label="Messages">
              <h3 className="admin-detail-section__title">
                Messages <span className="admin-detail-section__count">{detail.message_count}</span>
              </h3>
              {messages.length === 0 ? (
                <p className="admin-detail-empty">No messages have been posted.</p>
              ) : (
                <ul className="admin-detail-list">
                  {messages.map((message) => (
                    <li key={message.message_id} className="admin-detail-list__item">
                      <div className="admin-detail-list__head">
                        <strong>{message.sender_name}</strong>
                        <span className="admin-detail-sub">
                          {message.sender_kind} · {formatDateTime(message.created_at)}
                        </span>
                      </div>
                      <p>{message.message}</p>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="admin-detail-section" aria-label="Evidence">
              <h3 className="admin-detail-section__title">
                Evidence <span className="admin-detail-section__count">{detail.evidence_count}</span>
              </h3>
              {evidence.length === 0 ? (
                <p className="admin-detail-empty">No evidence has been uploaded.</p>
              ) : (
                <ul className="admin-detail-list">
                  {evidence.map((item) => (
                    <li key={item.evidence_id} className="admin-detail-list__item">
                      <div className="admin-detail-list__head">
                        <strong>{item.original_filename}</strong>
                        <span className="admin-detail-sub">
                          {item.mime_type} · {formatBytes(item.size_bytes)}
                        </span>
                      </div>
                      <p className="admin-detail-sub">
                        Uploaded by {item.uploader_name} on {formatDateTime(item.created_at)}
                      </p>
                      <p className="admin-detail-sub admin-detail-path">
                        {item.storage_path}
                        {item.legacy_url ? ` · ${item.legacy_url}` : ''}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="admin-detail-section" aria-label="Event timeline">
              <h3 className="admin-detail-section__title">Event timeline</h3>
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

      <AdminActionDialog
        open={claimTarget != null}
        title={claimTarget != null ? `Claim dispute — ${claimTarget.order_number}` : 'Claim dispute'}
        description="Claiming assigns this dispute to you for review. A reason is required."
        confirmLabel="Claim dispute"
        loading={claimLoading}
        loadingLabel="Claiming…"
        reasonRequired
        reasonPlaceholder="Explain why this dispute has been assigned to you…"
        onCancel={() => setClaimTarget(null)}
        onConfirm={(reason) => void handleClaim(reason)}
      />

      <ResolveDisputeDialog
        open={resolveTarget != null}
        title={resolveTarget != null ? `Resolve dispute — ${resolveTarget.order_number}` : 'Resolve dispute'}
        loading={resolveLoading}
        error={resolveError}
        onCancel={() => setResolveTarget(null)}
        onResolve={(resolution, reason) => void handleResolve(resolution, reason)}
      />
    </div>
  )
}