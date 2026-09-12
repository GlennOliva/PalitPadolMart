import { useState, type FormEvent } from 'react'
import { orderErrorLabel } from '../../features/orders/orders.service'
import { approveOrderPayment, markCashReceived, rejectOrderPayment } from '../../features/orders/payments.service'
import { cashIsCollectable } from '../../features/orders/fulfillment.service'
import { formatPaymentMethod, formatPaymentStatus } from '../../features/orders/order-status'
import { isPaymentMethod } from '../../features/orders/payments.types'
import { validateRejectionReason } from '../../features/orders/payments-validation'
import type { OrderDetail } from '../../features/orders/orders.types'
import { formatCurrency, formatDateTime } from '../../utils/format'
import FormField from '../common/FormField'
import FormError from '../common/FormError'
import SubmitButton from '../common/SubmitButton'
import GlassPanel from '../common/GlassPanel'
import Badge from '../common/Badge'
import Alert from '../common/Alert'
import ProofView from './ProofView'

interface SellerPaymentPanelProps {
  order: OrderDetail
  onUpdated: () => void
}

export default function SellerPaymentPanel({ order, onUpdated }: SellerPaymentPanelProps) {
  const payment = order.payment
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')
  const [reasonError, setReasonError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  async function run(rpc: () => Promise<{ error: { code: string } | null }>) {
    setBusy(true)
    setFormError(null)
    const { error } = await rpc()
    setBusy(false)
    if (error != null) {
      setFormError(orderErrorLabel(error.code ?? 'UNKNOWN'))
      return
    }
    setRejecting(false)
    setReason('')
    onUpdated()
  }

  function handleApprove() {
    if (payment == null) return
    void run(() => approveOrderPayment(payment.id))
  }

  function handleReject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (payment == null) return
    const error = validateRejectionReason(reason)
    if (error != null) {
      setReasonError(error)
      return
    }
    setReasonError(null)
    void run(() => rejectOrderPayment(payment.id, reason))
  }

  function handleCashReceived() {
    if (payment == null) return
    void run(() => markCashReceived(payment.id))
  }

  return (
    <GlassPanel className="order-detail__panel">
      <h2 className="order-detail__section-title">Payment</h2>

      {payment == null ? (
        <p className="order-detail__section-hint">
          The buyer has not submitted payment details yet. You will be notified when they do.
        </p>
      ) : (
        <>
          <div className="order-detail__payment-summary">
            <dl className="order-detail__list">
              <div className="order-detail__row">
                <dt>Status</dt>
                <dd>
                  <Badge variant="neutral">{formatPaymentStatus(payment.status)}</Badge>
                </dd>
              </div>
              <div className="order-detail__row">
                <dt>Method</dt>
                <dd>
                  {isPaymentMethod(payment.payment_method)
                    ? formatPaymentMethod(payment.payment_method)
                    : payment.payment_method}
                </dd>
              </div>
              <div className="order-detail__row">
                <dt>Amount</dt>
                <dd>{formatCurrency(payment.amount)}</dd>
              </div>
              {payment.payment_reference != null ? (
                <div className="order-detail__row">
                  <dt>Reference</dt>
                  <dd>{payment.payment_reference}</dd>
                </div>
              ) : null}
              {payment.paid_at != null ? (
                <div className="order-detail__row">
                  <dt>Paid</dt>
                  <dd>{formatDateTime(payment.paid_at)}</dd>
                </div>
              ) : null}
              {payment.rejection_reason != null ? (
                <div className="order-detail__row">
                  <dt>Rejection reason</dt>
                  <dd>{payment.rejection_reason}</dd>
                </div>
              ) : null}
            </dl>
            <ProofView path={payment.proof_path} />
          </div>

          {payment.status === 'submitted' ? (
            <div className="order-detail__actions order-detail__actions--stacked">
              <div className="order-detail__action-row">
                <SubmitButton loading={busy} loadingLabel="Approving…" onClick={handleApprove}>
                  Approve payment
                </SubmitButton>
                {!rejecting ? (
                  <button
                    type="button"
                    className="btn btn--secondary"
                    disabled={busy}
                    onClick={() => {
                      setRejecting(true)
                      setFormError(null)
                    }}
                  >
                    Reject
                  </button>
                ) : null}
              </div>
              {rejecting ? (
                <form className="order-detail__reject" onSubmit={handleReject} noValidate>
                  <FormField
                    id="rejection-reason"
                    label="Rejection reason"
                    required
                    value={reason}
                    onChange={setReason}
                    error={reasonError}
                    maxLength={500}
                    hint="Tell the buyer what to correct so they can resubmit."
                  />
                  <div className="order-detail__action-row">
                    <SubmitButton loading={busy} loadingLabel="Rejecting…">
                      Confirm rejection
                    </SubmitButton>
                    <button
                      type="button"
                      className="btn btn--ghost"
                      disabled={busy}
                      onClick={() => setRejecting(false)}
                    >
                      Back
                    </button>
                  </div>
                </form>
              ) : null}
            </div>
          ) : null}

          {cashIsCollectable(order) ? (
            <div className="order-detail__actions">
              <Alert
                variant="info"
                message="The buyer is ready for the cash handoff. Record the cash as received once collected."
              />
              <SubmitButton loading={busy} loadingLabel="Recording…" onClick={handleCashReceived}>
                Mark cash received
              </SubmitButton>
            </div>
          ) : null}

          {formError != null ? <FormError message={formError} /> : null}
        </>
      )}
    </GlassPanel>
  )
}
