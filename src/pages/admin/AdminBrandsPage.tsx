import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import type {
  AdminBrandActionInput,
  AdminBrandInput,
  AdminBrandListRow,
  AdminBrandSort,
  AdminPage,
  AdminPageItem,
} from '../../features/admin/admin.types'
import { parseAdminBrandsSearch, serializeAdminBrandsSearch } from '../../features/admin/admin-params'
import {
  createBrand,
  deactivateBrand,
  listAdminBrands,
  reactivateBrand,
  updateBrand,
} from '../../features/admin/admin-marketplace.service'
import type { AdminBrandFieldErrors } from '../../features/admin/admin-validation'
import { normalizeTaxonomySlug, validateAdminBrand } from '../../features/admin/admin-validation'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import PageHeader from '../../components/common/PageHeader'
import LoadingState from '../../components/common/LoadingState'
import Alert from '../../components/common/Alert'
import EmptyState from '../../components/common/EmptyState'
import Badge from '../../components/common/Badge'
import AdminActionDialog from '../../components/admin/AdminActionDialog'
import Pagination from '../../components/marketplace/Pagination'
import { formatDate } from '../../utils/format'

type BrandRow = AdminPageItem<AdminBrandListRow>

const STATUS_OPTIONS: { label: string; value: string }[] = [
  { label: 'All', value: '' },
  { label: 'Active', value: '1' },
  { label: 'Inactive', value: '0' },
]

const SORT_OPTIONS: { label: string; value: AdminBrandSort }[] = [
  { label: 'Name A–Z', value: 'name_asc' },
  { label: 'Name Z–A', value: 'name_desc' },
  { label: 'Newest', value: 'newest' },
  { label: 'Oldest', value: 'oldest' },
]

function slugify(value: string): string {
  return normalizeTaxonomySlug(value)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

interface BrandFormDialogProps {
  open: boolean
  mode: 'create' | 'edit'
  initial: BrandRow | null
  saving: boolean
  error: string | null
  onCancel: () => void
  onSave: (input: AdminBrandInput) => void
}

function BrandFormDialog({
  open,
  mode,
  initial,
  saving,
  error,
  onCancel,
  onSave,
}: BrandFormDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  const slugRef = useRef<HTMLInputElement>(null)
  const reasonRef = useRef<HTMLTextAreaElement>(null)
  const restoreFocusRef = useRef<HTMLElement | null>(null)
  const wasOpenRef = useRef(false)
  const titleId = useId()
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [description, setDescription] = useState('')
  const [logoUrl, setLogoUrl] = useState('')
  const [reason, setReason] = useState('')
  const [slugEdited, setSlugEdited] = useState(false)
  const [errors, setErrors] = useState<AdminBrandFieldErrors>({})

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
        setLogoUrl('')
        setReason('')
      } else {
        setName(initial.name)
        setSlug(initial.slug)
        setDescription(initial.description)
        setLogoUrl(initial.logo_url)
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
    const input: AdminBrandInput = {
      name: name.trim(),
      slug: slug.trim() === '' ? slugify(name) : normalizeTaxonomySlug(slug),
      logoUrl: logoUrl.trim(),
      description: description.trim(),
      reason: reason.trim(),
    }
    const fieldErrors = validateAdminBrand(input)
    setErrors(fieldErrors)
    if (fieldErrors.name != null) {
      nameRef.current?.focus()
      return
    }
    if (fieldErrors.slug != null) {
      slugRef.current?.focus()
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
          <h2 id={titleId}>{mode === 'create' ? 'Create brand' : 'Edit brand'}</h2>
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
          <label className="form-field__label" htmlFor={`${titleId}-logo`}>
            Logo URL
          </label>
          <input
            id={`${titleId}-logo`}
            className="form-field__input"
            type="url"
            value={logoUrl}
            maxLength={500}
            disabled={saving}
            aria-invalid={errors.logoUrl != null ? true : undefined}
            onChange={(event) => {
              setLogoUrl(event.target.value)
              if (errors.logoUrl != null) setErrors((current) => ({ ...current, logoUrl: undefined }))
            }}
          />
          {errors.logoUrl == null ? null : <p className="form-field__error">{errors.logoUrl}</p>}
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
              'Create brand'
            ) : (
              'Save changes'
            )}
          </button>
        </div>
      </form>
    </dialog>
  )
}

