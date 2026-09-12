import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useAuth } from '../auth/useAuth'
import {
  addFavorite,
  getFavoriteListingIds,
  removeFavorite,
} from './favorites.service'

export interface FavoritesContextValue {
  /** Listing ids the current user has favorited. */
  favoriteIds: Set<string>
  favoritesLoading: boolean
  favoritesError: string | null
  isFavorited: (listingId: string) => boolean
  toggleFavorite: (listingId: string) => Promise<{ error: Error | null }>
  refreshFavorites: () => Promise<void>
}

export const FavoritesContext = createContext<FavoritesContextValue | null>(null)

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set())
  const [favoritesLoading, setFavoritesLoading] = useState(false)
  const [favoritesError, setFavoritesError] = useState<string | null>(null)
  const userIdRef = useRef<string | null>(null)

  const refreshFavorites = useCallback(async (targetUserId?: string) => {
    const userId = targetUserId ?? userIdRef.current
    if (userId == null) {
      setFavoriteIds(new Set())
      return
    }
    setFavoritesLoading(true)
    setFavoritesError(null)
    const { data, error } = await getFavoriteListingIds(userId)
    if (error != null) {
      setFavoritesError('We could not load your favorites. Please try again.')
    } else {
      setFavoriteIds(new Set(data))
    }
    setFavoritesLoading(false)
  }, [])

  useEffect(() => {
    userIdRef.current = user?.id ?? null
    void refreshFavorites(user?.id ?? undefined)
  }, [user?.id, refreshFavorites])

  const isFavorited = useCallback(
    (listingId: string) => favoriteIds.has(listingId),
    [favoriteIds],
  )

  const toggleFavorite = useCallback(
    async (listingId: string) => {
      const userId = userIdRef.current
      if (userId == null) return { error: new Error('You must be signed in') }

      const wasFavorited = favoriteIds.has(listingId)
      // Optimistic update; reverted if the server call fails.
      setFavoriteIds((current) => {
        const next = new Set(current)
        if (wasFavorited) {
          next.delete(listingId)
        } else {
          next.add(listingId)
        }
        return next
      })

      const result = wasFavorited
        ? await removeFavorite(userId, listingId)
        : await addFavorite(userId, listingId)

      if (result.error != null) {
        setFavoriteIds((current) => {
          const next = new Set(current)
          if (wasFavorited) {
            next.add(listingId)
          } else {
            next.delete(listingId)
          }
          return next
        })
        return { error: result.error }
      }
      return { error: null }
    },
    [favoriteIds],
  )

  return (
    <FavoritesContext.Provider
      value={{
        favoriteIds,
        favoritesLoading,
        favoritesError,
        isFavorited,
        toggleFavorite,
        refreshFavorites,
      }}
    >
      {children}
    </FavoritesContext.Provider>
  )
}

export function useFavorites() {
  const context = useContext(FavoritesContext)
  if (context == null) {
    throw new Error('useFavorites must be used within a FavoritesProvider')
  }
  return context
}
