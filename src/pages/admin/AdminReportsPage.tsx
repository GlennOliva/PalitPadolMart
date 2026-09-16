import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { AdminReportActionInput, AdminReportListRow, ReportStatus } from '../../features/admin/admin.types'
import type { AdminPageItem } from '../../features/admin/admin.types'
import { DEFAULT_ADMIN_REPORTS_SEARCH, parseAdminReportsSearch, serializeAdminReportsSearch } from '../../features/admin/admin-params'
import { listAdminReports, markReportUnderReview, resolveReport, dismissReport } from '../../features/admin/admin-marketplace.service'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import PageHeader from '../../components/common/PageHeader'
import LoadingState from '../../components/common/LoadingState'
import Alert from '../../components/common/Alert'
import EmptyState from '../../components/common/EmptyState'
import Badge from '../../components/common/Badge'
import AdminActionDialog from '../../components/admin/AdminActionDialog'
import Pagination from '../../components/marketplace/Pagination'
import { formatDateTime } from '../../utils/format'

type SortOption = 'newest' | 'oldest'

const SORT_OPTIONS: { label: string; value: SortOption }[] = [
  { label: 'Newest', value: 'newest' },
  { label: 'Oldest', value: 'oldest' },
]

const STATUS_OPTIONS: { label: string; value: ReportStatus | '' }[] = [
  { label: 'All statuses', value: '' },
  { label: 'Pending', value: 'pending' },
  { label: 'Under review', value: 'under_review' },
  { label: 'Resolved', value: 'resolved' },
  { label: 'Dismissed', value: 'dismissed' },
]

type ActionKind = 'under_review' | 'dismiss'

interface ReportResolveDialogProps {
  open: boolean
  title: string
  loading: boolean
  onCancel: () => void
  onConfirm: (reason: string, resolution: string) => void
}

function ReportResolveDialog({ open, title, loading, onCancel, onConfirm }: ReportResolveDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const reasonRef = useRef<HTMLTextAreaElement>(null)
  const restoreFocusRef = useRef<HTMLElement | null>(null)
  const wasOpenRef = useRef(false)
  const [reason, setReason] = useState('')
  const [resolution, setResolution] = useState('')
  const [errors, setErrors] = useState<{ reason?: string; resolution?: string }>({})

  useEffect(() => {
    const dialog = dialogRef.current
    if (dialog == null) return
    if (open && !wasOpenRef.current) {
      restoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
      setReason('')
      setResolution('')
      setErrors({})
      if (!dialog.open) {
        if (typeof dialog.showModal === 'function') dialog.showModal()
        else dialog.setAttribute('open', '')
      }
      window.setTimeout(() => reasonRef.current?.focus(), 0)
    } else if (!open && wasOpenRef.current) {
      if (dialog.open) {
        if (typeof dialog.close === 'function') dialog.close()
        else dialog.removeAttribute('open')
      }
      window.setTimeout(() => restoreFocusRef.current?.focus(), 0)
    }
    wasOpenRef.current = open
  }, [open])

  useEffect(() => () => { if (wasOpenRef.current) restoreFocusRef.current?.focus() }, [])

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const r = reason.trim()
    const res = resolution.trim()
    const next: typeof errors = {}
    if (r.length === 0) next.reason = 'Enter a reason.'
    if (res.length === 0) next.resolution = 'Enter a resolution.'
    if (Object.keys(next).length > 0) { setErrors(next); return }
    setErrors({})
    onConfirm(r, res)
  }

  function handleCancel() {
    if (!loading) onCancel()
  }

  return (
    <dialog
      ref={dialogRef}
      className="admin-action-dialog"
      aria-labelledby="report-resolve-title"
      aria-busy={loading || undefined}
      onCancel={(e) => { e.preventDefault(); handleCancel() }}
      onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); handleCancel() } }}
    >
      <form className="admin-action-dialog__form" onSubmit={handleSubmit} noValidate>
        <header className="admin-action-dialog__header">
          <p className="admin-action-dialog__eyebrow">Administrative action</p>
          <h2 id="report-resolve-title">{title}</h2>
          <p>Provide a reason and resolution for closing this report.</p>
        </header>

        <div className="form-field">
          <label className="form-field__label" htmlFor="report-resolve-reason">
            Reason <span className="form-field__required">*</span>
          </label>
          <textarea
            ref={reasonRef}
            id="report-resolve-reason"
            className="form-field__textarea"
            value={reason}
            placeholder="Why is this report being resolved…"
            maxLength={500}
            required
            disabled={loading}
            aria-invalid={errors.reason != null ? true : undefined}
            onChange={(e) => { setReason(e.target.value); if (errors.reason) setErrors((p) => ({ ...p, reason: undefined })) }}
          />
          {errors.reason != null && <p className="form-field__error">{errors.reason}</p>}
        </div>

        <div className="form-field">
          <label className="form-field__label" htmlFor="report-resolve-resolution">
            Resolution <span className="form-field__required">*</span>
          </label>
          <textarea
            id="report-resolve-resolution"
            className="form-field__textarea"
            value={resolution}
            placeholder="Describe the outcome or resolution…"
            maxLength={1000}
            required
            disabled={loading}
            aria-invalid={errors.resolution != null ? true : undefined}
            onChange={(e) => { setResolution(e.target.value); if (errors.resolution) setErrors((p) => ({ ...p, resolution: undefined })) }}
          />
          {errors.resolution != null && <p className="form-field__error">{errors.resolution}</p>}
        </div>

        <div className="admin-action-dialog__actions">
          <button type="button" className="btn btn--ghost" disabled={loading} onClick={handleCancel}>Cancel</button>
          <button type="submit" className="btn btn--primary" disabled={loading}>
            {loading ? <><span className="spinner spinner--sm" aria-hidden="true" /> Working…</> : 'Resolve'}
          </button>
        </div>
      </form>
    </dialog>
  )
}

