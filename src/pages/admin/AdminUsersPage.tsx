import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { AccountStatus, UserRole } from '../../features/admin/admin.types'
import type { AdminUserActionInput } from '../../features/admin/admin.types'
import { DEFAULT_ADMIN_USERS_SEARCH, parseAdminUsersSearch, serializeAdminUsersSearch } from '../../features/admin/admin-params'
import { listAdminUsers, suspendUser, reactivateUser, deactivateUser, promoteUserToAdmin, demoteAdmin } from '../../features/admin/admin-users.service'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import PageHeader from '../../components/common/PageHeader'
import LoadingState from '../../components/common/LoadingState'
import Alert from '../../components/common/Alert'
import EmptyState from '../../components/common/EmptyState'
import Badge from '../../components/common/Badge'
import AdminActionDialog from '../../components/admin/AdminActionDialog'
import Pagination from '../../components/marketplace/Pagination'
import { formatDate } from '../../utils/format'
import type { AdminPageItem, AdminUserListRow } from '../../features/admin/admin.types'

type SortOption = 'newest' | 'oldest' | 'name_asc' | 'name_desc' | 'last_sign_in'

const SORT_OPTIONS: { label: string; value: SortOption }[] = [
  { label: 'Newest', value: 'newest' },
  { label: 'Oldest', value: 'oldest' },
  { label: 'Name A–Z', value: 'name_asc' },
  { label: 'Name Z–A', value: 'name_desc' },
  { label: 'Last sign-in', value: 'last_sign_in' },
]

const ROLE_OPTIONS: { label: string; value: UserRole | '' }[] = [
  { label: 'All roles', value: '' },
  { label: 'Admin', value: 'admin' },
  { label: 'Customer', value: 'customer' },
]

const STATUS_OPTIONS: { label: string; value: AccountStatus | '' }[] = [
  { label: 'All statuses', value: '' },
  { label: 'Active', value: 'active' },
  { label: 'Suspended', value: 'suspended' },
  { label: 'Deactivated', value: 'deactivated' },
]

type ActionKind = 'suspend' | 'reactivate' | 'deactivate' | 'promote' | 'demote'

