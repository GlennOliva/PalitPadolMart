import { useEffect, useRef } from 'react'

export interface InquiryImageLightboxProps {
  url: string
  label: string
  onClose: () => void
  previousFocus: HTMLElement | null
}

/**
 * Accessible fullscreen viewer for a private inquiry image. Managing focus is
 * safe here because the image dialog owns no state of its own: the caller
 * re-renders a fresh signed URL when it is opened, so the displayed object is
 * always authorized at open time.
 */
export default function InquiryImageLightbox({
  url,
  label,
  onClose,
  previousFocus,
}: InquiryImageLightboxProps) {
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const previous = closeRef.current?.ownerDocument.activeElement as HTMLElement | null
    closeRef.current?.focus()

    const lastActive = previous ?? previousFocus
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
        return
      }
      if (event.key === 'Tab' && closeRef.current != null) {
        const frame = closeRef.current.parentElement
        if (frame == null) return
        const focusables = Array.from(
          frame.querySelectorAll<HTMLElement>('button, [href], [tabindex], img[tabindex]'),
        ).filter((node) => node.getAttribute('tabindex') !== '-1')
        if (focusables.length === 0) return
        const first = focusables[0]
        const last = focusables[focusables.length - 1]
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first.focus()
        }
      }
    }

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleKeyDown)
      if (lastActive != null && typeof lastActive.focus === 'function') {
        lastActive.focus()
      }
    }
  }, [onClose, previousFocus])

  return (
    <div className="inquiry-lightbox" role="dialog" aria-modal="true" aria-label={label}>
      <div className="inquiry-lightbox__frame">
        <img className="inquiry-lightbox__image" src={url} alt={label} />
        <button
          type="button"
          ref={closeRef}
          className="inquiry-lightbox__close"
          onClick={onClose}
        >
          Close
        </button>
        <span className="inquiry-lightbox__caption">{label}</span>
      </div>
    </div>
  )
}