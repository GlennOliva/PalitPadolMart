import { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { getOrderDispute, openOrderDispute } from '../../features/disputes/disputes.service'
import {
  DISPUTE_REASON_LABELS,
  DISPUTE_REASONS,
  isDisputeReason,
  isOrderDisputable,
} from '../../features/disputes/disputes.types'
import type { DisputeReason, DisputeSummary } from '../../features/disputes/disputes.types'
import {
  MAX_DISPUTE_DESCRIPTION_LENGTH,
  validateOpenDisputeInput,
} from '../../features/disputes/disputes-validation'
import type { OpenDisputeFieldErrors } from '../../features/disputes/disputes-validation'
import { getBuyerOrder } from '../../features/orders/orders.service'
import type { OrderDetail } from '../../features/orders/orders.types'
import { formatCurrency } from '../../utils/format'
import Alert from '../../components/common/Alert'
import EmptyState from '../../components/common/EmptyState'
import GlassPanel from '../../components/common/GlassPanel'
import LoadingState from '../../components/common/LoadingState'
import PageHeader from '../../components/common/PageHeader'
import SubmitButton from '../../components/common/SubmitButton'

function isActive(dispute: DisputeSummary | null): boolean {
  return dispute?.status === 'open' || dispute?.status === 'under_review'
}

export default function OpenOrderDisputePage() {
  const { orderId = '' } = useParams()
  const navigate = useNavigate()
  const [order, setOrder] = useState<OrderDetail | null>(null)
  const [existing, setExisting] = useState<DisputeSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [description, setDescription] = useState('')
  const [fieldErrors, setFieldErrors] = useState<OpenDisputeFieldErrors>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let active = true
    setLoading(true)
    setLoadError(null)
    void Promise.all([getBuyerOrder(orderId), getOrderDispute(orderId)]).then(
      ([orderResult, disputeResult]) => {
        if (!active) return
        if (orderResult.error != null || disputeResult.error != null) {
          setLoadError('We could not load this order for support. Please try again.')
        } else {
          setOrder(orderResult.data)
          setExisting(disputeResult.data)
        }
        setLoading(false)
      },
    )
    return () => {
      active = false
    }
  }, [orderId])

  if (loading) return <LoadingState label="Checking order eligibility..." />

  if (loadError != null) {
    return (
      <div className="container page">
        <Alert variant="error" message={loadError} />
        <p className="page-note"><Link to={`/orders/${orderId}`}>Back to order</Link></p>
      </div>
    )
  }

  if (isActive(existing)) return <Navigate to={`/disputes/${existing?.id ?? ''}`} replace />

  if (order == null) {
    return (
      <div className="container page">
        <EmptyState
          title="Order not found"
          body="This order is unavailable or does not belong to your account."
          action={<Link className="btn btn--primary" to="/orders">Back to my orders</Link>}
        />
      </div>
    )
  }

  if (!isOrderDisputable(order.status)) {
    return (
      <div className="container page dispute-page">
        <PageHeader title="Report a problem" intro={`Order ${order.order_number}`} />
        <EmptyState
          title="This order is not eligible for a dispute"
          body="Disputes can be opened after a seller confirms an order and while the transaction can be reviewed."
          action={<Link className="btn btn--secondary" to={`/orders/${order.id}`}>Back to order</Link>}
        />
      </div>
    )
  }

  return (
    <div className="container page dispute-page">
      <PageHeader
        title="Report a problem"
        intro={`Order ${order.order_number} with ${order.seller?.store_name ?? 'Seller'}`}
      />
      <GlassPanel className="dispute-open-card">
        <div className="dispute-open-card__summary">
          <span>Order total</span>
          <strong>{formatCurrency(order.total)}</strong>
        </div>
        <form
          className="dispute-form"
          onSubmit={(event) => {
            event.preventDefault()
            const errors = validateOpenDisputeInput({ reason, description })
            setFieldErrors(errors)
            setSubmitError(null)
            if (errors.reason != null || errors.description != null || !isDisputeReason(reason)) return
            setSubmitting(true)
            void openOrderDispute({ orderId: order.id, reason, description })
              .then(({ data, error }) => {
                if (error != null || data == null) {
                  setSubmitError(error?.message ?? 'We could not open this dispute. Please try again.')
                  return
                }
                navigate(`/disputes/${data.id}`, { replace: true })
              })
              .catch(() => setSubmitError('We could not open this dispute. Please try again.'))
              .finally(() => setSubmitting(false))
          }}
        >
          <p className="dispute-form__intro">
            Describe the order issue clearly. You can add messages and private evidence after opening the dispute.
          </p>
          <div className="form-field">
            <label className="form-field__label" htmlFor="dispute-reason">
              Reason<span className="form-field__required"> *</span>
            </label>
            <select
              id="dispute-reason"
              className="form-field__input"
              value={reason}
              required
              aria-invalid={fieldErrors.reason != null ? true : undefined}
              aria-describedby={fieldErrors.reason != null ? 'dispute-reason-error' : undefined}
              onChange={(event) => setReason(event.target.value as DisputeReason | '')}
            >
              <option value="">Choose a reason</option>
              {DISPUTE_REASONS.map((value) => (
                <option key={value} value={value}>{DISPUTE_REASON_LABELS[value]}</option>
              ))}
            </select>
            {fieldErrors.reason != null ? (
              <p className="form-field__error" id="dispute-reason-error">{fieldErrors.reason}</p>
            ) : null}
          </div>
          <div className="form-field">
            <label className="form-field__label" htmlFor="dispute-description">
              What happened?<span className="form-field__required"> *</span>
            </label>
            <textarea
              id="dispute-description"
              className="form-field__textarea"
              rows={7}
              required
              maxLength={MAX_DISPUTE_DESCRIPTION_LENGTH}
              value={description}
              aria-invalid={fieldErrors.description != null ? true : undefined}
              aria-describedby="dispute-description-help"
              onChange={(event) => setDescription(event.target.value)}
            />
            <p
              id="dispute-description-help"
              className={fieldErrors.description == null ? 'form-field__hint' : 'form-field__error'}
            >
              {fieldErrors.description ?? `${description.length}/${MAX_DISPUTE_DESCRIPTION_LENGTH} characters`}
            </p>
          </div>
          {submitError != null ? <Alert variant="error" message={submitError} /> : null}
          <div className="dispute-form__actions">
            <SubmitButton loading={submitting} loadingLabel="Opening dispute...">Open dispute</SubmitButton>
            <Link className="btn btn--ghost" to={`/orders/${order.id}`}>Cancel</Link>
          </div>
        </form>
      </GlassPanel>
      <p className="page-note"><Link to={`/orders/${order.id}`}>Back to order</Link></p>
    </div>
  )
}
