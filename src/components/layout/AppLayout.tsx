import { Link, NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../../features/auth/useAuth'

export default function AppLayout() {
  const { status, isAuthenticated, profile, signOut } = useAuth()

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    isActive ? 'site-nav__link site-nav__link--active' : 'site-nav__link'

  const displayName =
    profile?.display_name ?? profile?.first_name ?? null

  return (
    <div className="app-shell">
      <header className="site-header">
        <div className="container site-header__inner">
          <Link to="/" className="brand">
            <span className="brand__mark" aria-hidden="true">
              🏓
            </span>
            <span className="brand__name">PalitPaddleBai Mart</span>
          </Link>
          <nav className="site-nav" aria-label="Main navigation">
            <NavLink to="/" end className={navLinkClass}>
              Home
            </NavLink>
            {status === 'initializing' ? null : isAuthenticated ? (
              <>
                <NavLink to="/dashboard" className={navLinkClass}>
                  Dashboard
                </NavLink>
                <NavLink to="/profile" className={navLinkClass}>
                  Profile
                </NavLink>
                <NavLink to="/preferences" className={navLinkClass}>
                  Preferences
                </NavLink>
              </>
            ) : (
              <>
                <NavLink to="/login" className={navLinkClass}>
                  Sign in
                </NavLink>
                <NavLink to="/register" className={navLinkClass}>
                  Register
                </NavLink>
              </>
            )}
          </nav>
          {status === 'initializing' || !isAuthenticated ? null : (
            <div className="site-header__account">
              {displayName != null ? (
                <span className="site-header__display-name">{displayName}</span>
              ) : null}
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => void signOut()}
              >
                Log out
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="site-main">
        <Outlet />
      </main>

      <footer className="site-footer">
        <div className="container">
          <p>
            PalitPaddleBai Mart — a community marketplace for pickleball
            equipment.
          </p>
        </div>
      </footer>
    </div>
  )
}