export default function AdminUsersPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const searchKey = useMemo(() => searchParams.toString(), [searchParams])
  const state = useMemo(() => parseAdminUsersSearch(new URLSearchParams(searchKey)), [searchKey])

  const [queryInput, setQueryInput] = useState(state.search)
  const debouncedQuery = useDebouncedValue(queryInput)
  const ackedQuery = useRef(state.search)

  const [result, setResult] = useState<Awaited<ReturnType<typeof listAdminUsers>>['data']>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [actionKind, setActionKind] = useState<ActionKind>('suspend')
  const [actionTarget, setActionTarget] = useState<AdminPageItem<AdminUserListRow> | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  useEffect(() => {
    if (debouncedQuery !== queryInput) return
    if (debouncedQuery === state.search) return
    if (debouncedQuery === ackedQuery.current) return
    ackedQuery.current = debouncedQuery
    setSearchParams(
      serializeAdminUsersSearch({ ...state, search: debouncedQuery, page: 1 }),
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
    void listAdminUsers(state).then(({ data, error: loadError }) => {
      if (!active) return
      if (loadError != null || data == null) {
        setError('We could not load users. Please try again.')
        setResult(null)
      } else if (data.totalPages > 0 && state.page > data.totalPages && state.page !== 1) {
        setSearchParams(serializeAdminUsersSearch({ ...state, page: 1 }), { replace: true })
      } else {
        setResult(data)
      }
      setLoading(false)
    })
    return () => { active = false }
  }, [refreshKey, state, setSearchParams])

  function updateFilter(patch: Partial<{ role: UserRole | ''; sort: SortOption; accountStatus: AccountStatus | '' }>) {
    const next = { ...state, page: 1 }
    if ('role' in patch) next.role = patch.role != null && patch.role !== '' ? patch.role : null
    if ('accountStatus' in patch) next.accountStatus = patch.accountStatus != null && patch.accountStatus !== '' ? patch.accountStatus : null
    if ('sort' in patch) next.sort = patch.sort ?? state.sort
    setSearchParams(serializeAdminUsersSearch(next))
  }

  function openDialog(kind: ActionKind, user: AdminPageItem<AdminUserListRow>) {
    setActionKind(kind)
    setActionTarget(user)
    setActionError(null)
    setDialogOpen(true)
  }

  async function handleConfirm(reason: string) {
    if (actionTarget == null) return
    setActionLoading(true)
    setActionError(null)
    const input: AdminUserActionInput = { userId: actionTarget.user_id, reason }
    const actionMap: Record<ActionKind, (i: AdminUserActionInput) => Promise<{ data: unknown; error: { message: string } | null }>> = {
      suspend: suspendUser,
      reactivate: reactivateUser,
      deactivate: deactivateUser,
      promote: promoteUserToAdmin,
      demote: demoteAdmin,
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
    suspend: 'Suspend user',
    reactivate: 'Reactivate user',
    deactivate: 'Deactivate user',
    promote: 'Promote to admin',
    demote: 'Demote admin',
  }

  const DIALOG_CONFIRM: Record<ActionKind, string> = {
    suspend: 'Suspend',
    reactivate: 'Reactivate',
    deactivate: 'Deactivate',
    promote: 'Promote',
    demote: 'Demote',
  }

  function displayName(row: AdminPageItem<AdminUserListRow>) {
    const full = [row.first_name, row.last_name].filter(Boolean).join(' ').trim()
    return row.display_name || full || row.email
  }

  return (
    <div className="page admin-resource-page">
      <PageHeader title="Users" intro="Manage platform accounts, roles, and account status." />

      {actionError != null && !dialogOpen && <Alert variant="error" message={actionError} />}

      <div className="admin-resource-toolbar">
        <div className="admin-resource-toolbar__row">
          <div className="admin-resource-toolbar__search">
            <input
              type="search"
              placeholder="Search by email or name…"
              value={queryInput}
              onChange={(e) => setQueryInput(e.target.value)}
              aria-label="Search users"
            />
          </div>
          <div className="admin-resource-toolbar__filter">
            <label>
              <span>Role</span>
              <select value={state.role ?? ''} onChange={(e) => updateFilter({ role: e.target.value as UserRole | '' })}>
                {ROLE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Status</span>
              <select value={state.accountStatus ?? ''} onChange={(e) => updateFilter({ accountStatus: e.target.value as AccountStatus | '' })}>
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
        <LoadingState label="Loading users…" />
      ) : error != null ? (
        <Alert variant="error" message={error} />
      ) : result != null && result.items.length > 0 ? (
        <>
          <p className="admin-resource-toolbar__count" aria-live="polite">
            Showing {result.items.length} of {result.total} user{result.total === 1 ? '' : 's'}
          </p>
          <div className="admin-resource-table">
            <table>
              <caption className="visually-hidden">Registered users</caption>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Seller</th>
                  <th>Joined</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {result.items.map((row) => (
                  <tr key={row.user_id}>
                    <td>{displayName(row)}</td>
                    <td>{row.email}</td>
                    <td className="admin-resource-table__badge-cell">
                      <Badge variant={row.role === 'admin' ? 'admin' : 'neutral'}>{row.role}</Badge>
                    </td>
                    <td className="admin-resource-table__badge-cell">
                      <Badge variant={row.account_status}>{row.account_status}</Badge>
                    </td>
                    <td>
                      {row.seller_id != null ? (
                        <Badge variant={row.seller_status}>{row.seller_status}</Badge>
                      ) : (
                        <span style={{ color: 'var(--color-text-muted)' }}>—</span>
                      )}
                    </td>
                    <td>{formatDate(row.auth_created_at)}</td>
                    <td>
                      <div className="admin-resource-table__actions">
                        {row.account_status === 'active' && (
                          <button type="button" className="btn btn--secondary" onClick={() => openDialog('suspend', row)}>Suspend</button>
                        )}
                        {row.account_status === 'suspended' && (
                          <button type="button" className="btn btn--secondary" onClick={() => openDialog('reactivate', row)}>Reactivate</button>
                        )}
                        {row.account_status !== 'deactivated' && (
                          <button type="button" className="btn btn--secondary" onClick={() => openDialog('deactivate', row)}>Deactivate</button>
                        )}
                        {row.role === 'customer' && (
                          <button type="button" className="btn btn--secondary" onClick={() => openDialog('promote', row)}>Promote</button>
                        )}
                        {row.role === 'admin' && (
                          <button type="button" className="btn btn--secondary" onClick={() => openDialog('demote', row)}>Demote</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={result.page} totalPages={result.totalPages} onPageChange={(page) => setSearchParams(serializeAdminUsersSearch({ ...state, page }))} />
        </>
      ) : (
        <EmptyState title="No users found" body="Try adjusting your search or filters." action={
          <button type="button" className="btn btn--primary" onClick={() => setSearchParams(serializeAdminUsersSearch(DEFAULT_ADMIN_USERS_SEARCH))}>Clear filters</button>
        } />
      )}

      <AdminActionDialog
        open={dialogOpen}
        title={actionTarget != null ? `${DIALOG_TITLE[actionKind]} — ${displayName(actionTarget)}` : DIALOG_TITLE[actionKind]}
        description={`This action requires a reason and cannot be undone.`}
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
