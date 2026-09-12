import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { AuthContext } from '../../src/features/auth/AuthProvider'
import { SellerProvider } from '../../src/features/seller/SellerProvider'
import { useSeller } from '../../src/features/seller/useSeller'
import { createAuthValue, makeUser } from '../utils/auth'
import { makeSellerProfile } from '../utils/seller'

const { sellerMocks } = vi.hoisted(() => ({
  sellerMocks: {
    getMySellerProfile: vi.fn(),
  },
}))

vi.mock('../../src/features/seller/seller.service', () => ({
  getMySellerProfile: sellerMocks.getMySellerProfile,
}))

function SellerProbe() {
  const { sellerProfile, sellerLoading, sellerError } = useSeller()
  return (
    <div>
      <span data-testid="loading">{String(sellerLoading)}</span>
      <span data-testid="error">{sellerError ?? 'none'}</span>
      <span data-testid="seller">{sellerProfile?.store_name ?? 'none'}</span>
    </div>
  )
}

function renderProvider(userId: string | null) {
  const authValue = createAuthValue({
    status: userId == null ? 'unauthenticated' : 'authenticated',
    isAuthenticated: userId != null,
    user: userId == null ? null : makeUser(userId),
  })
  render(
    <AuthContext.Provider value={authValue}>
      <SellerProvider>
        <SellerProbe />
      </SellerProvider>
    </AuthContext.Provider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('SellerProvider', () => {
  it('does not fetch for guests', async () => {
    renderProvider(null)
    expect(sellerMocks.getMySellerProfile).not.toHaveBeenCalled()
    expect(screen.getByTestId('seller')).toHaveTextContent('none')
  })

  it('loads the seller profile for an authenticated user', async () => {
    sellerMocks.getMySellerProfile.mockResolvedValue({
      data: makeSellerProfile({ id: 'seller-1' }),
      error: null,
    })
    renderProvider('user-1')

    expect(await screen.findByText('Ace Paddles PH')).toBeInTheDocument()
    expect(sellerMocks.getMySellerProfile).toHaveBeenCalledWith('user-1')
    expect(screen.getByTestId('error')).toHaveTextContent('none')
  })

  it('keeps the profile null when the user has no seller application', async () => {
    sellerMocks.getMySellerProfile.mockResolvedValue({ data: null, error: null })
    renderProvider('user-1')

    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'))
    expect(screen.getByTestId('seller')).toHaveTextContent('none')
  })

  it('surfaces a friendly error when the fetch fails', async () => {
    sellerMocks.getMySellerProfile.mockResolvedValue({
      data: null,
      error: { message: 'boom' },
    })
    renderProvider('user-1')

    await waitFor(() =>
      expect(screen.getByTestId('error')).toHaveTextContent(
        'We could not load your seller account.',
      ),
    )
    expect(screen.getByTestId('seller')).toHaveTextContent('none')
  })
})
