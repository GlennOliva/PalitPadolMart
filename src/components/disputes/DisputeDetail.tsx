import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../../features/auth/useAuth'
import {
  closeMyDispute,
  escalateDispute,
  getDisputeDetail,
  sendDisputeMessage,
} from '../../features/disputes/disputes.service'
import { DISPUTE_REASON_LABELS } from '../../features/disputes/disputes.types'
import type { DisputeDetail as DisputeDetailModel } from '../../features/disputes/disputes.types'
import {
  MAX_DISPUTE_MESSAGE_LENGTH,
  validateDisputeMessage,
} from '../../features/disputes/disputes-validation'
import { formatCurrency, formatDateTime } from '../../utils/format'
import Alert from '../common/Alert'
import Badge from '../common/Badge'
import EmptyState from '../common/EmptyState'
import GlassPanel from '../common/GlassPanel'
import LoadingState from '../common/LoadingState'
import SubmitButton from '../common/SubmitButton'
import DisputeEvidencePanel from './DisputeEvidencePanel'
import DisputeRefundPanel from './DisputeRefundPanel'

interface DisputeDetailProps {
  view: 'buyer' | 'seller'
}

function statusLabel(status: string): string {
  return status.replaceAll('_', ' ').replace(/^./, (letter) => letter.toUpperCase())
}

function eventLabel(eventType: string): string {
  const labels: Record<string, string> = {
    opened: 'Dispute opened',
    escalated: 'Dispute escalated for review',
    resolved: 'Dispute resolved',
    closed: 'Dispute closed',
  }
  return labels[eventType] ?? statusLabel(eventType)
}

