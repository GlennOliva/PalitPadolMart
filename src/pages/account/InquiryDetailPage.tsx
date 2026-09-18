import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../../features/auth/useAuth'
import {
  closeInquiry,
  getInquiry,
  getInquiryMessages,
  markInquiryRead,
  sendInquiryReply,
} from '../../features/inquiries/inquiries.service'
import {
  getInquiryAttachments,
  removeInquiryUploads,
  uploadInquiryImage,
} from '../../features/inquiries/inquiry-attachments.service'
import type {
  InquiryAttachmentInput,
  InquiryListItem,
  InquiryMessage,
  InquiryMessageAttachment,
} from '../../features/inquiries/inquiries.types'
import { formatDateTime } from '../../utils/format'
import LoadingState from '../../components/common/LoadingState'
import Alert from '../../components/common/Alert'
import EmptyState from '../../components/common/EmptyState'
import InquiryComposer from '../../components/inquiries/InquiryComposer'
import InquiryAttachmentImage from '../../components/inquiries/InquiryAttachmentImage'
import InquiryImageLightbox from '../../components/inquiries/InquiryImageLightbox'

export default function InquiryDetailPage() {
  const { inquiryId = '' } = useParams()
  const { user } = useAuth()
  const [inquiry, setInquiry] = useState<InquiryListItem | null>(null)
  const [messages, setMessages] = useState<InquiryMessage[]>([])
  const [attachments, setAttachments] = useState<InquiryMessageAttachment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [closing, setClosing] = useState(false)
  const [lightbox, setLightbox] = useState<{ url: string; label: string } | null>(null)

  const refreshAttachments = useCallback(
    (inquiryToLoad: string) => {
      void getInquiryAttachments(inquiryToLoad).then(({ error: aError, data: aData }) => {
        if (aError == null && aData != null) setAttachments(aData)
      })
    },
    [],
  )

  const refresh = useCallback(
    (inquiryToLoad: string, currentUserId: string, markRead: boolean) => {
      void Promise.all([
        getInquiry(inquiryToLoad),
        getInquiryMessages(inquiryToLoad),
        getInquiryAttachments(inquiryToLoad),
      ]).then(([inquiryResult, messagesResult, attachmentsResult]) => {
        if (
          inquiryResult.error != null ||
          messagesResult.error != null ||
          attachmentsResult.error != null
        ) {
          setError('We could not load this conversation. Please try again.')
          setInquiry(null)
          setMessages([])
          setAttachments([])
          setLoading(false)
          return
        }
        setInquiry(inquiryResult.data)
        setMessages(messagesResult.data)
        setAttachments(attachmentsResult.data)
        setLoading(false)
        if (markRead && inquiryResult.data != null) {
          void markInquiryRead(inquiryId, currentUserId)
        }
      })
    },
    [inquiryId],
  )

  const load = useCallback(() => {
    if (user == null) return
    setLoading(true)
    setError(null)
    refresh(inquiryId, user.id, true)
  }, [inquiryId, refresh, user])

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

  const closeThread = () => {
    setClosing(true)
    void closeInquiry(inquiry.id).then(({ error: closeError }) => {
      setClosing(false)
      if (closeError != null) return
      setInquiry((current) => (current == null ? current : { ...current, status: 'closed' }))
    })
  }

  const composer = canReply ? (
    <InquiryComposer
      placeholder="Type your message... (attach a photo to show the condition)"
      onSubmit={async (message, files, setStatus) => {
        const uploadedPaths: string[] = []
        try {
          for (let index = 0; index < files.length; index += 1) {
            setStatus(`Uploading ${index + 1} of ${files.length}…`)
            const upload = await uploadInquiryImage(files[index], inquiry.id, userId)
            if (upload.path == null) {
              await removeInquiryUploads(uploadedPaths)
              return upload.error ?? 'Upload failed. Please try again.'
            }
            uploadedPaths.push(upload.path)
          }
          setStatus(files.length > 0 ? 'Sending message…' : 'Sending…')
          const metadata: InquiryAttachmentInput[] = files.map((file, index) => ({
            storage_path: uploadedPaths[index],
            file_name: file.name || null,
            mime_type: file.type,
            file_size: file.size,
          }))
          const { data, error: sendError } = await sendInquiryReply(
            inquiry.id,
            message,
            metadata,
          )
          if (sendError != null || data == null) {
            await removeInquiryUploads(uploadedPaths)
            const raw = sendError?.message?.toLowerCase() ?? ''
            if (raw.includes('inquiry is closed')) return 'This conversation is now closed.'
            return 'We could not send your message. Please try again.'
          }
          setMessages((current) => [...current, data])
          if (userId != null) void refreshAttachments(inquiry.id)
          setInquiry((current) =>
            current == null ? current : { ...current, status: isBuyer ? 'open' : 'answered' },
          )
          return null
        } finally {
          // Orphaned uploads are cleaned up at each failure point above; the
          // composer resets its pending image states itself on success.
        }
      }}
    />
  ) : null

  return (
    <>
      <ConversationShell
        inquiry={inquiry}
        isBuyer={isBuyer}
        counterparty={counterparty}
        userId={userId ?? ''}
        isClosed={isClosed}
        messages={messages}
        attachments={attachments}
        closing={closing}
        showClose={canReply}
        onClose={closeThread}
        onLightbox={(url, label) => setLightbox({ url, label })}
        shownLink="/inquiries"
      >
        {composer}
      </ConversationShell>

      {lightbox != null && (
        <InquiryImageLightbox
          url={lightbox.url}
          label={lightbox.label}
          previousFocus={null}
          onClose={() => setLightbox(null)}
        />
      )}
    </>
  )
}

