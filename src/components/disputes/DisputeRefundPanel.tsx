import { useState } from 'react'
import {
  approveRefund,
  completeRefund,
  rejectRefund,
  requestRefund,
} from '../../features/disputes/disputes.service'
import type {
  DisputeDetail,
  RefundMethod,
  RefundStatus,
} from '../../features/disputes/disputes.types'
import {
  MAX_REFUND_NOTES_LENGTH,
  MAX_REFUND_REASON_LENGTH,
  MAX_REFUND_REFERENCE_LENGTH,
  MAX_REFUND_REJECTION_REASON_LENGTH,
  validateRefundCompletion,
  validateRefundRejection,
  validateRefundRequest,
} from '../../features/disputes/disputes-validation'
import type {
  RefundCompletionFieldErrors,
  RefundRejectionFieldErrors,
  RefundRequestFieldErrors,
} from '../../features/disputes/disputes-validation'
import { formatCurrency, formatDateTime } from '../../utils/format'
import Alert from '../common/Alert'
import Badge from '../common/Badge'
import SubmitButton from '../common/SubmitButton'

interface DisputeRefundPanelProps {
  dispute: DisputeDetail
  view: 'buyer' | 'seller'
  active: boolean
  onUpdated: () => void
}

const REFUND_METHODS: { value: RefundMethod; label: string }[] = [
  { value: 'original_method', label: 'Original method' },
  { value: 'manual_transfer', label: 'Manual transfer' },
  { value: 'cash_return', label: 'Cash return' },
  { value: 'other', label: 'Other' },
]

function statusLabel(status: string): string {
  return status.replaceAll('_', ' ').replace(/^./, (letter) => letter.toUpperCase())
}

function refundBadge(status: RefundStatus): 'pending' | 'approved' | 'rejected' | 'completed' {
  return status === 'requested' ? 'pending' : status
}

