import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, within, act, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import MarketplacePage from '../../src/pages/marketplace/MarketplacePage'

const { marketplaceMocks } = vi.hoisted(() => ({
  marketplaceMocks: {
    searchMarketplaceListings: vi.fn(),
    getActiveCategories: vi.fn(),
    getActiveBrands: vi.fn(),
  },
}))

vi.mock('../../src/features/marketplace/search.service', () => ({
  searchMarketplaceListings: marketplaceMocks.searchMarketplaceListings,
}))

vi.mock('../../src/features/marketplace/marketplace.service', () => ({
  getActiveCategories: marketplaceMocks.getActiveCategories,
  getActiveBrands: marketplaceMocks.getActiveBrands,
}))

vi.mock('../../src/features/auth/useAuth', () => ({
  useAuth: () => ({ isAuthenticated: false, user: null }),
}))

vi.mock('../../src/features/favorites/FavoritesProvider', () => ({
  useFavorites: () => ({
    favoriteIds: new Set(),
    favoritesLoading: false,
    isFavorited: () => false,
    toggleFavorite: vi.fn(),
    refreshFavorites: vi.fn(),
  }),
}))

let currentLocation = ''
function LocationProbe() {
  const location = useLocation()
  currentLocation = `${location.pathname}${location.search}`
  return null
}

