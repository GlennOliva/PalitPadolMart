import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import type {
  AdminCategoryActionInput,
  AdminCategoryInput,
  AdminCategoryListRow,
  AdminCategorySort,
  AdminPage,
  AdminPageItem,
} from '../../features/admin/admin.types'
import { parseAdminCategoriesSearch, serializeAdminCategoriesSearch } from '../../features/admin/admin-params'
import {
  createCategory,
  deactivateCategory,
  listAdminCategories,
  reactivateCategory,
  updateCategory,
} from '../../features/admin/admin-marketplace.service'
import type { AdminCategoryFieldErrors } from '../../features/admin/admin-validation'
import { normalizeTaxonomySlug, validateAdminCategory } from '../../features/admin/admin-validation'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import PageHeader from '../../components/common/PageHeader'
import LoadingState from '../../components/common/LoadingState'
import Alert from '../../components/common/Alert'
import EmptyState from '../../components/common/EmptyState'
import Badge from '../../components/common/Badge'
import AdminActionDialog from '../../components/admin/AdminActionDialog'
import Pagination from '../../components/marketplace/Pagination'
import { formatDate } from '../../utils/format'

type CategoryRow = AdminPageItem<AdminCategoryListRow>

const STATUS_OPTIONS: { label: string; value: string }[] = [
  { label: 'All', value: '' },
  { label: 'Active', value: '1' },
  { label: 'Inactive', value: '0' },
]

const SORT_OPTIONS: { label: string; value: AdminCategorySort }[] = [
  { label: 'Sort order', value: 'sort_order' },
  { label: 'Name A–Z', value: 'name_asc' },
  { label: 'Name Z–A', value: 'name_desc' },
  { label: 'Newest', value: 'newest' },
]

