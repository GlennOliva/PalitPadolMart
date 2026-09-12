import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../features/auth/useAuth'
import { submitListingReport } from '../../features/reports/reports.service'
import {
  hasListingReportErrors,
  isListingReportReason,
  LISTING_REPORT_REASON_LABELS,
  LISTING_REPORT_REASONS,
  MAX_REPORT_DESCRIPTION_LENGTH,
  validateListingReportInput,
} from '../../features/reports/reports.types'
import type {
  ListingReportFieldErrors,
  ListingReportReason,
} from '../../features/reports/reports.types'
import Alert from '../common/Alert'
import SubmitButton from '../common/SubmitButton'

interface ListingReportDialogProps {
  listingId: string
  listingTitle: string
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export default function ListingReportDialog({
  listingId,
  listingTitle,
}: ListingReportDialogProps) {
  const { isAuthenticated } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const dialogRef = useRef<HTMLDivElement>(null)
  const reasonRef = useRef<HTMLSelectElement>(null)
  const restoreFocusRef = useRef<HTMLElement | null>(null)
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [description, setDescription] = useState('')
  const [fieldErrors, setFieldErrors] = useState<ListingReportFieldErrors>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const close = useCallback(() => {
    setOpen(false)
    window.setTimeout(() => restoreFocusRef.current?.focus(), 0)
  }, [])

  useEffect(() => {
    if (!open) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.requestAnimationFrame(() => reasonRef.current?.focus())

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        close()
        return
      }
      if (event.key !== 'Tab' || dialogRef.current == null) return
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      )
      if (focusable.length === 0) {
        event.preventDefault()
        dialogRef.current.focus()
        return
      }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [close, open])

  const handleOpen = (trigger: HTMLButtonElement) => {
    if (!isAuthenticated) {
      navigate('/login', { state: { from: location } })
      return
    }
    restoreFocusRef.current = trigger
    setReason('')
    setDescription('')
    setFieldErrors({})
    setSubmitError(null)
    setSuccess(false)
    setOpen(true)
  }

  return (
    <>
      <button
        type="button"
        className="report-listing-trigger"
        onClick={(event) => handleOpen(event.currentTarget)}
      >
        Report listing
      </button>

      {open ? (
        <div
          className="modal-backdrop report-dialog__backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) close()
          }}
        >
          <div
            ref={dialogRef}
            className="modal glass glass--strong report-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="report-dialog-title"
            aria-describedby="report-dialog-intro"
            tabIndex={-1}
          >
            <div className="report-dialog__header">
              <div>
                <p className="report-dialog__eyebrow">Marketplace safety</p>
                <h2 id="report-dialog-title">Report listing</h2>
              </div>
              <button
                type="button"
                className="report-dialog__close"
                aria-label="Close report listing dialog"
                onClick={close}
              >
                x
              </button>
            </div>

            {success ? (
              <div className="report-dialog__success">
                <Alert variant="success" message="Thanks for reporting this listing." />
                <button type="button" className="btn btn--primary" onClick={close}>
                  Close
                </button>
              </div>
            ) : (
              <form
                className="report-dialog__form"
                onSubmit={(event) => {
                  event.preventDefault()
                  const errors = validateListingReportInput({ reason, description })
                  setFieldErrors(errors)
                  setSubmitError(null)
                  if (hasListingReportErrors(errors) || !isListingReportReason(reason)) return
                  setSubmitting(true)
                  void submitListingReport({
                    listingId,
                    reason,
                    description,
                  })
                    .then(({ error }) => {
                      if (error != null) {
                        setSubmitError(error.message)
                        return
                      }
                      setSuccess(true)
                    })
                    .catch(() => setSubmitError('We could not submit this report. Please try again.'))
                    .finally(() => setSubmitting(false))
                }}
              >
                <p id="report-dialog-intro" className="report-dialog__intro">
                  Tell us what seems wrong with <strong>{listingTitle}</strong>. Reports are
                  reviewed privately.
                </p>

                <div className="form-field">
                  <label className="form-field__label" htmlFor="listing-report-reason">
                    Reason<span className="form-field__required"> *</span>
                  </label>
                  <select
                    ref={reasonRef}
                    id="listing-report-reason"
                    className="form-field__input"
                    value={reason}
                    required
                    aria-invalid={fieldErrors.reason != null ? true : undefined}
                    aria-describedby={fieldErrors.reason != null ? 'listing-report-reason-error' : undefined}
                    onChange={(event) => setReason(event.target.value as ListingReportReason | '')}
                  >
                    <option value="">Choose a reason</option>
                    {LISTING_REPORT_REASONS.map((value) => (
                      <option key={value} value={value}>
                        {LISTING_REPORT_REASON_LABELS[value]}
                      </option>
                    ))}
                  </select>
                  {fieldErrors.reason != null ? (
                    <p className="form-field__error" id="listing-report-reason-error">
                      {fieldErrors.reason}
                    </p>
                  ) : null}
                </div>

                <div className="form-field">
                  <label className="form-field__label" htmlFor="listing-report-description">
                    Details <span className="form-field__optional">Optional</span>
                  </label>
                  <textarea
                    id="listing-report-description"
                    className="form-field__textarea"
                    rows={5}
                    maxLength={MAX_REPORT_DESCRIPTION_LENGTH}
                    value={description}
                    aria-invalid={fieldErrors.description != null ? true : undefined}
                    aria-describedby="listing-report-description-help"
                    onChange={(event) => setDescription(event.target.value)}
                  />
                  <p
                    id="listing-report-description-help"
                    className={fieldErrors.description == null ? 'form-field__hint' : 'form-field__error'}
                  >
                    {fieldErrors.description ?? `${description.length}/${MAX_REPORT_DESCRIPTION_LENGTH} characters`}
                  </p>
                </div>

                {submitError != null ? <Alert variant="error" message={submitError} /> : null}

                <div className="report-dialog__actions">
                  <SubmitButton loading={submitting} loadingLabel="Submitting...">
                    Submit report
                  </SubmitButton>
                  <button
                    type="button"
                    className="btn btn--ghost"
                    disabled={submitting}
                    onClick={close}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      ) : null}
    </>
  )
}
