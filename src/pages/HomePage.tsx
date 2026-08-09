import { Link } from 'react-router-dom'
import { useAuth } from '../features/auth/useAuth'

export default function HomePage() {
  const { status, isAuthenticated, profile } = useAuth()
  const initializing = status === 'initializing'

  return (
    <section className="container hero">
      <h1>Welcome to PalitPaddleBai Mart</h1>
      <p className="hero__lede">
        A marketplace where pickleball players buy and sell paddles, balls, bags,
        and everything in between.
      </p>
      {!initializing && isAuthenticated ? (
        <div className="hero__actions">
          <Link className="btn btn--primary" to="/dashboard">
            Go to your dashboard
          </Link>
        </div>
      ) : null}
      {!initializing && !isAuthenticated ? (
        <div className="hero__actions">
          <Link className="btn btn--primary" to="/register">
            Create an account
          </Link>
          <Link className="btn btn--secondary" to="/login">
            Sign in
          </Link>
        </div>
      ) : null}
      {initializing ? null : (
        <p className="hero__note">
          {isAuthenticated && profile != null
            ? `Signed in as ${
                profile.display_name ?? profile.first_name ?? 'a member'
              }.`
            : 'The marketplace is under construction. Browsing, selling, and buying features arrive in upcoming phases.'}
        </p>
      )}
    </section>
  )
}
