import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useSeller } from '../../features/seller/useSeller'
import { getSellerDashboardSummary } from '../../features/seller/seller.service'
import { formatSellerStatus } from '../../features/seller/seller-utils'
import type { SellerDashboardSummary } from '../../features/seller/seller.types'
import { formatCurrency, formatRating } from '../../utils/format'
import LoadingState from '../../components/common/LoadingState'
import Alert from '../../components/common/Alert'

interface StatCardProps {
  label: string
  value: string
  zero: string
}

function StatCard({ label, value, zero }: StatCardProps) {
  return (
    <div className="stat-card">
      <span className="stat-card__label">{label}</span>
      <strong className="stat-card__value">{value}</strong>
      <span className="stat-card__hint">{zero}</span>
    </div>
  )
}

function CurrencyStatCard({ label, amount, zero }: Omit<StatCardProps, 'value'> & { amount: number }) {
  return (
    <div className="stat-card stat-card--currency">
      <span className="stat-card__label">{label}</span>
      <strong className="stat-card__value stat-card__value--currency">
        {formatCurrency(amount)}
      </strong>
      <span className="stat-card__hint">{zero}</span>
    </div>
  )
}

export default function SellerDashboardPage() {
  const { sellerProfile } = useSeller()
  const [summary, setSummary] = useState<SellerDashboardSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadSummary = useCallback(async () => {
    if (sellerProfile == null) return
    setLoading(true)
    setError(null)
    const { data, error } = await getSellerDashboardSummary(sellerProfile.id)
    if (error != null) {
      setError('We could not load your seller dashboard. Please try again.')
      setSummary(null)
    } else {
      setSummary(data)
    }
    setLoading(false)
  }, [sellerProfile])

  useEffect(() => {
    void loadSummary()
  }, [loadSummary])

  if (sellerProfile == null) {
    return <LoadingState label="Loading your seller account…" />
  }

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
      <h1 className="page__title">Seller Dashboard</h1>
      <p className="page__intro">
        Welcome to your store, {sellerProfile.store_name}.
      </p>

      <section className="seller-dashboard">
        <div className="seller-summary-card" aria-label="Your store">
          <div className="seller-summary-card__row">
            <span className="seller-summary-card__label">Store</span>
            <strong className="seller-summary-card__name">
              {sellerProfile.store_name}
            </strong>
            <span className="seller-summary-card__status">
              {formatSellerStatus(sellerProfile.seller_status)}
            </span>
          </div>
          <dl className="seller-summary-card__list">
            <div className="seller-summary-card__row">
              <dt>Location</dt>
              <dd>{location || 'Not provided'}</dd>
            </div>
            <div className="seller-summary-card__row">
              <dt>Availability</dt>
              <dd>{availability || 'Not specified'}</dd>
            </div>
          </dl>
          <nav className="seller-summary-card__actions" aria-label="Seller actions">
            <Link className="btn btn--primary btn--sm" to="/seller/listings/new">
              Add listing
            </Link>
            <Link className="btn btn--secondary btn--sm" to="/seller/listings">
              Manage listings
            </Link>
            <Link className="btn btn--ghost btn--sm" to="/seller/profile">
              Edit seller profile
            </Link>
            <Link className="btn btn--ghost btn--sm" to="/seller/payment-methods">
              Payment methods
            </Link>
            <Link className="btn btn--ghost btn--sm" to="/seller/orders">
              Incoming orders
            </Link>
            <Link className="btn btn--ghost btn--sm" to="/seller/reviews">
              Customer reviews
            </Link>
            <Link className="btn btn--ghost btn--sm" to="/seller/disputes">
              Disputes
            </Link>
            <Link className="btn btn--ghost btn--sm" to="/inquiries">
              Buyer inquiries
            </Link>
            <Link
              className="btn btn--ghost btn--sm"
              to={`/sellers/${sellerProfile.id}`}
            >
              View public profile
            </Link>
          </nav>
        </div>

        {loading ? (
          <LoadingState label="Loading your store summary…" />
        ) : error != null ? (
          <Alert variant="error" message={error} />
        ) : summary != null ? (
          <div className="stat-grid" aria-label="Store summary">
            <StatCard
              label="Active listings"
              value={String(summary.activeListings)}
              zero="No active listings yet — add one to start selling."
            />
            <StatCard
              label="Draft listings"
              value={String(summary.draftListings)}
              zero="No draft listings yet."
            />
            <StatCard
              label="Sold listings"
              value={String(summary.soldListings)}
              zero="No sold listings yet."
            />
            <StatCard
              label="Pending orders"
              value={String(summary.pendingOrders)}
              zero="No pending orders yet."
            />
            <StatCard
              label="Completed orders"
              value={String(summary.completedOrders)}
              zero="No completed orders yet."
            />
            <CurrencyStatCard
              label="Sales value (paid & completed)"
              amount={summary.completedSalesValue}
              zero="No sales yet — you will see earnings here once orders come in."
            />
            <StatCard
              label="Approved reviews"
              value={String(summary.approvedReviews)}
              zero="No reviews yet."
            />
            <StatCard
              label="Average rating"
              value={formatRating(summary.averageRating)}
              zero="No ratings yet."
            />
          </div>
        ) : null}
      </section>

      <nav className="page-actions" aria-label="Related actions">
        <Link className="btn" to="/dashboard">
          Back to dashboard
        </Link>
      </nav>
    </div>
  )
}
