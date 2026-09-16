import { useEffect, useId, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent as ReactKeyboardEvent } from 'react'

interface AdminActionDialogProps {
  open: boolean
  title: string
  description?: string
  confirmLabel: string
  cancelLabel?: string
  loading?: boolean
  loadingLabel?: string
  reasonRequired?: boolean
  reasonLabel?: string
  reasonPlaceholder?: string
  maxReasonLength?: number
  onCancel: () => void
  onConfirm: (reason: string) => void
}

export default function AdminActionDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancel',
  loading = false,
  loadingLabel = 'Working...',
  reasonRequired = false,
  reasonLabel = 'Reason',
  reasonPlaceholder,
  maxReasonLength = 500,
  onCancel,
  onConfirm,
}: AdminActionDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const reasonRef = useRef<HTMLTextAreaElement>(null)
  const restoreFocusRef = useRef<HTMLElement | null>(null)
  const wasOpenRef = useRef(false)
  const titleId = useId()
  const descriptionId = useId()
  const reasonId = useId()
  const reasonErrorId = useId()
  const [reason, setReason] = useState('')
  const [reasonError, setReasonError] = useState<string | null>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (dialog == null) return

    if (open && !wasOpenRef.current) {
      restoreFocusRef.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null
      setReason('')
      setReasonError(null)
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
    const normalizedReason = reason.trim()
    if (reasonRequired && normalizedReason.length === 0) {
      setReasonError('Enter a reason for this action.')
      reasonRef.current?.focus()
      return
    }
    setReasonError(null)
    onConfirm(normalizedReason)
  }

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDialogElement>) => {
    if (event.key !== 'Escape') return
    event.preventDefault()
    requestCancel()
  }

  return (
    <dialog
      ref={dialogRef}
      className="admin-action-dialog"
      aria-labelledby={titleId}
      aria-describedby={description == null ? undefined : descriptionId}
      aria-busy={loading || undefined}
      onCancel={(event) => {
        event.preventDefault()
        requestCancel()
      }}
      onKeyDown={handleKeyDown}
    >
      <form className="admin-action-dialog__form" onSubmit={handleSubmit} noValidate>
        <header className="admin-action-dialog__header">
          <p className="admin-action-dialog__eyebrow">Administrative action</p>
          <h2 id={titleId}>{title}</h2>
          {description == null ? null : <p id={descriptionId}>{description}</p>}
        </header>

        <div className="form-field">
          <label className="form-field__label" htmlFor={reasonId}>
            {reasonLabel}
            {reasonRequired ? (
              <span className="form-field__required"> *</span>
            ) : (
              <span className="form-field__optional"> Optional</span>
            )}
          </label>
          <textarea
            ref={reasonRef}
            id={reasonId}
            className="form-field__textarea"
            value={reason}
            placeholder={reasonPlaceholder}
            maxLength={maxReasonLength}
            required={reasonRequired}
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

        <div className="admin-action-dialog__actions">
          <button type="button" className="btn btn--ghost" disabled={loading} onClick={requestCancel}>
            {cancelLabel}
          </button>
          <button type="submit" className="btn btn--primary" disabled={loading}>
            {loading ? (
              <>
                <span className="spinner spinner--sm" aria-hidden="true" />
                {loadingLabel}
              </>
            ) : (
              confirmLabel
            )}
          </button>
        </div>
      </form>
    </dialog>
  )
}
