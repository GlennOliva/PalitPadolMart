import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../../features/auth/useAuth'
import {
  closeInquiry,
  getInquiry,
  getInquiryMessages,
  markInquiryRead,
  sendInquiryReply,
} from '../../features/inquiries/inquiries.service'
import { validateInquiryMessage } from '../../features/inquiries/inquiry-validation'
import type {
  InquiryListItem,
  InquiryMessage,
} from '../../features/inquiries/inquiries.types'
import { formatDateTime } from '../../utils/format'
import LoadingState from '../../components/common/LoadingState'
import Alert from '../../components/common/Alert'
import EmptyState from '../../components/common/EmptyState'
import SubmitButton from '../../components/common/SubmitButton'

export default function InquiryDetailPage() {
  const { inquiryId = '' } = useParams()
  const { user } = useAuth()
  const [inquiry, setInquiry] = useState<InquiryListItem | null>(null)
  const [messages, setMessages] = useState<InquiryMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reply, setReply] = useState('')
  const [replyError, setReplyError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [closing, setClosing] = useState(false)

  const load = useCallback(() => {
    if (user == null) return
    setLoading(true)
    setError(null)
    void Promise.all([getInquiry(inquiryId), getInquiryMessages(inquiryId)]).then(
      ([inquiryResult, messagesResult]) => {
        if (inquiryResult.error != null || messagesResult.error != null) {
          setError('We could not load this conversation. Please try again.')
          setInquiry(null)
          setMessages([])
          setLoading(false)
          return
        }
        setInquiry(inquiryResult.data)
        setMessages(messagesResult.data)
        setLoading(false)
        if (inquiryResult.data != null) {
          void markInquiryRead(inquiryId, user.id)
        }
      },
    )
  }, [inquiryId, user])

  useEffect(() => {
    load()
  }, [load])

  if (loading) {
    return <LoadingState label="Loading conversation…" />
  }

  if (error != null) {
    return (
      <div className="container page">
        <Alert variant="error" message={error} />
        <p className="page-note">
          <Link to="/inquiries">Back to inquiries</Link>
        </p>
      </div>
    )
  }

  if (inquiry == null) {
    return (
      <div className="container page">
        <EmptyState
          title="Conversation not found"
          body="This conversation is unavailable or you are not a participant."
          action={
            <Link className="btn btn--primary" to="/inquiries">
              Back to inquiries
            </Link>
          }
        />
      </div>
    )
  }

  const userId = user?.id
  const isBuyer = inquiry.buyer_id === userId
  const counterparty = isBuyer
    ? (inquiry.seller?.store_name ?? 'Seller')
    : (inquiry.buyer_name ?? 'Buyer')
  const isClosed = inquiry.status === 'closed'
  const canReply = !isClosed && userId != null

  const submitReply = () => {
    if (userId == null) return
    const messageError = validateInquiryMessage(reply)
    if (messageError != null) {
      setReplyError(messageError)
      return
    }
    setReplyError(null)
    setSending(true)
    void sendInquiryReply(inquiry.id, reply).then(({ data, error: sendError }) => {
      setSending(false)
      if (sendError != null || data == null) {
        setReplyError('We could not send your message. Please try again.')
        return
      }
      setMessages((current) => [...current, data])
      setReply('')
      // Buyer replies reopen the inquiry; seller replies mark it answered.
      setInquiry((current) =>
        current == null ? current : { ...current, status: isBuyer ? 'open' : 'answered' },
      )
    })
  }

  const closeThread = () => {
    setClosing(true)
    void closeInquiry(inquiry.id).then(({ error: closeError }) => {
      setClosing(false)
      if (closeError != null) return
      setInquiry((current) => (current == null ? current : { ...current, status: 'closed' }))
    })
  }

  return (
    <div className="container page inquiry-thread">
      <p className="page-note">
        <Link to="/inquiries">Back to inquiries</Link>
      </p>

      <div className="inquiry-thread__head">
        <h1 className="page__title">{inquiry.subject}</h1>
        <p className="inquiry-thread__listing">
          {inquiry.listing_title != null ? (
            <>
              About{' '}
              <Link to={`/marketplace/${inquiry.listing_id}`}>{inquiry.listing_title}</Link>
            </>
          ) : (
            'Listing no longer available'
          )}{' '}
          · with {counterparty}
        </p>
      </div>

      <div className="inquiry-thread__messages" role="region" aria-label="Messages">
        <div className="inquiry-thread__message inquiry-thread__message--opening">
          <div className="inquiry-thread__bubble">
            <p>{inquiry.message}</p>
          </div>
          <span className="inquiry-thread__meta">
            {isBuyer ? 'You' : counterparty} · {formatDateTime(inquiry.created_at)}
          </span>
        </div>

        {messages.map((message) => {
          const mine = message.sender_id === userId
          return (
            <div
              key={message.id}
              className={
                mine
                  ? 'inquiry-thread__message inquiry-thread__message--mine'
                  : 'inquiry-thread__message'
              }
            >
              <div className="inquiry-thread__bubble">
                <p>{message.message}</p>
              </div>
              <span className="inquiry-thread__meta">
                {mine ? 'You' : counterparty} · {formatDateTime(message.created_at)}
              </span>
            </div>
          )
        })}
      </div>

      {isClosed ? (
        <Alert variant="info" message="This conversation is closed." />
      ) : (
        <form
          className="inquiry-thread__reply"
          onSubmit={(event) => {
            event.preventDefault()
            submitReply()
          }}
        >
          <div className="form-field">
            <label className="form-field__label" htmlFor="inquiry-reply">
              Your reply
            </label>
            <textarea
              className="form-field__textarea"
              id="inquiry-reply"
              rows={4}
              maxLength={2000}
              value={reply}
              onChange={(event) => {
                setReply(event.target.value)
                if (replyError != null) setReplyError(null)
              }}
              aria-invalid={replyError != null ? true : undefined}
            />
            {replyError != null ? (
              <p className="form-field__error">{replyError}</p>
            ) : (
              <p className="form-field__hint">
                Messages can be up to 2,000 characters.
              </p>
            )}
          </div>
          <div className="inquiry-thread__actions">
            <SubmitButton loading={sending} loadingLabel="Sending…" disabled={!canReply}>
              Send message
            </SubmitButton>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={closeThread}
              disabled={closing}
            >
              {closing ? 'Closing…' : 'Close conversation'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
