import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../../features/auth/useAuth'
import { useSeller } from '../../features/seller/useSeller'
import { useCart } from '../../features/cart/CartProvider'
import { sellerNavLabel, sellerNavPath } from '../../features/seller/seller-utils'
import NotificationBell from '../notifications/NotificationBell'
import { hasRole } from '../../features/auth/auth-utils'

export default function AppLayout() {
  const { status, isAuthenticated, profile, signOut } = useAuth()
  const { sellerProfile, sellerLoading } = useSeller()
  const { itemCount } = useCart()
  const [navOpen, setNavOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const location = useLocation()
  const navRef = useRef<HTMLElement>(null)
  const navToggleRef = useRef<HTMLButtonElement>(null)
  const navCloseRef = useRef<HTMLButtonElement>(null)
  const mainRef = useRef<HTMLElement>(null)
  const footerRef = useRef<HTMLElement>(null)

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    isActive ? 'site-nav__link site-nav__link--active' : 'site-nav__link'

  const displayName =
    profile?.display_name ?? profile?.first_name ?? null
  const isAdminArea = location.pathname === '/admin' || location.pathname.startsWith('/admin/')

  const closeNav = () => setNavOpen(false)
  const changeNotificationsOpen = useCallback((open: boolean) => {
    setNotificationsOpen(open)
    if (open) setNavOpen(false)
  }, [])

  useEffect(() => {
    if (!navOpen) return

    const previousOverflow = document.body.style.overflow
    const main = mainRef.current
    const footer = footerRef.current
    const toggle = navToggleRef.current
    document.body.style.overflow = 'hidden'
    main?.setAttribute('inert', '')
    footer?.setAttribute('inert', '')
    navCloseRef.current?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setNavOpen(false)
        return
      }
      if (event.key !== 'Tab' || navRef.current == null) return

      const focusable = Array.from(
        navRef.current.querySelectorAll<HTMLElement>(
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
    return () => {
      document.body.style.overflow = previousOverflow
      main?.removeAttribute('inert')
      footer?.removeAttribute('inert')
      document.removeEventListener('keydown', onKeyDown)
      toggle?.focus()
    }
  }, [navOpen])

  useEffect(() => {
    closeNav()
    setNotificationsOpen(false)
  }, [location.pathname])

  return (
    <div className="app-shell">
      <header className="site-header">
        <div className="container site-header__inner">
         <Link to="/" className="brand" onClick={closeNav}>
  <img
    src="/logo.png"
    alt="PalitPaddleBai Mart"
    className="brand__logo"
  />
</Link>

          <nav
            ref={navRef}
            id="site-nav"
            className={navOpen ? 'site-nav site-nav--open' : 'site-nav'}
            aria-label="Main navigation"
          >
            <div className="site-nav__drawer-header">
              <span className="site-nav__drawer-title">Menu</span>
              <button
                ref={navCloseRef}
                type="button"
                className="site-nav__drawer-close"
                onClick={closeNav}
                aria-label="Dismiss menu"
              >
                <span aria-hidden="true">&times;</span>
              </button>
            </div>
            <NavLink to="/" end className={navLinkClass} onClick={closeNav}>
              Home
            </NavLink>
            <NavLink to="/marketplace" className={navLinkClass} onClick={closeNav}>
              Marketplace
            </NavLink>
            <NavLink to="/recommendations" className={navLinkClass} onClick={closeNav}>
              Recommendations
            </NavLink>
            {status === 'initializing' ? null : isAuthenticated ? (
              <>
                {isAdminArea ? null : (
                  <NavLink to="/dashboard" className={navLinkClass} onClick={closeNav}>
                    Dashboard
                  </NavLink>
                )}
                {hasRole(profile, 'admin') ? (
                  <NavLink to="/admin" className={navLinkClass} onClick={closeNav}>
                    Administration
                  </NavLink>
                ) : null}
                <NavLink to="/cart" className={navLinkClass} onClick={closeNav}>
                  {itemCount > 0 ? (
                    <>
                      Cart
                      <span className="site-nav__badge" aria-label={`${itemCount} items in cart`}>
                        {itemCount}
                      </span>
                    </>
                  ) : (
                    'Cart'
                  )}
                </NavLink>
                <NavLink to="/profile" className={navLinkClass} onClick={closeNav}>
                  Profile
                </NavLink>
                <NavLink to="/preferences" className={navLinkClass} onClick={closeNav}>
                  Preferences
                </NavLink>
                <NavLink
                  to={sellerLoading ? '/seller' : sellerNavPath(sellerProfile)}
                  className={navLinkClass}
                  onClick={closeNav}
                >
                  {sellerLoading ? 'Seller' : sellerNavLabel(sellerProfile)}
                </NavLink>
              </>
            ) : (
              <>
                <NavLink to="/login" className={navLinkClass} onClick={closeNav}>
                  Sign in
                </NavLink>
                <NavLink to="/register" className={navLinkClass} onClick={closeNav}>
                  Register
                </NavLink>
              </>
            )}
            {status === 'initializing' || !isAuthenticated ? null : (
              <div className="site-nav__account">
                {displayName != null ? (
                  <span className="site-header__display-name">{displayName}</span>
                ) : null}
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={() => {
                    closeNav()
                    setNotificationsOpen(false)
                    void signOut()
                  }}
                >
                  Log out
                </button>
              </div>
            )}
          </nav>

          <div className="site-header__utilities">
            {status === 'authenticated' ? (
              <NotificationBell
                open={notificationsOpen}
                onOpenChange={changeNotificationsOpen}
              />
            ) : null}
            <button
              ref={navToggleRef}
              type="button"
              className="site-nav-toggle"
              aria-controls="site-nav"
              aria-expanded={navOpen}
              onClick={() => {
                setNotificationsOpen(false)
                setNavOpen((open) => !open)
              }}
            >
              <span className="visually-hidden">
                {navOpen ? 'Close menu' : 'Open menu'}
              </span>
              <span className="site-nav-toggle__icon" aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
            </button>
          </div>

          {navOpen ? (
            <div
              className="site-nav-overlay"
              onClick={closeNav}
              aria-hidden="true"
            />
          ) : null}

        </div>
      </header>

      <main ref={mainRef} className="site-main">
        <Outlet />
      </main>

      <footer ref={footerRef} className="site-footer">
        <div className="container site-footer__inner">
          <div className="site-footer__brand">
            <span className="site-footer__mark" aria-hidden="true">
              🏓
            </span>
            <span>PalitPaddleBai Mart</span>
          </div>
          <p className="site-footer__tagline">
            A community marketplace for pickleball equipment — buy, sell, and
            play better.
          </p>
        </div>
      </footer>
    </div>
  )
}
