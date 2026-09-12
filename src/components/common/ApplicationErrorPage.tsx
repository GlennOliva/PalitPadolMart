import { Link, useRouteError, isRouteErrorResponse } from 'react-router-dom'

export default function ApplicationErrorPage() {
  const error = useRouteError()

  let title = 'Something went wrong'
  let body = 'An unexpected error occurred while loading this page. Please try again.'

  if (isRouteErrorResponse(error)) {
    title = `${error.status} — ${error.statusText}`
    body =
      error.status === 404
        ? 'The page you are looking for does not exist or has moved.'
        : 'We could not load this page. Please try again in a moment.'
  } else if (error instanceof Error && error.message != null) {
    body = error.message
  }

  return (
    <div className="container error-page">
      <div className="error-page__panel glass glass--strong" role="alert">
        <p className="error-page__eyebrow">PalitPaddleBai Mart</p>
        <h1 className="error-page__title">{title}</h1>
        <p className="error-page__body">{body}</p>
        <div className="error-page__actions">
          <Link className="btn btn--primary" to="/">
            Return home
          </Link>
          <button type="button" className="btn btn--secondary" onClick={() => window.location.reload()}>
            Try again
          </button>
        </div>
      </div>
    </div>
  )
}
