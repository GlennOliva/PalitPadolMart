import { Link, NavLink, Outlet } from 'react-router-dom'

export default function AppLayout() {
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
            <NavLink to="/" end>
              Home
            </NavLink>
          </nav>
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
