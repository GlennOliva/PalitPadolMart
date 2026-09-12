import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useSeller } from '../../features/seller/useSeller'
import {
  archiveListing,
  getSellerListings,
  markListingSold,
  publishListing,
} from '../../features/marketplace/marketplace.service'
import {
  formatListingCondition,
  formatListingStatus,
  isPubliclyVisible,
} from '../../features/marketplace/marketplace-utils'
import type { SellerListing } from '../../features/marketplace/marketplace.types'
import { formatCurrency } from '../../utils/format'
import LoadingState from '../../components/common/LoadingState'
import Alert from '../../components/common/Alert'
import PageHeader from '../../components/common/PageHeader'
import Badge from '../../components/common/Badge'
import EmptyState from '../../components/common/EmptyState'

type BusyAction = 'publish' | 'archive' | 'sold' | null

export default function SellerListingsPage() {
  const { sellerProfile } = useSeller()
  const [listings, setListings] = useState<SellerListing[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<BusyAction>(null)

  const load = useCallback(async () => {
    if (sellerProfile == null) return
    setLoading(true)
    setError(null)
    const { data, error } = await getSellerListings(sellerProfile.id)
    if (error != null) {
      setError('We could not load your listings. Please try again.')
      setListings(null)
    } else {
      setListings(data ?? [])
    }
    setLoading(false)
  }, [sellerProfile])

  useEffect(() => {
    void load()
  }, [load])

  if (sellerProfile == null) {
    return <LoadingState label="Loading your seller account…" />
  }

  const runAction = async (action: Exclude<BusyAction, null>, listingId: string) => {
    setBusy(action)
    setError(null)
    const call =
      action === 'publish'
        ? publishListing(sellerProfile.id, listingId)
        : action === 'archive'
          ? archiveListing(sellerProfile.id, listingId)
          : markListingSold(sellerProfile.id, listingId)
    const { error } = await call
    if (error != null) {
      setError('We could not update that listing. Please try again.')
    } else {
      await load()
    }
    setBusy(null)
  }

  return (
    <div className="container page">
      <PageHeader
        title="Your listings"
        intro="Create, edit, and manage everything you are selling."
        actions={
          <Link className="btn btn--primary" to="/seller/listings/new">
            Create listing
          </Link>
        }
      />

      {loading ? (
        <LoadingState label="Loading your listings…" />
      ) : error != null ? (
        <Alert variant="error" message={error} />
      ) : listings == null || listings.length === 0 ? (
        <EmptyState
          title="No listings yet"
          body="Create your first listing to start selling on the marketplace."
          action={
            <Link className="btn btn--primary" to="/seller/listings/new">
              Create listing
            </Link>
          }
        />
      ) : (
        <ul className="listing-admin-list glass" aria-label="Your listings">
          {listings.map((listing) => (
            <li key={listing.id} className="listing-admin-row">
              <div className="listing-admin-row__media">
                {listing.images[0]?.url != null ? (
                  <img className="listing-admin-row__image" src={listing.images[0].url} alt="" />
                ) : (
                  <span className="listing-admin-row__placeholder" aria-hidden="true">
                    🏓
                  </span>
                )}
              </div>
              <div className="listing-admin-row__body">
                <p className="listing-admin-row__title">
                  <Link to={`/seller/listings/${listing.id}`}>{listing.title}</Link>
                </p>
                <p className="listing-admin-row__meta">
                  {formatCurrency(listing.price)} ·{' '}
                  {formatListingCondition(listing.listing_condition)} ·{' '}
                  {listing.quantity} available · {listing.category?.name ?? 'Uncategorized'}
                  {listing.brand != null ? ` · ${listing.brand.name}` : ''}
                </p>
                <p className="listing-admin-row__status">
                  <Badge variant={listing.listing_status}>
                    {formatListingStatus(listing.listing_status)}
                  </Badge>
                  {!isPubliclyVisible(listing) ? (
                    <span className="listing-admin-row__visibility">Not shown publicly</span>
                  ) : null}
                </p>
              </div>
              <div className="listing-admin-row__actions">
                <Link
                  className="btn btn--ghost btn--sm"
                  to={`/seller/listings/${listing.id}/edit`}
                >
                  Edit
                </Link>
                {listing.listing_status === 'draft' ? (
                  <button
                    type="button"
                    className="btn btn--secondary btn--sm"
                    disabled={busy != null}
                    onClick={() => void runAction('publish', listing.id)}
                  >
                    Publish
                  </button>
                ) : null}
                {listing.listing_status === 'active' ? (
                  <button
                    type="button"
                    className="btn btn--secondary btn--sm"
                    disabled={busy != null}
                    onClick={() => void runAction('sold', listing.id)}
                  >
                    Mark as sold
                  </button>
                ) : null}
                {!['archived', 'sold', 'removed'].includes(listing.listing_status) ? (
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    disabled={busy != null}
                    onClick={() => void runAction('archive', listing.id)}
                  >
                    Archive
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      <nav className="page-actions" aria-label="Related actions">
        <Link className="btn" to="/seller/dashboard">
          Back to seller dashboard
        </Link>
      </nav>
    </div>
  )
}