interface ConversationShellProps {
  inquiry: InquiryListItem
  isBuyer: boolean
  counterparty: string
  userId: string
  isClosed: boolean
  messages: InquiryMessage[]
  attachments: InquiryMessageAttachment[]
  closing: boolean
  showClose: boolean
  onClose: () => void
  onLightbox: (url: string, label: string) => void
  shownLink: string
  children?: ReactNode
}

function ConversationShell({
  inquiry,
  isBuyer,
  counterparty,
  userId,
  isClosed,
  messages,
  attachments,
  closing,
  showClose,
  onClose,
  onLightbox,
  shownLink,
  children,
}: ConversationShellProps) {
  const messageAttachments = useMemo(() => {
    const map = new Map<string, InquiryMessageAttachment[]>()
    for (const attachment of attachments) {
      const list = map.get(attachment.message_id) ?? []
      list.push(attachment)
      map.set(attachment.message_id, list)
    }
    return map
  }, [attachments])

  return (
    <div className="container page inquiry-thread">
      <p className="page-note">
        <Link to={shownLink}>Back to inquiries</Link>
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
          const messageImages = messageAttachments.get(message.id) ?? []
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
                {message.message.trim().length > 0 && <p>{message.message}</p>}
                {messageImages.length > 0 && (
                  <div className="inquiry-thread__attachments">
                    {messageImages.map((attachment) => (
                      <InquiryAttachmentImage
                        key={attachment.id}
                        attachment={attachment}
                        onOpen={onLightbox}
                      />
                    ))}
                  </div>
                )}
              </div>
              <span className="inquiry-thread__meta">
                {mine ? 'You' : counterparty} · {formatDateTime(message.created_at)}
              </span>
            </div>
          )
        })}
      </div>

      {isClosed && <Alert variant="info" message="This conversation is closed." />}

      {children}

      {showClose && (
        <div className="inquiry-thread__actions">
          <button type="button" className="btn btn--ghost" onClick={onClose} disabled={closing}>
            {closing ? 'Closing…' : 'Close conversation'}
          </button>
        </div>
      )}
    </div>
  )
}