function slugify(value: string): string {
  return normalizeTaxonomySlug(value)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

interface CategoryFormDialogProps {
  open: boolean
  mode: 'create' | 'edit'
  initial: CategoryRow | null
  saving: boolean
  error: string | null
  onCancel: () => void
  onSave: (input: AdminCategoryInput) => void
}

function CategoryFormDialog({
  open,
  mode,
  initial,
  saving,
  error,
  onCancel,
  onSave,
}: CategoryFormDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  const slugRef = useRef<HTMLInputElement>(null)
  const sortRef = useRef<HTMLInputElement>(null)
  const reasonRef = useRef<HTMLTextAreaElement>(null)
  const restoreFocusRef = useRef<HTMLElement | null>(null)
  const wasOpenRef = useRef(false)
  const titleId = useId()
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [description, setDescription] = useState('')
  const [sortOrder, setSortOrder] = useState('0')
  const [reason, setReason] = useState('')
  const [slugEdited, setSlugEdited] = useState(false)
  const [errors, setErrors] = useState<AdminCategoryFieldErrors>({})

  useEffect(() => {
    const dialog = dialogRef.current
    if (dialog == null) return

    if (open && !wasOpenRef.current) {
      restoreFocusRef.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null
      if (initial == null) {
        setName('')
        setSlug('')
        setDescription('')
        setSortOrder('0')
        setReason('')
      } else {
        setName(initial.name)
        setSlug(initial.slug)
        setDescription(initial.description)
        setSortOrder(String(initial.sort_order))
        setReason('')
      }
      setSlugEdited(false)
      setErrors({})
      if (!dialog.open) {
        if (typeof dialog.showModal === 'function') dialog.showModal()
        else dialog.setAttribute('open', '')
      }
      window.setTimeout(() => nameRef.current?.focus(), 0)
    } else if (!open && wasOpenRef.current) {
      if (dialog.open) {
        if (typeof dialog.close === 'function') dialog.close()
        else dialog.removeAttribute('open')
      }
      window.setTimeout(() => restoreFocusRef.current?.focus(), 0)
    }

    wasOpenRef.current = open
  }, [open, initial])

  useEffect(
    () => () => {
      if (wasOpenRef.current) restoreFocusRef.current?.focus()
    },
    [],
  )

  const requestCancel = () => {
    if (!saving) onCancel()
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const input: AdminCategoryInput = {
      name: name.trim(),
      slug: slug.trim() === '' ? slugify(name) : normalizeTaxonomySlug(slug),
      description: description.trim(),
      sortOrder: sortOrder.trim() === '' ? Number.NaN : Number(sortOrder),
      reason: reason.trim(),
    }
    const fieldErrors = validateAdminCategory(input)
    setErrors(fieldErrors)
    if (fieldErrors.name != null) {
      nameRef.current?.focus()
      return
    }
    if (fieldErrors.slug != null) {
      slugRef.current?.focus()
      return
    }
    if (fieldErrors.sortOrder != null) {
      sortRef.current?.focus()
      return
    }
    if (fieldErrors.reason != null) {
      reasonRef.current?.focus()
      return
    }
    onSave(input)
  }

  return (
    <dialog
      ref={dialogRef}
      className="admin-action-dialog admin-taxonomy-dialog"
      aria-labelledby={titleId}
      aria-busy={saving || undefined}
      onCancel={(event) => {
        event.preventDefault()
        requestCancel()
      }}
    >
      <form className="admin-taxonomy-form" onSubmit={handleSubmit} noValidate>
        <header className="admin-action-dialog__header">
          <p className="admin-action-dialog__eyebrow">Administrative action</p>
          <h2 id={titleId}>{mode === 'create' ? 'Create category' : 'Edit category'}</h2>
        </header>

        <div className="admin-taxonomy-form__grid">
          <div className="form-field">
            <label className="form-field__label" htmlFor={`${titleId}-name`}>
              Name
              <span className="form-field__required"> *</span>
            </label>
            <input
              ref={nameRef}
              id={`${titleId}-name`}
              className="form-field__input"
              value={name}
              maxLength={100}
              required
              disabled={saving}
              aria-invalid={errors.name != null ? true : undefined}
              onChange={(event) => {
                const nextName = event.target.value
                setName(nextName)
                if (!slugEdited) setSlug(slugify(nextName))
                if (errors.name != null) setErrors((current) => ({ ...current, name: undefined }))
              }}
            />
            {errors.name == null ? null : <p className="form-field__error">{errors.name}</p>}
          </div>

          <div className="form-field">
            <label className="form-field__label" htmlFor={`${titleId}-slug`}>
              Slug
              <span className="form-field__required"> *</span>
            </label>
            <input
              ref={slugRef}
              id={`${titleId}-slug`}
              className="form-field__input"
              value={slug}
              maxLength={80}
              required
              disabled={saving}
              aria-invalid={errors.slug != null ? true : undefined}
              onChange={(event) => {
                setSlug(event.target.value)
                setSlugEdited(true)
                if (errors.slug != null) setErrors((current) => ({ ...current, slug: undefined }))
              }}
            />
            {errors.slug == null ? null : <p className="form-field__error">{errors.slug}</p>}
          </div>
        </div>

        <div className="form-field">
          <label className="form-field__label" htmlFor={`${titleId}-description`}>
            Description
          </label>
          <textarea
            id={`${titleId}-description`}
            className="form-field__textarea"
            value={description}
            maxLength={1000}
            disabled={saving}
            aria-invalid={errors.description != null ? true : undefined}
            onChange={(event) => {
              setDescription(event.target.value)
              if (errors.description != null) setErrors((current) => ({ ...current, description: undefined }))
            }}
          />
          {errors.description == null ? null : <p className="form-field__error">{errors.description}</p>}
        </div>

        <div className="admin-taxonomy-form__grid">
          <div className="form-field">
            <label className="form-field__label" htmlFor={`${titleId}-sort`}>
              Sort order
              <span className="form-field__required"> *</span>
            </label>
            <input
              ref={sortRef}
              id={`${titleId}-sort`}
              className="form-field__input"
              type="number"
              inputMode="numeric"
              min={0}
              max={10000}
              step={1}
              value={sortOrder}
              disabled={saving}
              aria-invalid={errors.sortOrder != null ? true : undefined}
              onChange={(event) => {
                setSortOrder(event.target.value)
                if (errors.sortOrder != null) setErrors((current) => ({ ...current, sortOrder: undefined }))
              }}
            />
            {errors.sortOrder == null ? null : <p className="form-field__error">{errors.sortOrder}</p>}
          </div>
        </div>

        <div className="form-field">
          <label className="form-field__label" htmlFor={`${titleId}-reason`}>
            Reason
            <span className="form-field__required"> *</span>
          </label>
          <textarea
            ref={reasonRef}
            id={`${titleId}-reason`}
            className="form-field__textarea"
            value={reason}
            maxLength={1000}
            required
            disabled={saving}
            aria-invalid={errors.reason != null ? true : undefined}
            onChange={(event) => {
              setReason(event.target.value)
              if (errors.reason != null) setErrors((current) => ({ ...current, reason: undefined }))
            }}
          />
          {errors.reason == null ? null : <p className="form-field__error">{errors.reason}</p>}
        </div>

        {error == null ? null : <Alert variant="error" message={error} />}

        <div className="admin-action-dialog__actions">
          <button type="button" className="btn btn--ghost" disabled={saving} onClick={requestCancel}>
            Cancel
          </button>
          <button type="submit" className="btn btn--primary" disabled={saving}>
            {saving ? (
              <>
                <span className="spinner spinner--sm" aria-hidden="true" />
                Saving…
              </>
            ) : mode === 'create' ? (
              'Create category'
            ) : (
              'Save changes'
            )}
          </button>
        </div>
      </form>
    </dialog>
  )
}

export default function AdminCategoriesPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const searchKey = useMemo(() => searchParams.toString(), [searchParams])
  const state = useMemo(() => parseAdminCategoriesSearch(new URLSearchParams(searchKey)), [searchKey])

  const [queryInput, setQueryInput] = useState(state.search)
  const debouncedQuery = useDebouncedValue(queryInput)
  const ackedQuery = useRef(state.search)

  const [result, setResult] = useState<AdminPage<AdminCategoryListRow> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const [formOpen, setFormOpen] = useState(false)
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create')
  const [formInitial, setFormInitial] = useState<CategoryRow | null>(null)
  const [formSaving, setFormSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const [activationTarget, setActivationTarget] = useState<CategoryRow | null>(null)
  const [activationKind, setActivationKind] = useState<'deactivate' | 'reactivate'>('deactivate')
  const [activationLoading, setActivationLoading] = useState(false)
  const [activationError, setActivationError] = useState<string | null>(null)

  useEffect(() => {
    if (debouncedQuery !== queryInput) return
    if (debouncedQuery === state.search) return
    if (debouncedQuery === ackedQuery.current) return
    ackedQuery.current = debouncedQuery
    setSearchParams(
      serializeAdminCategoriesSearch({ ...state, search: debouncedQuery, page: 1 }),
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
    void listAdminCategories(state).then(({ data, error: loadError }) => {
      if (!active) return
      if (loadError != null || data == null) {
        setError('We could not load categories. Please try again.')
        setResult(null)
      } else if (data.totalPages > 0 && state.page > data.totalPages && state.page !== 1) {
        setSearchParams(serializeAdminCategoriesSearch({ ...state, page: 1 }), { replace: true })
      } else {
        setResult(data)
      }
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [refreshKey, state, setSearchParams])

  function openCreate() {
    setFormMode('create')
    setFormInitial(null)
    setFormError(null)
    setFormOpen(true)
  }

  function openEdit(row: CategoryRow) {
    setFormMode('edit')
    setFormInitial(row)
    setFormError(null)
    setFormOpen(true)
  }

  async function handleFormSave(input: AdminCategoryInput) {
    setFormSaving(true)
    setFormError(null)
    const saveResult =
      formMode === 'edit' && formInitial != null
        ? await updateCategory({ categoryId: formInitial.id, ...input })
        : await createCategory(input)
    setFormSaving(false)
    if (saveResult.error != null) {
      setFormError(saveResult.error.message)
      return
    }
    setFormOpen(false)
    setRefreshKey((key) => key + 1)
  }

  function openActivation(kind: 'deactivate' | 'reactivate', row: CategoryRow) {
    setActivationKind(kind)
    setActivationTarget(row)
    setActivationError(null)
  }

  async function handleActivation(reason: string) {
    if (activationTarget == null) return
    setActivationLoading(true)
    setActivationError(null)
    const input: AdminCategoryActionInput = { categoryId: activationTarget.id, reason }
    const result =
      activationKind === 'deactivate' ? await deactivateCategory(input) : await reactivateCategory(input)
    setActivationLoading(false)
    setActivationTarget(null)
    if (result.error != null) {
      setActivationError(result.error.message)
      return
    }
    setRefreshKey((key) => key + 1)
  }

  function clearFilters() {
    setSearchParams(serializeAdminCategoriesSearch({ ...state, search: '', page: 1, isActive: null, sort: 'sort_order' }))
  }

  return (
    <div className="page admin-resource-page">
      <PageHeader
        title="Categories"
        intro="Manage marketplace category taxonomy, ordering, and availability."
        actions={
          <button type="button" className="btn btn--primary" onClick={openCreate}>
            Create category
          </button>
        }
      />

      {activationError != null && <Alert variant="error" message={activationError} />}

      <div className="admin-resource-toolbar">
        <div className="admin-resource-toolbar__row">
          <div className="admin-resource-toolbar__search">
            <input
              type="search"
              placeholder="Search by category name or slug…"
              value={queryInput}
              onChange={(event) => setQueryInput(event.target.value)}
              aria-label="Search categories"
            />
          </div>
          <div className="admin-resource-toolbar__filter">
            <label>
              <span>Status</span>
              <select
                value={state.isActive == null ? '' : state.isActive ? '1' : '0'}
                onChange={(event) => {
                  const value = event.target.value
                  setSearchParams(
                    serializeAdminCategoriesSearch({
                      ...state,
                      isActive: value === '' ? null : value === '1',
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
                  setSearchParams(serializeAdminCategoriesSearch({ ...state, sort: event.target.value as AdminCategorySort, page: 1 }))
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
        <LoadingState label="Loading categories…" />
      ) : error != null ? (
        <Alert variant="error" message={error} />
      ) : result != null && result.items.length > 0 ? (
        <>
          <p className="admin-resource-toolbar__count" aria-live="polite">
            Showing {result.items.length} of {result.total} categor{result.total === 1 ? 'y' : 'ies'}
          </p>
          <div className="admin-resource-table">
            <table>
              <caption className="visually-hidden">Product categories</caption>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Slug</th>
                  <th className="admin-table--num">Sort</th>
                  <th>Active</th>
                  <th className="admin-table--num">Listings</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {result.items.map((row) => (
                  <tr key={row.id}>
                    <td>{row.name}</td>
                    <td>
                      <span className="admin-resource-code">{row.slug}</span>
                    </td>
                    <td className="admin-table--num">{row.sort_order}</td>
                    <td className="admin-resource-table__badge-cell">
                      {row.is_active ? <Badge variant="active">Active</Badge> : <Badge variant="deactivated">Inactive</Badge>}
                    </td>
                    <td className="admin-table--num">{row.listing_count}</td>
                    <td>{formatDate(row.created_at)}</td>
                    <td>
                      <div className="admin-resource-table__actions">
                        <button type="button" className="btn btn--secondary" onClick={() => openEdit(row)}>
                          Edit
                        </button>
                        {row.is_active ? (
                          <button type="button" className="btn btn--secondary" onClick={() => openActivation('deactivate', row)}>
                            Deactivate
                          </button>
                        ) : (
                          <button type="button" className="btn btn--secondary" onClick={() => openActivation('reactivate', row)}>
                            Reactivate
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
            onPageChange={(page) => setSearchParams(serializeAdminCategoriesSearch({ ...state, page }))}
          />
        </>
      ) : (
        <EmptyState
          title="No categories found"
          body="Try adjusting your search or filters."
          action={
            <button type="button" className="btn btn--primary" onClick={clearFilters}>
              Clear filters
            </button>
          }
        />
      )}

      <CategoryFormDialog
        open={formOpen}
        mode={formMode}
        initial={formInitial}
        saving={formSaving}
        error={formError}
        onCancel={() => setFormOpen(false)}
        onSave={(input) => void handleFormSave(input)}
      />

      <AdminActionDialog
        open={activationTarget != null}
        title={activationTarget != null ? `${activationKind === 'deactivate' ? 'Deactivate' : 'Reactivate'} category — ${activationTarget.name}` : ''}
        description="This action requires a reason and takes effect immediately on the catalog."
        confirmLabel={activationKind === 'deactivate' ? 'Deactivate' : 'Reactivate'}
        loading={activationLoading}
        loadingLabel="Working…"
        reasonRequired
        reasonPlaceholder="Explain why this category status is changing…"
        onCancel={() => setActivationTarget(null)}
        onConfirm={(reason) => void handleActivation(reason)}
      />
    </div>
  )
}