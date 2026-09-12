import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import InquiriesPage from '../../src/pages/account/InquiriesPage'

const { inquiriesMocks, user } = vi.hoisted(() => ({
  inquiriesMocks: {
    getMyInquiries: vi.fn(),
    getUnreadCounts: vi.fn(),
  },
  user: { id: 'user-1', email: 'buyer@example.com' },
}))

vi.mock('../../src/features/auth/useAuth', () => ({
  useAuth: () => ({ user, isAuthenticated: true }),
}))

vi.mock('../../src/features/seller/useSeller', () => ({
  useSeller: () => ({ sellerProfile: null, sellerLoading: false }),
}))

vi.mock('../../src/features/inquiries/inquiries.service', () => ({
  getMyInquiries: inquiriesMocks.getMyInquiries,
  getUnreadCounts: inquiriesMocks.getUnreadCounts,
}))

function inquiry(overrides: Record<string, unknown> = {}) {
  return {
    id: 'inq-1',
    listing_id: 'list-1',
    listing_title: 'Selkirk Amped Epic',
    buyer_id: 'buyer-1',
    seller_id: 'seller-1',
    subject: 'Is this available?',
    message: 'Hi, is this still for sale?',
    status: 'open',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    seller: { id: 'seller-1', store_name: 'Ace Paddles' },
    buyer_name: null,
    ...overrides,
  }
}

function renderPage() {
  return render(
    <MemoryRouter>
      <InquiriesPage />
    </MemoryRouter>,
  )
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('InquiriesPage', () => {
  it('shows a loading state then the inquiry list', async () => {
    inquiriesMocks.getMyInquiries.mockResolvedValue({
      data: [inquiry({ buyer_id: 'user-1' })],
      error: null,
    })
    inquiriesMocks.getUnreadCounts.mockResolvedValue({
      data: new Map([['inq-1', 1]]),
      error: null,
    })

    renderPage()

    expect(screen.getByRole('status', { name: 'Loading your inquiries…' })).toBeInTheDocument()

    const link = await screen.findByRole('link', { name: /Is this available\?/ })
    expect(link).toHaveAttribute('href', '/inquiries/inq-1')
    expect(within(link).getByText('Selkirk Amped Epic · Ace Paddles')).toBeInTheDocument()
  })

  it('shows the buyer name for seller-side inquiries', async () => {
    inquiriesMocks.getMyInquiries.mockResolvedValue({
      data: [inquiry({ buyer_id: 'buyer-9', buyer_name: 'Juan dela Cruz' })],
      error: null,
    })
    inquiriesMocks.getUnreadCounts.mockResolvedValue({ data: new Map(), error: null })

    renderPage()

    const link = await screen.findByRole('link', { name: /Is this available\?/ })
    expect(within(link).getByText('Selkirk Amped Epic · Juan dela Cruz')).toBeInTheDocument()
  })

  it('renders an unread badge when there are new inbound messages', async () => {
    inquiriesMocks.getMyInquiries.mockResolvedValue({ data: [inquiry()], error: null })
    inquiriesMocks.getUnreadCounts.mockResolvedValue({
      data: new Map([['inq-1', 2]]),
      error: null,
    })

    renderPage()

    const link = await screen.findByRole('link', { name: /Is this available\?/ })
    expect(within(link).getByLabelText('2 unread messages')).toBeInTheDocument()
  })

  it('shows an empty state when there are no inquiries', async () => {
    inquiriesMocks.getMyInquiries.mockResolvedValue({ data: [], error: null })
    inquiriesMocks.getUnreadCounts.mockResolvedValue({ data: new Map(), error: null })

    renderPage()

    expect(await screen.findByRole('heading', { name: 'No inquiries yet' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Browse the marketplace' })).toBeInTheDocument()
  })

  it('surfaces a load error with a retry button', async () => {
    inquiriesMocks.getMyInquiries.mockResolvedValue({
      data: [],
      error: { message: 'boom' },
    })

    renderPage()

    expect(
      await screen.findByText('We could not load your inquiries. Please try again.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })
})
