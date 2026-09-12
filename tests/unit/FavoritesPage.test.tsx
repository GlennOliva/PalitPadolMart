import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import FavoritesPage from '../../src/pages/account/FavoritesPage'

const { favoriteIds, user, favoritesMocks } = vi.hoisted(() => ({
  favoriteIds: new Set<string>(),
  user: { id: 'user-1', email: 'buyer@example.com' },
  favoritesMocks: {
    getMyFavorites: vi.fn(),
    toggleFavorite: vi.fn(),
  },
}))

vi.mock('../../src/features/auth/useAuth', () => ({
  useAuth: () => ({ user, isAuthenticated: true }),
}))

vi.mock('../../src/features/favorites/FavoritesProvider', () => ({
  useFavorites: () => ({
    favoriteIds,
    favoritesLoading: false,
    isFavorited: (listingId: string) => favoriteIds.has(listingId),
    toggleFavorite: favoritesMocks.toggleFavorite,
    refreshFavorites: vi.fn(),
  }),
}))

vi.mock('../../src/features/favorites/favorites.service', () => ({
  getMyFavorites: favoritesMocks.getMyFavorites,
}))

function favorite(overrides: Record<string, unknown> = {}) {
  return {
    id: 'fav-1',
    user_id: 'user-1',
    listing_id: 'list-1',
    listing_title: 'Selkirk Amped Epic',
    created_at: '2026-01-01T00:00:00.000Z',
    listing: {
      id: 'list-1',
      title: 'Selkirk Amped Epic',
      description: 'Great paddle',
      price: 6500,
      listing_condition: 'like_new',
      quantity: 1,
      city: null,
      province: null,
      pickup_available: true,
      delivery_available: false,
      created_at: '2026-01-01T00:00:00Z',
      category: { id: 'c1', name: 'Paddles', slug: 'paddles' },
      brand: { id: 'b1', name: 'Selkirk' },
      seller: { id: 's1', store_name: 'Ace Paddles' },
      images: [],
    },
    ...overrides,
  }
}

function renderPage() {
  return render(
    <MemoryRouter>
      <FavoritesPage />
    </MemoryRouter>,
  )
}

afterEach(() => {
  favoriteIds.clear()
  vi.clearAllMocks()
})

describe('FavoritesPage', () => {
  it('shows a loading state then the saved listings', async () => {
    favoriteIds.add('list-1')
    favoritesMocks.getMyFavorites.mockResolvedValue({
      data: [favorite()],
      error: null,
    })

    renderPage()

    expect(screen.getByRole('status', { name: 'Loading your favorites…' })).toBeInTheDocument()

    const card = await screen.findByRole('link', { name: 'Selkirk Amped Epic' })
    expect(card).toHaveAttribute('href', '/marketplace/list-1')
  })

  it('shows an empty state when there are no favorites', async () => {
    favoritesMocks.getMyFavorites.mockResolvedValue({ data: [], error: null })

    renderPage()

    expect(
      await screen.findByRole('heading', { name: 'No favorites yet' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Browse the marketplace' })).toBeInTheDocument()
  })

  it('lists unavailable items in the no-longer-available section', async () => {
    favoriteIds.add('list-gone')
    favoritesMocks.getMyFavorites.mockResolvedValue({
      data: [favorite({ id: 'fav-2', listing_id: 'list-gone', listing_title: 'Vatic Pro Prism', listing: null })],
      error: null,
    })

    renderPage()

    const section = await screen.findByRole('region', { name: 'Unavailable favorites' })
    expect(within(section).getByText('Vatic Pro Prism')).toBeInTheDocument()
  })

  it('removes an unavailable item instantly when Remove is clicked', async () => {
    favoriteIds.add('list-gone')
    favoritesMocks.getMyFavorites.mockResolvedValue({
      data: [favorite({ id: 'fav-2', listing_id: 'list-gone', listing_title: 'Vatic Pro Prism', listing: null })],
      error: null,
    })
    favoritesMocks.toggleFavorite.mockImplementation(async (listingId: string) => {
      favoriteIds.delete(listingId)
    })

    const view = renderPage()

    const section = await screen.findByRole('region', { name: 'Unavailable favorites' })
    fireEvent.click(within(section).getByRole('button', { name: 'Remove' }))
    await waitFor(() => {
      expect(favoritesMocks.toggleFavorite).toHaveBeenCalledWith('list-gone')
    })

    view.rerender(
      <MemoryRouter>
        <FavoritesPage />
      </MemoryRouter>,
    )
    expect(screen.queryByRole('region', { name: 'Unavailable favorites' })).not.toBeInTheDocument()
  })

  it('surfaces a load error with a retry button', async () => {
    favoritesMocks.getMyFavorites.mockResolvedValue({
      data: [],
      error: { message: 'boom' },
    })

    renderPage()

    expect(
      await screen.findByText('We could not load your favorites. Please try again.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })
})
