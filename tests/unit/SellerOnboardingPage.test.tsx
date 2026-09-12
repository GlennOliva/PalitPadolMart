import { describe, it, expect, beforeEach, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import SellerOnboardingPage from '../../src/pages/seller/SellerOnboardingPage'
import { createSellerApplication } from '../../src/features/seller/seller.service'
import type { SellerContextValue } from '../../src/features/seller/SellerProvider'
import { createSellerValue, makeFailureResponse, makePostgrestError, makeSellerProfile, makeSuccessResponse, renderWithSeller } from '../utils/seller'
import { createAuthValue, makeUser, renderWithAuth } from '../utils/auth'

vi.mock('../../src/features/seller/seller.service', () => ({
  createSellerApplication: vi.fn(),
  getMySellerProfile: vi.fn(),
}))

const mockedCreate = vi.mocked(createSellerApplication)

function renderOnboarding(value: SellerContextValue) {
  const authValue = createAuthValue({
    status: 'authenticated',
    isAuthenticated: true,
    user: makeUser('user-1'),
  })
  return render(
    renderWithAuth(
      renderWithSeller(
        <MemoryRouter initialEntries={['/seller/onboarding']}>
          <Routes>
            <Route path="/seller/onboarding" element={<SellerOnboardingPage />} />
            <Route path="/seller/status" element={<div>STATUS PAGE</div>} />
            <Route path="/seller/dashboard" element={<div>DASHBOARD PAGE</div>} />
          </Routes>
        </MemoryRouter>,
        value,
      ),
      authValue,
    ),
  )
}

function fillStoreName(name: string) {
  fireEvent.change(screen.getByLabelText(/Store name/i), { target: { value: name } })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('SellerOnboardingPage', () => {
  it('redirects users who already have a seller profile', async () => {
    renderOnboarding(
      createSellerValue({ sellerProfile: makeSellerProfile({ seller_status: 'pending' }) }),
    )
    expect(await screen.findByText('STATUS PAGE')).toBeInTheDocument()
  })

  it('redirects active sellers straight to the seller dashboard', async () => {
    renderOnboarding(
      createSellerValue({ sellerProfile: makeSellerProfile({ seller_status: 'active' }) }),
    )
    expect(await screen.findByText('DASHBOARD PAGE')).toBeInTheDocument()
  })

  it('shows a validation error when the store name is missing', async () => {
    renderOnboarding(createSellerValue())
    fireEvent.click(screen.getByRole('button', { name: /Submit application/i }))

    expect(screen.getByText('Store name is required.')).toBeInTheDocument()
    expect(mockedCreate).not.toHaveBeenCalled()
  })

  it('submits the application with the session user id and safe fields only', async () => {
    mockedCreate.mockResolvedValue(
      makeSuccessResponse(makeSellerProfile({ seller_status: 'pending' })),
    )
    renderOnboarding(createSellerValue())

    fillStoreName('Ace Paddles PH')
    fireEvent.change(screen.getByLabelText(/Description/i), {
      target: { value: 'Fresh paddles.' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Submit application/i }))

    await waitFor(() =>
      expect(mockedCreate).toHaveBeenCalledWith('user-1', {
        store_name: 'Ace Paddles PH',
        description: 'Fresh paddles.',
        city: '',
        province: '',
        pickup_available: false,
        delivery_available: false,
        pickup_location: '',
        pickup_instructions: '',
      }),
    )
    expect(await screen.findByText('STATUS PAGE')).toBeInTheDocument()
  })

  it('prevents double submission while a request is in flight', async () => {
    let release: ((value: Awaited<ReturnType<typeof createSellerApplication>>) => void) | null =
      null
    mockedCreate.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve
        }),
    )
    renderOnboarding(createSellerValue())

    fillStoreName('Ace Paddles PH')
    fireEvent.click(screen.getByRole('button', { name: /Submit application/i }))

    expect(screen.getByRole('button', { name: /Submitting application/i })).toBeDisabled()
    expect(mockedCreate).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: /Submitting application/i }))
    expect(mockedCreate).toHaveBeenCalledTimes(1)

    await act(async () => {
      release?.(makeSuccessResponse(makeSellerProfile({ seller_status: 'pending' })))
    })
  })

  it('handles a duplicate application error by routing to the status page', async () => {
    const refreshSellerProfile = vi.fn(async () => undefined)
    mockedCreate.mockResolvedValue(
      makeFailureResponse(makePostgrestError('duplicate key value', '23505')),
    )
    renderOnboarding(createSellerValue({ refreshSellerProfile }))

    fillStoreName('Ace Paddles PH')
    fireEvent.click(screen.getByRole('button', { name: /Submit application/i }))

    await waitFor(() => expect(refreshSellerProfile).toHaveBeenCalledTimes(1))
    expect(await screen.findByText('STATUS PAGE')).toBeInTheDocument()
  })

  it('shows a friendly error when submission fails', async () => {
    mockedCreate.mockResolvedValue(makeFailureResponse(makePostgrestError('connection reset')))
    renderOnboarding(createSellerValue())

    fillStoreName('Ace Paddles PH')
    fireEvent.click(screen.getByRole('button', { name: /Submit application/i }))

    expect(await screen.findByText('connection reset')).toBeInTheDocument()
    expect(screen.queryByText('STATUS PAGE')).not.toBeInTheDocument()
  })
})