const categories = [
  { id: 'c1', name: 'Paddles', slug: 'paddles', description: null, is_active: true, sort_order: 0, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
  { id: 'c2', name: 'Balls', slug: 'balls', description: null, is_active: true, sort_order: 1, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
]

const brands = [
  { id: 'b1', name: 'Selkirk', slug: 'selkirk', logo_url: null, description: null, is_active: true, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
]

function listing(overrides: Record<string, unknown> = {}) {
  return {
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
    ...overrides,
  }
}

function renderPage(initialEntry = '/marketplace') {
  currentLocation = ''
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route
          path="/marketplace"
          element={
            <>
              <MarketplacePage />
              <LocationProbe />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  )
}

function stubReferenceData() {
  marketplaceMocks.getActiveCategories.mockResolvedValue({ data: categories, error: null })
  marketplaceMocks.getActiveBrands.mockResolvedValue({ data: brands, error: null })
}

function emptyResult() {
  return { items: [], total: 0, page: 1, pageSize: 12, totalPages: 0 }
}

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe('MarketplacePage', () => {
  it('shows a loading skeleton then the listings', async () => {
    stubReferenceData()
    marketplaceMocks.searchMarketplaceListings.mockResolvedValue({
      data: { items: [listing()], total: 1, page: 1, pageSize: 12, totalPages: 1 },
      error: null,
    })

    renderPage()

    expect(screen.getByRole('status', { name: 'Loading listings' })).toBeInTheDocument()

    const card = await screen.findByRole('link', { name: 'Selkirk Amped Epic' })
    expect(card).toHaveAttribute('href', '/marketplace/list-1')
    expect(screen.getByText('Showing 1 of 1 listing')).toBeInTheDocument()
  })

  it('renders the no-listings empty state', async () => {
    stubReferenceData()
    marketplaceMocks.searchMarketplaceListings.mockResolvedValue({ data: emptyResult(), error: null })

    renderPage()

    expect(await screen.findByText('No listings yet')).toBeInTheDocument()
  })

  it('renders the no-matches empty state and a clear button when filters are active', async () => {
    stubReferenceData()
    marketplaceMocks.searchMarketplaceListings.mockResolvedValue({ data: emptyResult(), error: null })

    renderPage('/marketplace?q=nowhere&brand=selkirk')

    expect(await screen.findByText('No matching listings')).toBeInTheDocument()
    const clearButton = screen.getByRole('button', { name: 'Clear all filters' })
    fireEvent.click(clearButton)
    await waitFor(() => expect(currentLocation).toBe('/marketplace'))
  })

  it('surfaces a friendly error when the search fails', async () => {
    stubReferenceData()
    marketplaceMocks.searchMarketplaceListings.mockResolvedValue({
      data: null,
      error: { message: 'boom', code: 'PGRST000', details: '', hint: '' },
    })

    renderPage()

    expect(await screen.findByText('We could not load the marketplace. Please try again.')).toBeInTheDocument()
  })

  it('shows removable chips and a clear-all action', async () => {
    stubReferenceData()
    marketplaceMocks.searchMarketplaceListings.mockResolvedValue({ data: emptyResult(), error: null })

    renderPage('/marketplace?q=amped&pickup=1')

    const removeChip = await screen.findByRole('button', { name: 'Remove filter: Search: “amped”' })
    fireEvent.click(removeChip)
    await waitFor(() => expect(currentLocation).toBe('/marketplace?pickup=1'))

    fireEvent.click(screen.getByRole('button', { name: 'Clear all' }))
    await waitFor(() => expect(currentLocation).toBe('/marketplace'))
  })

  it('navigates category pills through the URL', async () => {
    stubReferenceData()
    marketplaceMocks.searchMarketplaceListings.mockResolvedValue({ data: emptyResult(), error: null })

    renderPage()

    const paddles = await screen.findByRole('button', { name: 'Paddles' })
    fireEvent.click(paddles)
    await waitFor(() => expect(currentLocation).toBe('/marketplace?category=paddles'))
    expect(paddles).toHaveAttribute('aria-pressed', 'true')
  })

  it('filters from the sidebar via condition pills and brand select', async () => {
    stubReferenceData()
    marketplaceMocks.searchMarketplaceListings.mockResolvedValue({ data: emptyResult(), error: null })

    renderPage()

    const sidebar = await screen.findByLabelText('Filters')
    fireEvent.click(within(sidebar).getByText('Like new'))
    await waitFor(() => expect(currentLocation).toBe('/marketplace?condition=like_new'))

    fireEvent.change(within(sidebar).getByRole('combobox'), { target: { value: 'selkirk' } })
    await waitFor(() => expect(currentLocation).toBe('/marketplace?brand=selkirk&condition=like_new'))
  })

  it('updates the URL after the user pauses typing (debounced search)', async () => {
    vi.useFakeTimers()
    stubReferenceData()
    marketplaceMocks.searchMarketplaceListings.mockResolvedValue({ data: emptyResult(), error: null })

    renderPage()

    const input = screen.getByRole('searchbox', { name: 'Search listings' })
    fireEvent.change(input, { target: { value: 'amped' } })
    expect(currentLocation).toBe('/marketplace')

    await act(async () => {
      vi.advanceTimersByTime(400)
      await Promise.resolve()
    })

    expect(currentLocation).toBe('/marketplace?q=amped')
  })

  it('opens and closes the mobile filter drawer', async () => {
    stubReferenceData()
    marketplaceMocks.searchMarketplaceListings.mockResolvedValue({ data: emptyResult(), error: null })

    renderPage()

    const openButton = await screen.findByRole('button', { name: 'Filters' })
    expect(openButton).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(openButton)

    const dialog = await screen.findByRole('dialog', { name: 'Filters' })
    expect(openButton).toHaveAttribute('aria-expanded', 'true')
    expect(within(dialog).getByRole('button', { name: 'Close filters' })).toHaveFocus()
    expect(within(dialog).getByRole('combobox')).toBeInTheDocument()

    fireEvent.click(within(dialog).getByText('Pickup available'))
    await waitFor(() => expect(currentLocation).toBe('/marketplace?pickup=1'))

    fireEvent.click(within(dialog).getByRole('button', { name: 'Done' }))
    expect(screen.queryByRole('dialog', { name: 'Filters' })).not.toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Filters' })).toHaveFocus())
  })

  it('renders pagination and navigates pages', async () => {
    stubReferenceData()
    marketplaceMocks.searchMarketplaceListings.mockResolvedValue({
      data: { items: [listing()], total: 25, page: 1, pageSize: 12, totalPages: 3 },
      error: null,
    })

    renderPage()

    const next = await screen.findByRole('button', { name: 'Next page' })
    fireEvent.click(next)
    await waitFor(() => expect(currentLocation).toBe('/marketplace?page=2'))
  })
})
