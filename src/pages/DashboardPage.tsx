import { Link } from 'react-router-dom'
import { useAuth } from '../features/auth/useAuth'
import { hasRole } from '../features/auth/auth-utils'

export default function DashboardPage() {
  const { profile } = useAuth()

  const displayName =
    profile?.display_name ?? [profile?.first_name, profile?.last_name].filter(Boolean).join(' ')

  return (
    <div className="container page">
      <h1 className="page__title">
        {displayName ? `Welcome, ${displayName}` : 'Welcome'}
      </h1>
      <p className="page__intro">
        Your account is active. The marketplace is under construction — browsing,
        selling, and buying features arrive in upcoming phases.
      </p>
      <nav className="dashboard-links" aria-label="Account">
        <Link className="dashboard-links__item" to="/profile">
          <strong>My profile</strong>
          <span>Edit your details and profile photo</span>
        </Link>
        <Link className="dashboard-links__item" to="/preferences">
          <strong>Recommendation preferences</strong>
          <span>Tell us how you play so we can suggest the right gear</span>
        </Link>
        {hasRole(profile ?? null, 'seller') ? (
          <div className="dashboard-links__item dashboard-links__item--disabled">
            <strong>Seller tools</strong>
            <span>Available in a future phase</span>
          </div>
        ) : null}
        {hasRole(profile ?? null, 'admin') ? (
          <div className="dashboard-links__item dashboard-links__item--disabled">
            <strong>Admin tools</strong>
            <span>Available in a future phase</span>
          </div>
        ) : null}
      </nav>
    </div>
  )
}
