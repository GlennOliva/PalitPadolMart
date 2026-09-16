import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from '../features/auth/useAuth'
import { hasRole } from '../features/auth/auth-utils'
import { useSeller } from '../features/seller/useSeller'

export default function DashboardPage() {
  const { profile } = useAuth()
  const { sellerProfile, sellerLoading } = useSeller()

  const displayName =
    profile?.display_name ?? [profile?.first_name, profile?.last_name].filter(Boolean).join(' ')

  let sellerTools: ReactNode
  if (sellerLoading) {
    sellerTools = (
      <div className="dashboard-links__item dashboard-links__item--disabled">
        <strong>Seller tools</strong>
        <span>Loading your seller account…</span>
      </div>
    )
  } else if (sellerProfile == null) {
    sellerTools = (
      <Link className="dashboard-links__item" to="/seller/onboarding">
        <strong>Become a Seller</strong>
        <span>Open your store and start selling</span>
      </Link>
    )
  } else if (sellerProfile.seller_status === 'active') {
    sellerTools = (
      <Link className="dashboard-links__item" to="/seller/dashboard">
        <strong>Seller Dashboard</strong>
        <span>Manage your store, listings, and orders</span>
      </Link>
    )
  } else {
    sellerTools = (
      <Link className="dashboard-links__item" to="/seller/status">
        <strong>
          {sellerProfile.seller_status === 'pending'
            ? 'Seller Application'
            : 'Seller Status'}
        </strong>
        <span>
          {sellerProfile.seller_status === 'pending'
            ? 'Your application is under review'
            : 'Your seller account is not active'}
        </span>
      </Link>
    )
  }

  return (
    <div className="container page">
      <h1 className="page__title">
        {displayName ? `Welcome, ${displayName}` : 'Welcome'}
      </h1>
      <p className="page__intro">
        Manage your marketplace activity, preferences, purchases, and seller tools.
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
        <Link className="dashboard-links__item" to="/favorites">
          <strong>Favorites</strong>
          <span>Products you have saved for later</span>
        </Link>
        <Link className="dashboard-links__item" to="/inquiries">
          <strong>Inquiries</strong>
          <span>Conversations with sellers about listings</span>
        </Link>
        <Link className="dashboard-links__item" to="/orders">
          <strong>My orders</strong>
          <span>Track your purchases and their status</span>
        </Link>
        <Link className="dashboard-links__item" to="/disputes">
          <strong>Disputes</strong>
          <span>Track problems reported for your orders</span>
        </Link>
        <Link className="dashboard-links__item" to="/notifications">
          <strong>Notifications</strong>
          <span>Review order, inquiry, review, dispute, and account updates</span>
        </Link>
        {sellerTools}
        {hasRole(profile ?? null, 'admin') ? (
          <Link className="dashboard-links__item" to="/admin">
            <strong>Admin tools</strong>
            <span>Open the marketplace administration workspace</span>
          </Link>
        ) : null}
      </nav>
    </div>
  )
}
