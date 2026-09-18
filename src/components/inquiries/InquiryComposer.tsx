import { useEffect, useRef, useState } from 'react'
import { validateInquiryMessageWithAttachments } from '../../features/inquiries/inquiry-validation'
import {
  INQUIRY_IMAGE_ACCEPT,
  MAX_INQUIRY_IMAGE_COUNT,
  validateInquiryImageFiles,
} from '../../features/inquiries/inquiry-attachments'
import type { PendingInquiryImage } from '../../features/inquiries/inquiries.types'

interface InquiryComposerProps {
  disabled?: boolean
  placeholder?: string
  onSubmit: (
    message: string,
    files: File[],
    setStatus: (status: string) => void,
  ) => Promise<string | null>
}

let pendingSequence = 0

/**
 * The inquiry chat composer. It owns client-side image selection (object-URL
 * previews, remove-before-send, friendly validation) and the sending state.
 * The parent implements `onSubmit` which uploads pending files, calls the
 * trusted RPC, and returns a friendly error (null on success). The composer
 * never sends anything when neither text nor an image is pending, matches the
 * server-side "text and/or attachments" rule.
 */
export default function InquiryComposer({
  disabled = false,
  placeholder = 'Type your message...',
  onSubmit,
}: InquiryComposerProps) {
  const [message, setMessage] = useState('')
  const [pending, setPending] = useState<PendingInquiryImage[]>([])
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [status, setStatus] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const urls = pending.map((image) => image.previewUrl)
    return () => {
      for (const url of urls) URL.revokeObjectURL(url)
    }
  }, [pending])

  const selectFiles = (files: FileList | File[]) => {
    const incoming = Array.from(files)
    if (incoming.length === 0) return
    const validation = validateInquiryImageFiles(incoming)
    if (validation.error != null) {
      setError(validation.error)
      if (fileInputRef.current != null) fileInputRef.current.value = ''
      return
    }
    const next = validation.files.map((file) => ({
      id: `pending-${Date.now()}-${(pendingSequence += 1)}`,
      file,
      previewUrl: URL.createObjectURL(file),
    }))
    setPending((current) => {
      const combined = [...current, ...next]
      return combined.slice(0, MAX_INQUIRY_IMAGE_COUNT)
    })
    setError(null)
    if (fileInputRef.current != null) fileInputRef.current.value = ''
  }

  const removeImage = (id: string) => {
    setPending((current) => {
      const target = current.find((image) => image.id === id)
      if (target != null) URL.revokeObjectURL(target.previewUrl)
      return current.filter((image) => image.id !== id)
    })
    setError(null)
  }

  const submit = async () => {
    const validationError = validateInquiryMessageWithAttachments(message, pending.length)
    if (validationError != null) {
      setError(validationError)
      return
    }
    const files = pending.map((image) => image.file)
    setError(null)
    setSending(true)
    setStatus(
      files.length > 0
        ? `Uploading ${files.length} of ${files.length}…`
        : 'Sending…',
    )
    const result = await onSubmit(message.trim(), files, setStatus)
    if (result != null) {
      setSending(false)
      setStatus('')
      setError(result)
      return
    }
    for (const image of pending) URL.revokeObjectURL(image.previewUrl)
    setPending([])
    setMessage('')
    setSending(false)
    setStatus('')
  }

  return (
    <form
      className="inquiry-composer"
      aria-label="Compose a message"
      onSubmit={(event) => {
        event.preventDefault()
        if (!sending && !disabled) void submit()
      }}
    >
      {pending.length > 0 && (
        <ul className="inquiry-composer__previews" aria-label="Images to attach">
          {pending.map((image) => (
            <li key={image.id} className="inquiry-composer__preview">
              <img src={image.previewUrl} alt="Preview" />
              <span className="inquiry-composer__preview-name" title={image.file.name}>
                {image.file.name}
              </span>
              <button
                type="button"
                className="inquiry-composer__preview-remove"
                aria-label={`Remove ${image.file.name}`}
                disabled={sending || disabled}
                onClick={() => removeImage(image.id)}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="inquiry-composer__row">
        <div className="form-field inquiry-composer__textarea">
          <label className="form-field__label" htmlFor="inquiry-reply">
            Your reply
          </label>
          <textarea
            className="form-field__textarea"
            id="inquiry-reply"
            rows={3}
            maxLength={2000}
            placeholder={placeholder}
            value={message}
            disabled={sending || disabled}
            onChange={(event) => {
              setMessage(event.target.value)
              if (error != null) setError(null)
            }}
            aria-invalid={error != null ? true : undefined}
          />
        </div>
        <div className="inquiry-composer__controls">
          <input
            ref={fileInputRef}
            type="file"
            accept={INQUIRY_IMAGE_ACCEPT}
            multiple
            className="visually-hidden"
            aria-hidden="true"
            tabIndex={-1}
            disabled={sending || disabled}
            onChange={(event) => selectFiles(event.target.files ?? [])}
          />
          <button
            type="button"
            className="btn btn--ghost btn--sm inquiry-composer__attach"
            disabled={sending || disabled || pending.length >= MAX_INQUIRY_IMAGE_COUNT}
            onClick={() => fileInputRef.current?.click()}
          >
            Attach Image
          </button>
          <button
            type="submit"
            className="btn btn--primary btn--sm"
            disabled={sending || disabled}
            aria-busy={sending}
          >
            {sending ? status || 'Sending…' : 'Send message'}
          </button>
        </div>
      </div>

      {sending ? (
        <p className="inquiry-composer__status" aria-live="polite">
          {status || 'Sending…'}
        </p>
      ) : (
        error != null && (
          <p className="inquiry-composer__error" role="alert">
            {error}
          </p>
        )
      )}

      {!sending && error == null && (
        <p className="form-field__hint">
          {pending.length > 0
            ? `Up to ${MAX_INQUIRY_IMAGE_COUNT} images per message, 5 MB each. Only JPG, PNG, and WebP are supported.`
            : 'Messages can be up to 2,000 characters.'}
        </p>
      )}
    </form>
  )
}