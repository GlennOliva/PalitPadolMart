import { Link } from 'react-router-dom'

export default function NotFoundPage() {
  return (
    <section className="container not-found">
      <h1>Page not found</h1>
      <p>The page you are looking for does not exist or has moved.</p>
      <p>
        <Link to="/">Back to home</Link>
      </p>
    </section>
  )
}
