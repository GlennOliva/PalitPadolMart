import { useCallback, useEffect, useRef } from 'react'
import type { ReactNode } from 'react'

interface FilterDrawerProps {
  open: boolean
  onClose: () => void
  onClearAll: () => void
  activeFilterCount: number
  children: ReactNode
}

/**
 * Mobile filter sheet. Rendered (and inert) while closed so its controls stay
 * out of the tab order; Escape, the backdrop, or Done dismisses it.
 */
export default function FilterDrawer({
  open,
  onClose,
  onClearAll,
  activeFilterCount,
  children,
}: FilterDrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)

  const closeAndRestoreFocus = useCallback(() => {
    onClose()
    window.setTimeout(() => {
      document.getElementById('marketplace-filter-trigger')?.focus()
    }, 0)
  }, [onClose])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeAndRestoreFocus()
        return
      }
      if (event.key !== 'Tab' || panelRef.current == null) return

      const focusable = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      )
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [open, closeAndRestoreFocus])

  if (!open) return null

  return (
    <div id="filter-drawer" className="filter-drawer" role="presentation">
      <div className="filter-drawer__backdrop" onClick={closeAndRestoreFocus} aria-hidden="true" />
      <div
        ref={panelRef}
        className="filter-drawer__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="filter-drawer-title"
      >
        <header className="filter-drawer__header">
          <h2 id="filter-drawer-title" className="filter-drawer__title">
            Filters
            {activeFilterCount > 0 ? (
              <span className="btn__badge" aria-label={`${activeFilterCount} active filters`}>
                {activeFilterCount}
              </span>
            ) : null}
          </h2>
          <button ref={closeRef} type="button" className="filter-drawer__close" aria-label="Close filters" onClick={closeAndRestoreFocus}>
            ×
          </button>
        </header>

        <div className="filter-drawer__body">{children}</div>

        <footer className="filter-drawer__footer">
          <button type="button" className="btn btn--ghost" onClick={onClearAll}>
            Clear all
          </button>
          <button type="button" className="btn btn--primary" onClick={closeAndRestoreFocus}>
            Done
          </button>
        </footer>
      </div>
    </div>
  )
}
