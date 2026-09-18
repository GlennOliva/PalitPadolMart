import { useCallback, useEffect, useState } from 'react'
import { inquiryAttachmentUrl } from '../../features/inquiries/inquiry-attachments.service'
import type { InquiryMessageAttachment } from '../../features/inquiries/inquiries.types'

interface InquiryAttachmentImageProps {
  attachment: InquiryMessageAttachment
  onOpen: (url: string, label: string) => void
}

const SIGNED_URL_REFRESH_MS = 60_000 * 4

/**
 * One attached image inside the message bubble. A short-lived (5 minute) signed
 * URL is fetched through Storage RLS — only participants and admins can read.
 * The URL is re-signed before expiry every 4 minutes while the chat stays
 * open, and a failed load shows a controlled error placeholder with Retry
 * instead of breaking the conversation. Clicking opens the lightbox, which
 * re-resolves a fresh signed URL on open.
 */
export default function InquiryAttachmentImage({
  attachment,
  onOpen,
}: InquiryAttachmentImageProps) {
  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  const label =
    attachment.file_name ?? attachment.storage_path.split('/').pop() ?? 'Attachment'

  const resolveUrl = useCallback(async () => {
    setFailed(false)
    const result = await inquiryAttachmentUrl(attachment.storage_path)
    if (result.data != null) {
      setUrl(result.data)
      return true
    }
    setUrl(null)
    setFailed(true)
    return false
  }, [attachment.storage_path])

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null

    const load = async () => {
      let ok = false
      if (!cancelled) ok = await resolveUrl()
      if (cancelled || !ok) return
      timer = setTimeout(() => {
        void load()
      }, SIGNED_URL_REFRESH_MS)
    }
    void load()
    return () => {
      cancelled = true
      if (timer != null) clearTimeout(timer)
    }
  }, [resolveUrl])

  if (url == null && !failed) {
    return (
      <div className="inquiry-thread__image--error" aria-label={label}>
        <span className="spinner" aria-hidden="true" />
        <span>Loading image…</span>
      </div>
    )
  }

  if (failed || url == null) {
    return (
      <div className="inquiry-thread__image--error" role="img" aria-label={label}>
        <span>Unable to load image.</span>
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => void resolveUrl()}>
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className="inquiry-thread__image-wrap">
      <button
        type="button"
        className="inquiry-thread__image-button"
        aria-label={`Open ${label} full size`}
        onClick={() => onOpen(url, label)}
      >
        <img
          className="inquiry-thread__image"
          src={url}
          alt={label}
          loading="lazy"
          onError={() => {
            setUrl(null)
            setFailed(true)
          }}
        />
      </button>
      <span className="inquiry-thread__image-name">{label}</span>
    </div>
  )
}