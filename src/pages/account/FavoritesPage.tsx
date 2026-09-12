import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../features/auth/useAuth'
import { getMyFavorites } from '../../features/favorites/favorites.service'
import { useFavorites } from '../../features/favorites/FavoritesProvider'
import type { FavoriteListing } from '../../features/favorites/favorites.types'
import PageHeader from '../../components/common/PageHeader'
import Alert from '../../components/common/Alert'
import EmptyState from '../../components/common/EmptyState'
import LoadingState from '../../components/common/LoadingState'
import ListingCard from '../../components/marketplace/ListingCard'

export default function FavoritesPage() {
  const { user } = useAuth()
  const { favoriteIds, toggleFavorite } = useFavorites()
  const [favorites, setFavorites] = useState<FavoriteListing[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    if (user == null) return
    setLoading(true)
    setError(null)
    void getMyFavorites(user.id).then(({ data, error: loadError }) => {
      if (loadError != null) {
        setError('We could not load your favorites. Please try again.')
      } else {
        setFavorites(data)
      }
      setLoading(false)
    })
  }, [user])

  useEffect(() => {
    load()
  }, [load])

  // The favorites context is the source of truth for what is currently
  // favorited, so removing a favorite anywhere on the page removes it here
  // instantly without a refetch.
  const visible = favorites.filter((favorite) => favoriteIds.has(favorite.listing_id))

  if (loading) {
    return <LoadingState label="Loading your favorites…" />
  }

  if (error != null) {
    return (
      <div className="container page">
        <Alert variant="error" message={error} />
        <button type="button" className="btn btn--primary" onClick={load}>
          Try again
        </button>
      </div>
    )
  }

  if (visible.length === 0) {
    return (
      <div className="container page">
        <PageHeader
          title="Favorites"
          intro="Products you have saved for later. Tap the heart on any listing to keep it here."
        />
        <EmptyState
          title="No favorites yet"
          body="Browse the marketplace and tap the heart on a listing you like — it will show up here."
          action={
            <Link className="btn btn--primary" to="/marketplace">
              Browse the marketplace
            </Link>
          }
        />
      </div>
    )
  }

  const unavailable = visible.filter((favorite) => favorite.listing == null)
  const available = visible.filter((favorite) => favorite.listing != null)

  return (
    <div className="container page">
      <PageHeader
        title="Favorites"
        intro="Products you have saved for later. Tap the heart to remove one."
      />

      {available.length > 0 ? (
        <div className="listing-grid" aria-label="Favorite listings">
          {available.map((favorite) => (
            <ListingCard key={favorite.id} listing={favorite.listing as NonNullable<typeof favorite.listing>} />
          ))}
        </div>
      ) : null}

      {unavailable.length > 0 ? (
        <section aria-label="Unavailable favorites" className="favorites-unavailable">
          <h2 className="favorites-unavailable__heading">No longer available</h2>
          <ul className="favorites-unavailable__list">
            {unavailable.map((favorite) => (
              <li key={favorite.id} className="favorites-unavailable__item glass glass--soft">
                <div>
                  <strong>{favorite.listing_title ?? 'Unavailable listing'}</strong>
                  <p>
                    This item is no longer available — it may have been sold or
                    removed by the seller.
                  </p>
                </div>
                <button
                  type="button"
                  className="btn btn--secondary btn--sm"
                  onClick={() => void toggleFavorite(favorite.listing_id)}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