export default function AdminReportsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const searchKey = useMemo(() => searchParams.toString(), [searchParams])
  const state = useMemo(() => parseAdminReportsSearch(new URLSearchParams(searchKey)), [searchKey])

  const [queryInput, setQueryInput] = useState(state.search)
  const debouncedQuery = useDebouncedValue(queryInput)
  const ackedQuery = useRef(state.search)

  const [result, setResult] = useState<Awaited<ReturnType<typeof listAdminReports>>['data']>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const [standardDialogOpen, setStandardDialogOpen] = useState(false)
  const [resolveDialogOpen, setResolveDialogOpen] = useState(false)
  const [actionKind, setActionKind] = useState<ActionKind>('under_review')
  const [actionTarget, setActionTarget] = useState<AdminPageItem<AdminReportListRow> | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  useEffect(() => {
    if (debouncedQuery !== queryInput) return
    if (debouncedQuery === state.search) return
    if (debouncedQuery === ackedQuery.current) return
    ackedQuery.current = debouncedQuery
    setSearchParams(
      serializeAdminReportsSearch({ ...state, search: debouncedQuery, page: 1 }),
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
    void listAdminReports(state).then(({ data, error: loadError }) => {
      if (!active) return
      if (loadError != null || data == null) {
        setError('We could not load reports. Please try again.')
        setResult(null)
      } else if (data.totalPages > 0 && state.page > data.totalPages && state.page !== 1) {
        setSearchParams(serializeAdminReportsSearch({ ...state, page: 1 }), { replace: true })
      } else {
        setResult(data)
      }
      setLoading(false)
    })
    return () => { active = false }
  }, [refreshKey, state, setSearchParams])

  function updateFilter(patch: Partial<{ status: ReportStatus | ''; sort: SortOption }>) {
    const next = { ...state, page: 1 }
    if ('status' in patch) next.status = patch.status != null && patch.status !== '' ? patch.status : null
    if ('sort' in patch) next.sort = patch.sort ?? state.sort
    setSearchParams(serializeAdminReportsSearch(next))
  }

  function openStandardDialog(kind: ActionKind, report: AdminPageItem<AdminReportListRow>) {
    setActionKind(kind)
    setActionTarget(report)
    setActionError(null)
    setStandardDialogOpen(true)
  }

  function openResolveDialog(report: AdminPageItem<AdminReportListRow>) {
    setActionTarget(report)
    setActionError(null)
    setResolveDialogOpen(true)
  }

  async function handleStandardConfirm(reason: string) {
    if (actionTarget == null) return
    setActionLoading(true)
    setActionError(null)
    const input: AdminReportActionInput = { reportId: actionTarget.report_id, reason }
    const fn = actionKind === 'under_review' ? markReportUnderReview : dismissReport
    const { error: actionErr } = await fn(input)
    setActionLoading(false)
    if (actionErr != null) {
      setActionError(actionErr.message)
      setStandardDialogOpen(false)
      return
    }
    setStandardDialogOpen(false)
    setRefreshKey((k) => k + 1)
  }

  async function handleResolveConfirm(reason: string, resolution: string) {
    if (actionTarget == null) return
    setActionLoading(true)
    setActionError(null)
    const input: AdminReportActionInput = { reportId: actionTarget.report_id, reason, resolution }
    const { error: actionErr } = await resolveReport(input)
    setActionLoading(false)
    if (actionErr != null) {
      setActionError(actionErr.message)
      setResolveDialogOpen(false)
      return
    }
    setResolveDialogOpen(false)
    setRefreshKey((k) => k + 1)
  }

  const STANDARD_TITLE: Record<ActionKind, string> = {
    under_review: 'Mark report under review',
    dismiss: 'Dismiss report',
  }

  const STANDARD_CONFIRM: Record<ActionKind, string> = {
    under_review: 'Mark under review',
    dismiss: 'Dismiss',
  }

  return (
    <div className="page admin-resource-page">
      <PageHeader title="Reports" intro="Review and moderate listing reports from buyers." />

      {actionError != null && !standardDialogOpen && !resolveDialogOpen && <Alert variant="error" message={actionError} />}

      <div className="admin-resource-toolbar">
        <div className="admin-resource-toolbar__row">
          <div className="admin-resource-toolbar__search">
            <input
              type="search"
              placeholder="Search by reason, listing, or store…"
              value={queryInput}
              onChange={(e) => setQueryInput(e.target.value)}
              aria-label="Search reports"
            />
          </div>
          <div className="admin-resource-toolbar__filter">
            <label>
              <span>Status</span>
              <select value={state.status ?? ''} onChange={(e) => updateFilter({ status: e.target.value as ReportStatus | '' })}>
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
        <LoadingState label="Loading reports…" />
      ) : error != null ? (
        <Alert variant="error" message={error} />
      ) : result != null && result.items.length > 0 ? (
        <>
          <p className="admin-resource-toolbar__count" aria-live="polite">
            Showing {result.items.length} of {result.total} report{result.total === 1 ? '' : 's'}
          </p>
          <div className="admin-resource-table">
            <table>
              <caption className="visually-hidden">Listing reports</caption>
              <thead>
                <tr>
                  <th>Reason</th>
                  <th>Listing</th>
                  <th>Store</th>
                  <th>Status</th>
                  <th>Resolved</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {result.items.map((row) => (
                  <tr key={row.report_id}>
                    <td>{row.reason}</td>
                    <td>{row.listing_title}</td>
                    <td>{row.store_name}</td>
                    <td className="admin-resource-table__badge-cell">
                      <Badge variant={row.status}>{row.status}</Badge>
                    </td>
                    <td>{row.resolved_at != null ? formatDateTime(row.resolved_at) : (
                      <span style={{ color: 'var(--color-text-muted)' }}>—</span>
                    )}</td>
                    <td>{formatDateTime(row.created_at)}</td>
                    <td>
                      <div className="admin-resource-table__actions">
                        {row.status === 'pending' && (
                          <>
                            <button type="button" className="btn btn--secondary" onClick={() => openStandardDialog('under_review', row)}>Under review</button>
                            <button type="button" className="btn btn--secondary" onClick={() => openStandardDialog('dismiss', row)}>Dismiss</button>
                          </>
                        )}
                        {row.status === 'under_review' && (
                          <>
                            <button type="button" className="btn btn--secondary" onClick={() => openResolveDialog(row)}>Resolve</button>
                            <button type="button" className="btn btn--secondary" onClick={() => openStandardDialog('dismiss', row)}>Dismiss</button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={result.page} totalPages={result.totalPages} onPageChange={(page) => setSearchParams(serializeAdminReportsSearch({ ...state, page }))} />
        </>
      ) : (
        <EmptyState title="No reports found" body="Try adjusting your search or filters." action={
          <button type="button" className="btn btn--primary" onClick={() => setSearchParams(serializeAdminReportsSearch(DEFAULT_ADMIN_REPORTS_SEARCH))}>Clear filters</button>
        } />
      )}

      <AdminActionDialog
        open={standardDialogOpen}
        title={actionTarget != null ? `${STANDARD_TITLE[actionKind]} — report #${actionTarget.report_id.slice(0, 8)}` : STANDARD_TITLE[actionKind]}
        description="This action requires a reason and cannot be undone."
        confirmLabel={STANDARD_CONFIRM[actionKind]}
        loading={actionLoading}
        loadingLabel="Working…"
        reasonRequired
        reasonPlaceholder="Explain why this action is being taken…"
        onCancel={() => setStandardDialogOpen(false)}
        onConfirm={handleStandardConfirm}
      />

      <ReportResolveDialog
        open={resolveDialogOpen}
        title={actionTarget != null ? `Resolve report — ${actionTarget.listing_title}` : 'Resolve report'}
        loading={actionLoading}
        onCancel={() => setResolveDialogOpen(false)}
        onConfirm={handleResolveConfirm}
      />
    </div>
  )
}
