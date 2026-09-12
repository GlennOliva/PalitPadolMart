import { describe, it, expect, beforeEach, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import SellerProfilePage from '../../src/pages/seller/SellerProfilePage'
import {
  getPublicLogoUrl,
  updateMySellerProfile,
  uploadSellerLogo,
} from '../../src/features/seller/seller.service'
import type { SellerContextValue } from '../../src/features/seller/SellerProvider'
import { createSellerValue, makeSellerProfile, makeSuccessResponse, renderWithSeller } from '../utils/seller'
import { createAuthValue, makeUser, renderWithAuth } from '../utils/auth'

vi.mock('../../src/features/seller/seller.service', () => ({
  getMySellerProfile: vi.fn(),
  getPublicLogoUrl: vi.fn(),
  updateMySellerProfile: vi.fn(),
  uploadSellerLogo: vi.fn(),
  removeSellerLogo: vi.fn(),
}))

const mockedUpdate = vi.mocked(updateMySellerProfile)
const mockedUpload = vi.mocked(uploadSellerLogo)
const mockedPublicUrl = vi.mocked(getPublicLogoUrl)

function renderProfile(value: SellerContextValue) {
  const authValue = createAuthValue({
    status: 'authenticated',
    isAuthenticated: true,
    user: makeUser('user-1'),
  })
  return render(
    renderWithAuth(
      renderWithSeller(
        <MemoryRouter initialEntries={['/seller/profile']}>
          <Routes>
            <Route path="/seller/profile" element={<SellerProfilePage />} />
            <Route path="/seller/dashboard" element={<div>DASHBOARD PAGE</div>} />
            <Route path="/sellers/:sellerId" element={<div>PUBLIC PROFILE PAGE</div>} />
          </Routes>
        </MemoryRouter>,
        value,
      ),
      authValue,
    ),
  )
}

const activeSeller = createSellerValue({
  sellerProfile: makeSellerProfile({ seller_status: 'active' }),
})

beforeEach(() => {
  vi.clearAllMocks()
  mockedPublicUrl.mockReturnValue(null)
})

describe('SellerProfilePage', () => {
  it('renders the seller fields and read-only status', () => {
    renderProfile(activeSeller)

    expect(screen.getByLabelText(/Store name/i)).toHaveValue('Ace Paddles PH')
    expect(screen.getByText('Active')).toBeInTheDocument()
    expect(screen.getByText(/managed by administrators/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Pickup available/i)).toBeChecked()
    expect(screen.getByLabelText(/Delivery available/i)).not.toBeChecked()
  })

  it('rejects an unsupported logo type before uploading', () => {
    renderProfile(activeSeller)

    const input = screen.getByLabelText(/Upload logo/i) as HTMLInputElement
    fireEvent.change(input, {
      target: { files: [new File([new ArrayBuffer(8)], 'logo.gif', { type: 'image/gif' })] },
    })

    expect(screen.getByText('Only JPEG, PNG, or WebP images are allowed.')).toBeInTheDocument()
    expect(mockedUpload).not.toHaveBeenCalled()
  })

  it('saves the safe fields and refreshes the profile', async () => {
    const refreshSellerProfile = vi.fn(async () => undefined)
    mockedUpdate.mockResolvedValue(makeSuccessResponse(makeSellerProfile()))
    renderProfile(createSellerValue({ ...activeSeller, refreshSellerProfile }))

    fireEvent.click(screen.getByRole('button', { name: /Save changes/i }))

    expect(await screen.findByText('Your seller profile has been updated.')).toBeInTheDocument()
    expect(mockedUpdate).toHaveBeenCalledWith('user-1', {
      store_name: 'Ace Paddles PH',
      description: 'Quality paddles at fair prices.',
      city: 'Cebu City',
      province: 'Cebu',
      pickup_available: true,
      delivery_available: false,
      pickup_location: 'Metro Park, Dumanjug',
      pickup_instructions: 'Look for the white van.',
    })
    expect(refreshSellerProfile).toHaveBeenCalledTimes(1)
  })

  it('shows a validation error and does not save when the store name is blank', async () => {
    renderProfile(activeSeller)

    fireEvent.change(screen.getByLabelText(/Store name/i), { target: { value: '   ' } })
    fireEvent.click(screen.getByRole('button', { name: /Save changes/i }))

    expect(screen.getByText('Store name is required.')).toBeInTheDocument()
    expect(mockedUpdate).not.toHaveBeenCalled()
  })

  it('uploads a valid logo and refreshes the profile', async () => {
    const refreshSellerProfile = vi.fn(async () => undefined)
    mockedUpload.mockResolvedValue({ path: 'seller-1/logo/logo.png', error: null })
    renderProfile(createSellerValue({ ...activeSeller, refreshSellerProfile }))

    const input = screen.getByLabelText(/Upload logo/i) as HTMLInputElement
    fireEvent.change(input, {
      target: {
        files: [new File([new ArrayBuffer(8)], 'logo.png', { type: 'image/png' })],
      },
    })

    await waitFor(() => expect(mockedUpload).toHaveBeenCalledTimes(1))
    expect(mockedUpload).toHaveBeenCalledWith(
      'seller-1',
      'user-1',
      expect.objectContaining({ name: 'logo.png' }),
    )
    expect(refreshSellerProfile).toHaveBeenCalledTimes(1)
  })
})