export default function DisputeDetail({ view }: DisputeDetailProps) {
  const { disputeId = '' } = useParams()
  const { user } = useAuth()
  const [dispute, setDispute] = useState<DisputeDetailModel | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [messageError, setMessageError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [working, setWorking] = useState(false)
  const [confirmAction, setConfirmAction] = useState<'escalate' | 'close' | null>(null)

  const load = useCallback((showLoader = true) => {
    if (showLoader) setLoading(true)
    setLoadError(null)
    void getDisputeDetail(disputeId).then(({ data, error }) => {
      setDispute(data)
      setLoadError(error?.message ?? null)
      setLoading(false)
    })
  }, [disputeId])

  useEffect(() => load(), [load])

  if (loading) return <LoadingState label="Loading dispute..." />

  const backPath = view === 'buyer' ? '/disputes' : '/seller/disputes'
  if (loadError != null) {
    return (
      <div className="container page dispute-page">
        <Alert variant="error" message={loadError} />
        <button type="button" className="btn btn--primary" onClick={() => load()}>Try again</button>
        <p className="page-note"><Link to={backPath}>Back to disputes</Link></p>
      </div>
    )
  }

  if (dispute == null || user == null) {
    return (
      <div className="container page">
        <EmptyState
          title="Dispute not found"
          body="This dispute is unavailable or does not belong to your account."
          action={<Link className="btn btn--primary" to={backPath}>Back to disputes</Link>}
        />
      </div>
    )
  }

  const active = dispute.status === 'open' || dispute.status === 'under_review'
  const canMessage = active
  const canEscalate = dispute.status === 'open'
  const refundBlocksClose = dispute.refund?.status === 'requested' || dispute.refund?.status === 'approved'
  const canClose = view === 'buyer' && active && !refundBlocksClose
  const otherRole = view === 'buyer' ? 'Seller' : 'Buyer'
  const otherName = view === 'buyer'
    ? dispute.seller.store_name ?? 'Seller'
    : dispute.buyer_name ?? 'Buyer'
  const participantLabel = (participantId: string | null) =>
    participantId === user.id ? 'You' : otherRole

  const runDisputeAction = (action: 'escalate' | 'close') => {
    setWorking(true)
    setActionError(null)
    setNotice(null)
    const request = action === 'escalate'
      ? escalateDispute(dispute.id)
      : closeMyDispute(dispute.id)
    void request
      .then(({ error }) => {
        if (error != null) {
          setActionError(error.message)
          return
        }
        setConfirmAction(null)
        setNotice(action === 'escalate' ? 'The dispute is now under review.' : 'The dispute was closed.')
        load(false)
      })
      .catch(() => setActionError('We could not update this dispute. Please try again.'))
      .finally(() => setWorking(false))
  }

  return (
    <div className="container page dispute-page dispute-detail-page">
      <header className="dispute-detail__header">
        <div>
          <p className="dispute-detail__eyebrow">Order {dispute.order.order_number}</p>
          <h1 className="page__title">{DISPUTE_REASON_LABELS[dispute.reason]}</h1>
          <p className="page__intro">
            {view === 'buyer' ? 'Seller' : 'Buyer'}: {otherName} - opened {formatDateTime(dispute.created_at)}
          </p>
        </div>
        <Badge variant={dispute.status}>{statusLabel(dispute.status)}</Badge>
      </header>

      <div className="dispute-detail__layout">
        <main className="dispute-detail__main">
          <GlassPanel className="dispute-section dispute-issue">
            <div className="dispute-section__heading">
              <div>
                <p className="dispute-section__eyebrow">Reported issue</p>
                <h2>What happened</h2>
              </div>
              <Badge variant={dispute.status}>{statusLabel(dispute.status)}</Badge>
            </div>
            <dl className="dispute-facts">
              <div><dt>Reason</dt><dd>{DISPUTE_REASON_LABELS[dispute.reason]}</dd></div>
              <div><dt>Status</dt><dd>{statusLabel(dispute.status)}</dd></div>
              <div className="dispute-facts__wide">
                <dt>Description</dt>
                <dd>{dispute.description ?? 'No description provided.'}</dd>
              </div>
              {dispute.resolution != null ? (
                <div className="dispute-facts__wide">
                  <dt>Resolution</dt>
                  <dd>{dispute.resolution}</dd>
                </div>
              ) : null}
              {dispute.resolved_at != null ? (
                <div><dt>Resolved</dt><dd>{formatDateTime(dispute.resolved_at)}</dd></div>
              ) : null}
            </dl>
          </GlassPanel>

          <GlassPanel className="dispute-section">
            <div className="dispute-section__heading">
              <div>
                <p className="dispute-section__eyebrow">Participant conversation</p>
                <h2 id="dispute-conversation-title">Conversation</h2>
              </div>
            </div>
            {dispute.messages.length === 0 ? (
              <p className="dispute-empty-copy">No messages yet.</p>
            ) : (
              <ol className="dispute-conversation" aria-labelledby="dispute-conversation-title">
                {dispute.messages.map((item) => {
                  const mine = item.sender.id === user.id
                  return (
                    <li key={item.id} className={mine ? 'dispute-message dispute-message--mine' : 'dispute-message'}>
                      <div className="dispute-message__meta">
                        <strong>{participantLabel(item.sender.id)}</strong>
                        <span>{mine ? view === 'buyer' ? 'Buyer' : 'Seller' : otherRole}</span>
                        <time dateTime={item.created_at}>{formatDateTime(item.created_at)}</time>
                      </div>
                      <p>{item.message}</p>
                    </li>
                  )
                })}
              </ol>
            )}
            {canMessage ? (
              <form
                className="dispute-message-form"
                onSubmit={(event) => {
                  event.preventDefault()
                  const validation = validateDisputeMessage(message)
                  setMessageError(validation.message ?? null)
                  setActionError(null)
                  if (validation.message != null) return
                  setSending(true)
                  void sendDisputeMessage(dispute.id, message)
                    .then(({ error }) => {
                      if (error != null) {
                        setActionError(error.message)
                        return
                      }
                      setMessage('')
                      setMessageError(null)
                      load(false)
                    })
                    .catch(() => setActionError('We could not send your message. Please try again.'))
                    .finally(() => setSending(false))
                }}
              >
                <div className="form-field">
                  <label className="form-field__label" htmlFor="dispute-message">
                    Add a message<span className="form-field__required"> *</span>
                  </label>
                  <textarea
                    id="dispute-message"
                    className="form-field__textarea"
                    rows={4}
                    required
                    maxLength={MAX_DISPUTE_MESSAGE_LENGTH}
                    value={message}
                    aria-invalid={messageError != null ? true : undefined}
                    aria-describedby="dispute-message-help"
                    onChange={(event) => setMessage(event.target.value)}
                  />
                  <p
                    id="dispute-message-help"
                    className={messageError == null ? 'form-field__hint' : 'form-field__error'}
                  >
                    {messageError ?? `${message.length}/${MAX_DISPUTE_MESSAGE_LENGTH} characters`}
                  </p>
                </div>
                <div className="dispute-form__actions">
                  <SubmitButton loading={sending} loadingLabel="Sending...">Send message</SubmitButton>
                </div>
              </form>
            ) : (
              <p className="dispute-closed-note">This conversation is read-only because the dispute is closed.</p>
            )}
          </GlassPanel>

          <GlassPanel className="dispute-section">
            <DisputeEvidencePanel
              disputeId={dispute.id}
              evidence={dispute.evidence}
              userId={user.id}
              view={view}
              active={active}
              onUpdated={() => load(false)}
            />
          </GlassPanel>

          <GlassPanel className="dispute-section">
            <DisputeRefundPanel dispute={dispute} view={view} active={active} onUpdated={() => load(false)} />
          </GlassPanel>
        </main>

        <aside className="dispute-detail__aside" aria-label="Dispute context">
          <GlassPanel intensity="soft" className="dispute-section dispute-order-summary">
            <p className="dispute-section__eyebrow">Order summary</p>
            <h2>{dispute.order.order_number}</h2>
            <ul>
              {dispute.order.items.map((item) => (
                <li key={item.id}>
                  <span>{item.product_title}</span>
                  <span>{item.quantity} x {formatCurrency(item.unit_price)}</span>
                </li>
              ))}
            </ul>
            <dl>
              <div><dt>Order status</dt><dd>{statusLabel(dispute.order.status)}</dd></div>
              <div><dt>Payment status</dt><dd>{dispute.order.payment_status == null ? 'Not recorded' : statusLabel(dispute.order.payment_status)}</dd></div>
              <div><dt>Total</dt><dd>{formatCurrency(dispute.order.total)}</dd></div>
            </dl>
            <Link
              className="btn btn--secondary btn--sm"
              to={view === 'buyer' ? `/orders/${dispute.order.id}` : `/seller/orders/${dispute.order.id}`}
            >
              View order
            </Link>
          </GlassPanel>

          <GlassPanel intensity="soft" className="dispute-section dispute-timeline-panel">
            <p className="dispute-section__eyebrow">History</p>
            <h2 id="dispute-timeline-title">Timeline</h2>
            <ol className="dispute-timeline" aria-labelledby="dispute-timeline-title">
              {dispute.events.length === 0 ? (
                <li>
                  <strong>Dispute opened</strong>
                  <time dateTime={dispute.created_at}>{formatDateTime(dispute.created_at)}</time>
                </li>
              ) : dispute.events.map((event) => (
                <li key={event.id}>
                  <strong>{eventLabel(event.event_type)}</strong>
                  <span>Status: {statusLabel(event.to_status)}</span>
                  <time dateTime={event.created_at}>{formatDateTime(event.created_at)}</time>
                </li>
              ))}
            </ol>
          </GlassPanel>
        </aside>
      </div>

      {actionError != null ? <Alert variant="error" message={actionError} /> : null}
      {notice != null ? <Alert variant="success" message={notice} /> : null}

      {(canEscalate || canClose) ? (
        <section className="dispute-actions" aria-labelledby="dispute-actions-title">
          <div>
            <p className="dispute-section__eyebrow">Case controls</p>
            <h2 id="dispute-actions-title">Dispute actions</h2>
          </div>
          {confirmAction == null ? (
            <div className="dispute-form__actions">
              {canEscalate ? (
                <button type="button" className="btn btn--secondary" onClick={() => setConfirmAction('escalate')}>
                  Escalate for review
                </button>
              ) : null}
              {canClose ? (
                <button type="button" className="btn btn--ghost" onClick={() => setConfirmAction('close')}>
                  Close dispute
                </button>
              ) : null}
            </div>
          ) : (
            <div className="dispute-confirm" role="group" aria-labelledby="dispute-confirm-title">
              <h3 id="dispute-confirm-title">
                {confirmAction === 'escalate' ? 'Escalate this dispute?' : 'Close this dispute?'}
              </h3>
              <p>
                {confirmAction === 'escalate'
                  ? 'This sends the dispute for marketplace review. You can continue to add messages and evidence while it is under review.'
                  : 'Closing ends the active dispute and makes the conversation read-only.'}
              </p>
              <div className="dispute-form__actions">
                <SubmitButton
                  loading={working}
                  loadingLabel="Updating..."
                  onClick={() => runDisputeAction(confirmAction)}
                >
                  {confirmAction === 'escalate' ? 'Yes, escalate dispute' : 'Yes, close dispute'}
                </SubmitButton>
                <button type="button" className="btn btn--ghost" disabled={working} onClick={() => setConfirmAction(null)}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </section>
      ) : refundBlocksClose && view === 'buyer' ? (
        <Alert variant="info" message="Resolve the active refund request before closing this dispute." />
      ) : null}

      <p className="page-note"><Link to={backPath}>Back to disputes</Link></p>
    </div>
  )
}
