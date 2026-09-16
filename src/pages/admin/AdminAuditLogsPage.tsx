import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { AdminActionDetailRow, AdminActionListRow, AdminPage, AdminPageItem } from '../../features/admin/admin.types'
import { parseAdminActionsSearch, serializeAdminActionsSearch } from '../../features/admin/admin-params'
import { getAdminAction, listAdminActions } from '../../features/admin/admin-audit.service'
import PageHeader from '../../components/common/PageHeader'
import LoadingState from '../../components/common/LoadingState'
import Alert from '../../components/common/Alert'
import EmptyState from '../../components/common/EmptyState'
import AdminSearchBar from '../../components/admin/AdminSearchBar'
import AdminDetailDrawer from '../../components/admin/AdminDetailDrawer'
import Pagination from '../../components/marketplace/Pagination'
import { formatDateTime } from '../../utils/format'

type ActionRow = AdminPageItem<AdminActionListRow>

const SORT_OPTIONS: { label: string; value: 'newest' | 'oldest' }[] = [
  { label: 'Newest', value: 'newest' },
  { label: 'Oldest', value: 'oldest' },
]

function shortId(value: string): string {
  return value.length <= 8 ? value : `${value.slice(0, 8)}…`
}

function formatJson(value: unknown): string {
  if (value == null) return 'null'
  if (typeof value === 'string') return value
  return JSON.stringify(value, null, 2)
}