export default function DisputeRefundPanel({
  dispute,
  view,
  active,
  onUpdated,
}: DisputeRefundPanelProps) {
  const refund = dispute.refund
  const [requestReason, setRequestReason] = useState('')
  const [requestErrors, setRequestErrors] = useState<RefundRequestFieldErrors>({})
  const [reviewMode, setReviewMode] = useState<'approve' | 'reject' | null>(null)
  const [rejectionReason, setRejectionReason] = useState('')
  const [rejectionErrors, setRejectionErrors] = useState<RefundRejectionFieldErrors>({})
  const [method, setMethod] = useState<RefundMethod>('original_method')
  const [reference, setReference] = useState('')
  const [notes, setNotes] = useState('')
  const [completionErrors, setCompletionErrors] = useState<RefundCompletionFieldErrors>({})
  const [confirmCompletion, setConfirmCompletion] = useState(false)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const runAction = async (action: () => Promise<{ error: { message: string } | null }>) => {
    setBusy(true)
    setActionError(null)
    try {
      const result = await action()
      if (result.error != null) {
        setActionError(result.error.message)
        return
      }
      setReviewMode(null)
      setConfirmCompletion(false)
      onUpdated()
    } catch {
      setActionError('We could not update this refund. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  const buyerCanRequest =
    view === 'buyer' && active && dispute.order.payment_status === 'paid' && refund == null

  return (
    <section className="dispute-section dispute-refund" aria-labelledby="dispute-refund-title">
      <div className="dispute-section__heading">
        <div>
          <p className="dispute-section__eyebrow">Full-order only</p>
          <h2 id="dispute-refund-title">Refund</h2>
        </div>
        {refund != null ? (
          <Badge variant={refundBadge(refund.status)}>{statusLabel(refund.status)}</Badge>
        ) : null}
      </div>

      {refund == null && !buyerCanRequest ? (
        <p className="dispute-empty-copy">
          {view === 'buyer'
            ? 'A refund can be requested here while an eligible paid-order dispute is active.'
            : 'The buyer has not requested a refund.'}
        </p>
      ) : null}

      {refund != null ? (
        <>
          <dl className="dispute-facts">
            <div><dt>Amount</dt><dd>{formatCurrency(refund.amount)}</dd></div>
            <div><dt>Status</dt><dd>{statusLabel(refund.status)}</dd></div>
            <div><dt>Requested</dt><dd>{formatDateTime(refund.requested_at)}</dd></div>
            <div className="dispute-facts__wide"><dt>Reason</dt><dd>{refund.reason}</dd></div>
            {refund.review_reason != null ? (
              <div className="dispute-facts__wide"><dt>Seller review</dt><dd>{refund.review_reason}</dd></div>
            ) : null}
            {refund.method != null ? (
              <div><dt>Method</dt><dd>{statusLabel(refund.method)}</dd></div>
            ) : null}
            {refund.reference != null ? (
              <div><dt>Reference</dt><dd>{refund.reference}</dd></div>
            ) : null}
            {refund.completed_at != null ? (
              <div><dt>Completed</dt><dd>{formatDateTime(refund.completed_at)}</dd></div>
            ) : null}
            {refund.notes != null ? (
              <div className="dispute-facts__wide"><dt>Notes</dt><dd>{refund.notes}</dd></div>
            ) : null}
          </dl>
          {refund.events.length > 0 ? (
            <div className="dispute-refund__history">
              <h3>Refund history</h3>
              <ol>
                {refund.events.map((event) => (
                  <li key={event.id}>
                    <strong>{statusLabel(event.to_status)}</strong>
                    <span>{formatDateTime(event.created_at)}</span>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
        </>
      ) : null}

      {buyerCanRequest ? (
        <form
          className="dispute-form dispute-refund__form"
          onSubmit={(event) => {
            event.preventDefault()
            const errors = validateRefundRequest({ reason: requestReason })
            setRequestErrors(errors)
            if (errors.reason != null) return
            void runAction(() => requestRefund({
              disputeId: dispute.id,
              requestedAmount: dispute.order.total,
              reason: requestReason,
            }))
          }}
        >
          <div className="dispute-refund__amount">
            <span>Requested amount</span>
            <strong>{formatCurrency(dispute.order.total)}</strong>
          </div>
          <p className="dispute-refund__notice">
            Refund requests are subject to seller review. No automatic transfer occurs.
          </p>
          <div className="form-field">
            <label className="form-field__label" htmlFor="refund-request-reason">
              Refund reason<span className="form-field__required"> *</span>
            </label>
            <textarea
              id="refund-request-reason"
              className="form-field__textarea"
              rows={4}
              required
              maxLength={MAX_REFUND_REASON_LENGTH}
              value={requestReason}
              aria-invalid={requestErrors.reason != null ? true : undefined}
              aria-describedby={requestErrors.reason != null ? 'refund-request-reason-error' : undefined}
              onChange={(event) => setRequestReason(event.target.value)}
            />
            {requestErrors.reason != null ? (
              <p id="refund-request-reason-error" className="form-field__error">{requestErrors.reason}</p>
            ) : null}
          </div>
          <div className="dispute-form__actions">
            <SubmitButton loading={busy} loadingLabel="Requesting...">Request full refund</SubmitButton>
          </div>
        </form>
      ) : null}

      {view === 'seller' && refund?.status === 'requested' ? (
        <div className="dispute-refund__review">
          {reviewMode == null ? (
            <div className="dispute-form__actions">
              <button type="button" className="btn btn--primary" onClick={() => setReviewMode('approve')}>
                Approve refund
              </button>
              <button type="button" className="btn btn--secondary" onClick={() => setReviewMode('reject')}>
                Reject refund
              </button>
            </div>
          ) : reviewMode === 'approve' ? (
            <div className="dispute-confirm" role="group" aria-labelledby="approve-refund-title">
              <h3 id="approve-refund-title">Approve this full refund?</h3>
              <p>
                Approve {formatCurrency(refund.amount)} for order {dispute.order.order_number} to{' '}
                {dispute.buyer_name ?? 'Buyer'}? This approves the request but does not transfer money.
              </p>
              <div className="dispute-form__actions">
                <SubmitButton
                  loading={busy}
                  loadingLabel="Approving..."
                  onClick={() => void runAction(() => approveRefund(refund.id))}
                >
                  Yes, approve refund
                </SubmitButton>
                <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => setReviewMode(null)}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <form
              className="dispute-form dispute-confirm"
              onSubmit={(event) => {
                event.preventDefault()
                const errors = validateRefundRejection(rejectionReason)
                setRejectionErrors(errors)
                if (errors.reason != null) return
                void runAction(() => rejectRefund(refund.id, rejectionReason))
              }}
            >
              <h3>Reject refund request</h3>
              <div className="form-field">
                <label className="form-field__label" htmlFor="refund-rejection-reason">
                  Reason<span className="form-field__required"> *</span>
                </label>
                <textarea
                  id="refund-rejection-reason"
                  className="form-field__textarea"
                  rows={4}
                  required
                  maxLength={MAX_REFUND_REJECTION_REASON_LENGTH}
                  value={rejectionReason}
                  aria-invalid={rejectionErrors.reason != null ? true : undefined}
                  aria-describedby={rejectionErrors.reason != null ? 'refund-rejection-reason-error' : undefined}
                  onChange={(event) => setRejectionReason(event.target.value)}
                />
                {rejectionErrors.reason != null ? (
                  <p id="refund-rejection-reason-error" className="form-field__error">{rejectionErrors.reason}</p>
                ) : null}
              </div>
              <div className="dispute-form__actions">
                <SubmitButton loading={busy} loadingLabel="Rejecting...">Reject refund</SubmitButton>
                <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => setReviewMode(null)}>
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      ) : null}

      {view === 'seller' && refund?.status === 'approved' ? (
        <form
          className="dispute-form dispute-refund__form"
          onSubmit={(event) => {
            event.preventDefault()
            const errors = validateRefundCompletion({ reference, notes })
            setCompletionErrors(errors)
            if (errors.reference != null || errors.notes != null) return
            if (!confirmCompletion) {
              setConfirmCompletion(true)
              return
            }
            void runAction(() => completeRefund({
              refundId: refund.id,
              method,
              reference,
              notes,
            }))
          }}
        >
          <h3>Record manual refund</h3>
          <p className="dispute-refund__notice">
            Record this only after you have returned the funds outside the marketplace.
          </p>
          <div className="form-field">
            <label className="form-field__label" htmlFor="refund-method">Refund method</label>
            <select
              id="refund-method"
              className="form-field__input"
              value={method}
              disabled={confirmCompletion || busy}
              onChange={(event) => setMethod(event.target.value as RefundMethod)}
            >
              {REFUND_METHODS.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label className="form-field__label" htmlFor="refund-reference">
              Reference <span className="form-field__optional">Optional</span>
            </label>
            <input
              id="refund-reference"
              className="form-field__input"
              value={reference}
              maxLength={MAX_REFUND_REFERENCE_LENGTH}
              disabled={confirmCompletion || busy}
              aria-invalid={completionErrors.reference != null ? true : undefined}
              aria-describedby={completionErrors.reference != null ? 'refund-reference-error' : undefined}
              onChange={(event) => setReference(event.target.value)}
            />
            {completionErrors.reference != null ? (
              <p id="refund-reference-error" className="form-field__error">{completionErrors.reference}</p>
            ) : null}
          </div>
          <div className="form-field">
            <label className="form-field__label" htmlFor="refund-notes">
              Notes <span className="form-field__optional">Optional</span>
            </label>
            <textarea
              id="refund-notes"
              className="form-field__textarea"
              rows={3}
              value={notes}
              maxLength={MAX_REFUND_NOTES_LENGTH}
              disabled={confirmCompletion || busy}
              aria-invalid={completionErrors.notes != null ? true : undefined}
              aria-describedby={completionErrors.notes != null ? 'refund-notes-error' : undefined}
              onChange={(event) => setNotes(event.target.value)}
            />
            {completionErrors.notes != null ? (
              <p id="refund-notes-error" className="form-field__error">{completionErrors.notes}</p>
            ) : null}
          </div>
          {confirmCompletion ? (
            <div className="dispute-confirm" role="group" aria-labelledby="complete-refund-title">
              <h4 id="complete-refund-title">Confirm manual refund record</h4>
              <p>
                Confirm that {formatCurrency(refund.amount)} was returned to {dispute.buyer_name ?? 'Buyer'}
                {' '}using {statusLabel(method).toLowerCase()}.
              </p>
              <p>This records completion only. No automatic transfer occurs.</p>
              <div className="dispute-form__actions">
                <SubmitButton loading={busy} loadingLabel="Recording...">Record manual refund</SubmitButton>
                <button
                  type="button"
                  className="btn btn--ghost"
                  disabled={busy}
                  onClick={() => setConfirmCompletion(false)}
                >
                  Go back
                </button>
              </div>
            </div>
          ) : (
            <div className="dispute-form__actions">
              <button type="submit" className="btn btn--primary">Review manual refund</button>
            </div>
          )}
        </form>
      ) : null}

      {actionError != null ? <Alert variant="error" message={actionError} /> : null}
    </section>
  )
}
