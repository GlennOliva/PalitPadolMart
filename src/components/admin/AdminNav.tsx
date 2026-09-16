import { useEffect, useRef, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'

const ADMIN_LINKS = [
  { label: 'Dashboard', to: '/admin', end: true },
  { label: 'Users', to: '/admin/users' },
  { label: 'Sellers', to: '/admin/sellers' },
  { label: 'Listings', to: '/admin/listings' },
  { label: 'Reports', to: '/admin/reports' },
  { label: 'Report Center', to: '/admin/report-center' },
  { label: 'Reviews', to: '/admin/reviews' },
  { label: 'Orders', to: '/admin/orders' },
  { label: 'Payments', to: '/admin/payments' },
  { label: 'Disputes', to: '/admin/disputes' },
  { label: 'Refunds', to: '/admin/refunds' },
  { label: 'Audit Logs', to: '/admin/audit-logs' },
  { label: 'Analytics', to: '/admin/analytics' },
  { label: 'Categories', to: '/admin/categories' },
  { label: 'Brands', to: '/admin/brands' },
] as const

export default function AdminNav() {
  const [open, setOpen] = useState(false)
  const location = useLocation()
  const toggleRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    setOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!open) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setOpen(false)
      window.setTimeout(() => toggleRef.current?.focus(), 0)
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open])

  return (
    <aside className="admin-nav" aria-label="Admin console">
      <div className="admin-nav__header">
        <div>
          <span className="admin-nav__eyebrow">Operations</span>
          <span className="admin-nav__title">Admin console</span>
        </div>
        <button
          ref={toggleRef}
          type="button"
          className="admin-nav__toggle"
          aria-controls="admin-navigation-links"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
        >
          <span>{open ? 'Close' : 'Menu'}</span>
          <span className="admin-nav__toggle-mark" aria-hidden="true">
            {open ? '\u00d7' : '+'}
          </span>
        </button>
      </div>

      <nav
        id="admin-navigation-links"
        className={open ? 'admin-nav__links admin-nav__links--open' : 'admin-nav__links'}
        aria-label="Administration sections"
      >
        {ADMIN_LINKS.map((link, index) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={'end' in link ? link.end : undefined}
            className={({ isActive }) =>
              isActive ? 'admin-nav__link admin-nav__link--active' : 'admin-nav__link'
            }
          >
            <span className="admin-nav__index" aria-hidden="true">
              {String(index + 1).padStart(2, '0')}
            </span>
            <span>{link.label}</span>
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}