export default function AdminAuditLogsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const searchKey = useMemo(() => searchParams.toString(), [searchParams])
  const state = useMemo(() => parseAdminActionsSearch(new URLSearchParams(searchKey)), [searchKey])

  const [result, setResult] = useState<AdminPage<AdminActionListRow> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [selected, setSelected] = useState<ActionRow | null>(null)
  const [detail, setDetail] = useState<AdminActionDetailRow | null>(null)
  const [drawerLoading, setDrawerLoading] = useState(false)
  const [drawerError, setDrawerError] = useState<string | null>(null)

  function applyPatch(patch: Partial<{ search: string; actionType: string; entityType: string }>) {
    setSearchParams(serializeAdminActionsSearch({ ...state, ...patch, page: 1 }))
  }

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)
    void listAdminActions(state).then(({ data, error: loadError }) => {
      if (!active) return
      if (loadError != null || data == null) {
        setError('We could not load audit logs. Please try again.')
        setResult(null)
      } else if (data.totalPages > 0 && state.page > data.totalPages && state.page !== 1) {
        setSearchParams(serializeAdminActionsSearch({ ...state, page: 1 }), { replace: true })
      } else {
        setResult(data)
      }
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [state, setSearchParams])

  async function openAction(row: ActionRow) {
    setSelected(row)
    setDrawerLoading(true)
    setDrawerError(null)
    setDetail(null)
    const { data: action, error: actionError } = await getAdminAction(row.action_id)
    if (actionError != null || action == null) {
      setDrawerError('We could not load the full action details. Please try again.')
      return
    }
    setDetail(action)
    setDrawerLoading(false)
  }

  function closeDrawer() {
    setSelected(null)
    setDetail(null)
    setDrawerError(null)
  }

  function clearFilters() {
    setSearchParams(serializeAdminActionsSearch({ ...state, search: '', actionType: '', entityType: '', page: 1, sort: 'newest' }))
  }

  return (
    <div className="page admin-resource-page">
      <PageHeader
        title="Audit Logs"
        intro="Read-only trail of every administrative action taken on the platform."
      />

      <div className="admin-resource-toolbar">
        <div className="admin-resource-toolbar__row">
          <div className="admin-resource-toolbar__search">
            <AdminSearchBar
              value={state.search}
              onChange={(search) => applyPatch({ search })}
              placeholder="Search by admin email or reason…"
            />
          </div>
          <div className="admin-resource-toolbar__filter">
            <label>
              <span>Action type</span>
              <AdminSearchBar
                value={state.actionType}
                onChange={(actionType) => applyPatch({ actionType })}
                placeholder="e.g. user_suspended"
              />
            </label>
            <label>
              <span>Entity type</span>
              <AdminSearchBar
                value={state.entityType}
                onChange={(entityType) => applyPatch({ entityType })}
                placeholder="e.g. user"
              />
            </label>
            <label>
              <span>Sort</span>
              <select
                value={state.sort}
                onChange={(event) =>
                  setSearchParams(serializeAdminActionsSearch({ ...state, sort: event.target.value as 'newest' | 'oldest', page: 1 }))
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
        <LoadingState label="Loading audit logs…" />
      ) : error != null ? (
        <Alert variant="error" message={error} />
      ) : result != null && result.items.length > 0 ? (
        <>
          <p className="admin-resource-toolbar__count" aria-live="polite">
            Showing {result.items.length} of {result.total} action{result.total === 1 ? '' : 's'}
          </p>
          <div className="admin-resource-table admin-resource-table--clickable">
            <table>
              <caption className="visually-hidden">Administrative action log</caption>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Admin</th>
                  <th>Action</th>
                  <th>Entity</th>
                  <th>Reason</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {result.items.map((row) => (
                  <tr key={row.action_id} onClick={() => void openAction(row)}>
                    <td className="admin-resource-table__nowrap">{formatDateTime(row.created_at)}</td>
                    <td className="admin-resource-table__nowrap">{row.admin_email}</td>
                    <td className="admin-resource-table__nowrap">
                      <span className="admin-resource-code">{row.action_type}</span>
                    </td>
                    <td>
                      <span className="admin-resource-code">{row.entity_type}</span>
                    </td>
                    <td className="admin-resource-table__truncate" title={row.reason}>
                      {row.reason}
                    </td>
                    <td>
                      <div className="admin-resource-table__actions">
                        <button
                          type="button"
                          className="btn btn--ghost btn--sm"
                          onClick={() => void openAction(row)}
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
            onPageChange={(page) => setSearchParams(serializeAdminActionsSearch({ ...state, page }))}
          />
        </>
      ) : (
        <EmptyState
          title="No actions found"
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
        title={selected != null ? `Action — ${selected.action_type}` : 'Action'}
        onClose={closeDrawer}
      >
        {drawerLoading ? (
          <LoadingState label="Loading action details…" />
        ) : drawerError != null ? (
          <Alert variant="error" message={drawerError} />
        ) : detail != null ? (
          <>
            <section className="admin-detail-section" aria-label="Action details">
              <h3 className="admin-detail-section__title">Action details</h3>
              <dl className="admin-detail-definition">
                <div className="admin-detail-definition__row">
                  <dt>Action type</dt>
                  <dd>
                    <span className="admin-resource-code">{detail.action_type}</span>
                  </dd>
                </div>
                <div className="admin-detail-definition__row">
                  <dt>Entity type</dt>
                  <dd>
                    <span className="admin-resource-code">{detail.entity_type}</span>
                  </dd>
                </div>
                <div className="admin-detail-definition__row">
                  <dt>Entity ID</dt>
                  <dd>{shortId(detail.entity_id)}</dd>
                </div>
                <div className="admin-detail-definition__row">
                  <dt>Admin</dt>
                  <dd>
                    {detail.admin_email}
                    <span className="admin-detail-sub"> {shortId(detail.admin_id)}</span>
                  </dd>
                </div>
                <div className="admin-detail-definition__row">
                  <dt>Timestamp</dt>
                  <dd>{formatDateTime(detail.created_at)}</dd>
                </div>
                <div className="admin-detail-definition__row">
                  <dt>Reason</dt>
                  <dd>{detail.reason || '—'}</dd>
                </div>
              </dl>
            </section>

            <section className="admin-detail-section" aria-label="Previous data">
              <h3 className="admin-detail-section__title">Previous data</h3>
              <pre className="admin-detail-code">{formatJson(detail.previous_data)}</pre>
            </section>

            <section className="admin-detail-section" aria-label="New data">
              <h3 className="admin-detail-section__title">New data</h3>
              <pre className="admin-detail-code">{formatJson(detail.new_data)}</pre>
            </section>
          </>
        ) : null}
      </AdminDetailDrawer>
    </div>
  )
}