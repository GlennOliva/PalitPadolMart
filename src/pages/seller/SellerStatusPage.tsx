import { Link, Navigate } from 'react-router-dom'
import { useSeller } from '../../features/seller/useSeller'
import {
  formatSellerStatus,
  isSellerActive,
} from '../../features/seller/seller-utils'
import LoadingState from '../../components/common/LoadingState'

export default function SellerStatusPage() {
  const { sellerProfile, sellerLoading } = useSeller()

  if (sellerLoading) {
    return <LoadingState label="Loading your seller account…" />
  }

  if (sellerProfile == null) {
    return <Navigate to="/seller/onboarding" replace />
  }

  if (isSellerActive(sellerProfile)) {
    return <Navigate to="/seller/dashboard" replace />
  }

  const status = sellerProfile.seller_status
  const location = [sellerProfile.city, sellerProfile.province]
    .filter(Boolean)
    .join(', ')
  const availability = [
    sellerProfile.pickup_available ? 'Pickup' : null,
    sellerProfile.delivery_available ? 'Delivery' : null,
  ]
    .filter(Boolean)
    .join(', ')

  return (
    <div className="container page">
      <h1 className="page__title">Seller status</h1>

      <div className={`status-banner status-banner--${status}`} role="status">
        <strong>{formatSellerStatus(status)}</strong>
        {status === 'pending' ? (
          <p>
            Your seller application has been received and is under review. You
            will get access to seller tools once an administrator approves your
            application.
          </p>
        ) : null}
        {status === 'rejected' ? (
          <p>
            Your seller application was not approved. If you believe this is an
            error, please contact support.
          </p>
        ) : null}
        {status === 'suspended' ? (
          <p>
            Your seller account is currently suspended, so selling actions are
            unavailable. If you believe this is an error, please contact
            support.
          </p>
        ) : null}
      </div>

      <section className="application-summary" aria-label="Application details">
        <h2 className="application-summary__title">Application details</h2>
        <dl className="application-summary__list">
          <div className="application-summary__row">
            <dt>Store name</dt>
            <dd>{sellerProfile.store_name}</dd>
          </div>
          <div className="application-summary__row">
            <dt>Status</dt>
            <dd>{formatSellerStatus(status)}</dd>
          </div>
          {sellerProfile.description != null ? (
            <div className="application-summary__row">
              <dt>Description</dt>
              <dd>{sellerProfile.description}</dd>
            </div>
          ) : null}
          <div className="application-summary__row">
            <dt>Location</dt>
            <dd>{location || 'Not provided'}</dd>
          </div>
          <div className="application-summary__row">
            <dt>Availability</dt>
            <dd>{availability || 'Not specified'}</dd>
          </div>
        </dl>
      </section>

      <nav className="page-actions" aria-label="Related actions">
        <Link className="btn" to="/dashboard">
          Back to dashboard
        </Link>
      </nav>
    </div>
  )
}
