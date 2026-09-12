import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../features/auth/useAuth'
import { useFavorites } from '../../features/favorites/FavoritesProvider'

interface FavoriteButtonProps {
  listingId: string
  showLabel?: boolean
}

/**
 * Heart toggle for a listing. Guests are sent to the sign-in page with the
 * current location preserved as the return path; signed-in users toggle the
 * favorite through the shared favorites context.
 */
export default function FavoriteButton({
  listingId,
  showLabel = false,
}: FavoriteButtonProps) {
  const { isAuthenticated } = useAuth()
  const { isFavorited, toggleFavorite } = useFavorites()
  const navigate = useNavigate()
  const location = useLocation()
  const [pending, setPending] = useState(false)

  const active = isFavorited(listingId)

  const onClick = () => {
    if (!isAuthenticated) {
      navigate('/login', { state: { from: location } })
      return
    }
    setPending(true)
    void toggleFavorite(listingId).finally(() => setPending(false))
  }

  return (
    <button
      type="button"
      className={active ? 'favorite-btn favorite-btn--active' : 'favorite-btn'}
      aria-pressed={active}
      aria-label={active ? 'Remove from favorites' : 'Add to favorites'}
      disabled={pending}
      onClick={onClick}
    >
      <svg
        className="favorite-btn__heart"
        viewBox="0 0 24 24"
        width="18"
        height="18"
        aria-hidden="true"
      >
        <path
          d="M12 21s-7.5-4.9-10-9.2C.4 9 1.6 5 5.1 4.4 8.6 3.8 11 6 12 7.4 13 6 15.4 3.8 18.9 4.4c3.5.6 4.7 4.6 3.1 7.4C19.5 16.1 12 21 12 21z"
          fill={active ? 'currentColor' : 'none'}
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
        />
      </svg>
      {showLabel ? (
        <span>{active ? 'Remove from favorites' : 'Save to favorites'}</span>
      ) : null}
    </button>
  )
}
