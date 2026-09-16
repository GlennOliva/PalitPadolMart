import { useEffect, useId, useRef } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import type { ReactNode } from 'react'

interface AdminDetailDrawerProps {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
}

export default function AdminDetailDrawer({ open, title, onClose, children }: AdminDetailDrawerProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const restoreFocusRef = useRef<HTMLElement | null>(null)
  const wasOpenRef = useRef(false)
  const titleId = useId()

  useEffect(() => {
    const dialog = dialogRef.current
    if (dialog == null) return

    if (open && !wasOpenRef.current) {
      restoreFocusRef.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null
      if (!dialog.open) {
        if (typeof dialog.showModal === 'function') dialog.showModal()
        else dialog.setAttribute('open', '')
      }
      window.setTimeout(() => closeRef.current?.focus(), 0)
    } else if (!open && wasOpenRef.current) {
      if (dialog.open) {
        if (typeof dialog.close === 'function') dialog.close()
        else dialog.removeAttribute('open')
      }
      window.setTimeout(() => restoreFocusRef.current?.focus(), 0)
    }

    wasOpenRef.current = open
  }, [open])

  useEffect(
    () => () => {
      if (wasOpenRef.current) restoreFocusRef.current?.focus()
    },
    [],
  )

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDialogElement>) => {
    if (event.key !== 'Escape') return
    event.preventDefault()
    onClose()
  }

  return (
    <dialog
      ref={dialogRef}
      className="admin-detail-drawer"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onKeyDown={handleKeyDown}
    >
      <header className="admin-detail-drawer__header">
        <h2 id={titleId}>{title}</h2>
        <button
          ref={closeRef}
          type="button"
          className="admin-detail-drawer__close"
          aria-label="Close details"
          onClick={onClose}
        >
          ×
        </button>
      </header>
      <div className="admin-detail-drawer__body">{children}</div>
    </dialog>
  )
}