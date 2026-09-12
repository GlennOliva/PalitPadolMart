import { Link } from 'react-router-dom'
import { useAuth } from '../features/auth/useAuth'

export default function HomePage() {
  const { status, isAuthenticated, profile } = useAuth()
  const initializing = status === 'initializing'

  return (
    <div className="container">
      <section className="home-hero">
        <p className="home-hero__eyebrow">PalitPaddleBai Mart</p>
        <h1 className="home-hero__title">Buy. Sell. Play Better.</h1>

        <div className="home-hero__panel glass glass--strong">
          <p className="home-hero__lede">
            A community marketplace where pickleball players buy and sell
            paddles, balls, bags, and everything in between.
          </p>

          {!initializing && isAuthenticated ? (
            <div className="home-hero__actions">
              <Link className="btn btn--primary btn--lg" to="/dashboard">
                Go to your dashboard
              </Link>
              <Link className="btn btn--secondary btn--lg" to="/marketplace">
                Browse the marketplace
              </Link>
            </div>
          ) : null}

          {!initializing && !isAuthenticated ? (
            <div className="home-hero__actions">
              <Link className="btn btn--primary btn--lg" to="/register">
                Create an account
              </Link>
              <Link className="btn btn--secondary btn--lg" to="/login">
                Sign in
              </Link>
              <Link className="btn btn--ghost btn--lg" to="/marketplace">
                Browse the marketplace
              </Link>
            </div>
          ) : null}

          {initializing ? null : (
            <p className="home-hero__note">
              {isAuthenticated && profile != null
                ? `Signed in as ${
                    profile.display_name ?? profile.first_name ?? 'a member'
                  }.`
                : 'Browse the marketplace to find gear, or become a seller to list your own.'}
            </p>
          )}
        </div>
      </section>

      <section className="home-features" aria-label="How PalitPaddleBai Mart works">
        <article className="home-feature glass glass--soft">
          <span className="home-feature__icon" aria-hidden="true">
            🏓
          </span>
          <h2>Buy gear</h2>
          <p>
            Browse paddles, balls, bags, and accessories listed by the seller
            community — newest first.
          </p>
          <Link className="btn btn--secondary" to="/marketplace">
            Browse marketplace
          </Link>
        </article>

        <article className="home-feature glass glass--soft">
          <span className="home-feature__icon" aria-hidden="true">
            🏪
          </span>
          <h2>Sell your gear</h2>
          <p>
            Open a store, list your equipment with photos, and reach players
            who are looking for exactly that.
          </p>
          <Link className="btn btn--secondary" to="/seller/onboarding">
            Become a seller
          </Link>
        </article>

        <article className="home-feature glass glass--soft">
          <span className="home-feature__icon" aria-hidden="true">
            🎯
          </span>
          <h2>Play better</h2>
          <p>
            Answer a few questions and we'll rank the paddles on the
            marketplace for the way you play.
          </p>
          <Link className="btn btn--secondary" to="/recommendations">
            Get paddle recommendations
          </Link>
        </article>
      </section>

      <section className="home-cta">
        <div className="home-cta__panel glass">
          <h2>Ready to upgrade your game?</h2>
          <p>
            Join the community — whether you are refreshing your bag or passing
            gear on to the next player.
          </p>
          <Link className="btn btn--primary btn--lg" to="/marketplace">
            Explore the marketplace
          </Link>
        </div>
      </section>
    </div>
  )
}