export default function AdminBrandsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const searchKey = useMemo(() => searchParams.toString(), [searchParams])
  const state = useMemo(() => parseAdminBrandsSearch(new URLSearchParams(searchKey)), [searchKey])

  const [queryInput, setQueryInput] = useState(state.search)
  const debouncedQuery = useDebouncedValue(queryInput)
  const ackedQuery = useRef(state.search)

  const [result, setResult] = useState<AdminPage<AdminBrandListRow> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const [formOpen, setFormOpen] = useState(false)
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create')
  const [formInitial, setFormInitial] = useState<BrandRow | null>(null)
  const [formSaving, setFormSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const [activationTarget, setActivationTarget] = useState<BrandRow | null>(null)
  const [activationKind, setActivationKind] = useState<'deactivate' | 'reactivate'>('deactivate')
  const [activationLoading, setActivationLoading] = useState(false)
  const [activationError, setActivationError] = useState<string | null>(null)

  useEffect(() => {
    if (debouncedQuery !== queryInput) return
    if (debouncedQuery === state.search) return
    if (debouncedQuery === ackedQuery.current) return
    ackedQuery.current = debouncedQuery
    setSearchParams(
      serializeAdminBrandsSearch({ ...state, search: debouncedQuery, page: 1 }),
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
    void listAdminBrands(state).then(({ data, error: loadError }) => {
      if (!active) return
      if (loadError != null || data == null) {
        setError('We could not load brands. Please try again.')
        setResult(null)
      } else if (data.totalPages > 0 && state.page > data.totalPages && state.page !== 1) {
        setSearchParams(serializeAdminBrandsSearch({ ...state, page: 1 }), { replace: true })
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

  function openEdit(row: BrandRow) {
    setFormMode('edit')
    setFormInitial(row)
    setFormError(null)
    setFormOpen(true)
  }

  async function handleFormSave(input: AdminBrandInput) {
    setFormSaving(true)
    setFormError(null)
    const saveResult =
      formMode === 'edit' && formInitial != null
        ? await updateBrand({ brandId: formInitial.id, ...input })
        : await createBrand(input)
    setFormSaving(false)
    if (saveResult.error != null) {
      setFormError(saveResult.error.message)
      return
    }
    setFormOpen(false)
    setRefreshKey((key) => key + 1)
  }

  function openActivation(kind: 'deactivate' | 'reactivate', row: BrandRow) {
    setActivationKind(kind)
    setActivationTarget(row)
    setActivationError(null)
  }

  async function handleActivation(reason: string) {
    if (activationTarget == null) return
    setActivationLoading(true)
    setActivationError(null)
    const input: AdminBrandActionInput = { brandId: activationTarget.id, reason }
    const result =
      activationKind === 'deactivate' ? await deactivateBrand(input) : await reactivateBrand(input)
    setActivationLoading(false)
    setActivationTarget(null)
    if (result.error != null) {
      setActivationError(result.error.message)
      return
    }
    setRefreshKey((key) => key + 1)
  }

  function clearFilters() {
    setSearchParams(serializeAdminBrandsSearch({ ...state, search: '', page: 1, isActive: null, sort: 'name_asc' }))
  }

  return (
    <div className="page admin-resource-page">
      <PageHeader
        title="Brands"
        intro="Manage marketplace brand taxonomy and availability."
        actions={
          <button type="button" className="btn btn--primary" onClick={openCreate}>
            Create brand
          </button>
        }
      />

      {activationError != null && <Alert variant="error" message={activationError} />}

      <div className="admin-resource-toolbar">
        <div className="admin-resource-toolbar__row">
          <div className="admin-resource-toolbar__search">
            <input
              type="search"
              placeholder="Search by brand name or slug…"
              value={queryInput}
              onChange={(event) => setQueryInput(event.target.value)}
              aria-label="Search brands"
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
                    serializeAdminBrandsSearch({
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
                  setSearchParams(serializeAdminBrandsSearch({ ...state, sort: event.target.value as AdminBrandSort, page: 1 }))
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
        <LoadingState label="Loading brands…" />
      ) : error != null ? (
        <Alert variant="error" message={error} />
      ) : result != null && result.items.length > 0 ? (
        <>
          <p className="admin-resource-toolbar__count" aria-live="polite">
            Showing {result.items.length} of {result.total} brand{result.total === 1 ? '' : 's'}
          </p>
          <div className="admin-resource-table">
            <table>
              <caption className="visually-hidden">Paddle brands</caption>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Slug</th>
                  <th>Logo</th>
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
                    <td>
                      {row.logo_url ? (
                        <img
                          className="admin-brand-logo"
                          src={row.logo_url}
                          alt=""
                          loading="lazy"
                        />
                      ) : (
                        <span style={{ color: 'var(--color-text-muted)' }}>—</span>
                      )}
                    </td>
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
            onPageChange={(page) => setSearchParams(serializeAdminBrandsSearch({ ...state, page }))}
          />
        </>
      ) : (
        <EmptyState
          title="No brands found"
          body="Try adjusting your search or filters."
          action={
            <button type="button" className="btn btn--primary" onClick={clearFilters}>
              Clear filters
            </button>
          }
        />
      )}

      <BrandFormDialog
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
        title={activationTarget != null ? `${activationKind === 'deactivate' ? 'Deactivate' : 'Reactivate'} brand — ${activationTarget.name}` : ''}
        description="This action requires a reason and takes effect immediately on the catalog."
        confirmLabel={activationKind === 'deactivate' ? 'Deactivate' : 'Reactivate'}
        loading={activationLoading}
        loadingLabel="Working…"
        reasonRequired
        reasonPlaceholder="Explain why this brand status is changing…"
        onCancel={() => setActivationTarget(null)}
        onConfirm={(reason) => void handleActivation(reason)}
      />
    </div>
  )
}