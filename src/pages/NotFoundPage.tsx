import { Link } from 'react-router-dom'

export default function NotFoundPage() {
  return (
    <div className="container">
      <section className="not-found">
        <div className="not-found__panel glass glass--strong">
          <p className="not-found__code" aria-hidden="true">
            404
          </p>
          <h1 className="not-found__title">Page not found</h1>
          <p className="not-found__body">
            The page you are looking for does not exist or has moved. Head back
            to the marketplace or start from home.
          </p>
          <div className="not-found__actions">
            <Link className="btn btn--primary" to="/">
              Return home
            </Link>
            <Link className="btn btn--secondary" to="/marketplace">
              Browse the marketplace
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
