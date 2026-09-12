import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import SellerStatusPage from '../../src/pages/seller/SellerStatusPage'
import { createSellerValue, makeSellerProfile, renderWithSeller } from '../utils/seller'

function renderStatus(sellerStatus: 'pending' | 'rejected' | 'suspended' | 'active' | null) {
  const value = createSellerValue({
    sellerProfile: sellerStatus == null ? null : makeSellerProfile({ seller_status: sellerStatus }),
  })
  return render(
    renderWithSeller(
      <MemoryRouter initialEntries={['/seller/status']}>
        <Routes>
          <Route path="/seller/status" element={<SellerStatusPage />} />
          <Route path="/seller/onboarding" element={<div>ONBOARDING PAGE</div>} />
          <Route path="/seller/dashboard" element={<div>DASHBOARD PAGE</div>} />
          <Route path="/dashboard" element={<div>MAIN DASHBOARD</div>} />
        </Routes>
      </MemoryRouter>,
      value,
    ),
  )
}

describe('SellerStatusPage', () => {
  it('redirects to onboarding when there is no seller application', async () => {
    renderStatus(null)
    expect(await screen.findByText('ONBOARDING PAGE')).toBeInTheDocument()
  })

  it('redirects active sellers to the seller dashboard', async () => {
    renderStatus('active')
    expect(await screen.findByText('DASHBOARD PAGE')).toBeInTheDocument()
  })

  it('shows the pending banner and application details', () => {
    renderStatus('pending')

    expect(screen.getAllByText('Pending').length).toBeGreaterThan(0)
    expect(
      screen.getByText(/Your seller application has been received and is under review/i),
    ).toBeInTheDocument()
    expect(screen.getByText('Ace Paddles PH')).toBeInTheDocument()
    expect(screen.getByText(/Pickup/)).toBeInTheDocument()
  })

  it('shows a rejection message for rejected applications', () => {
    renderStatus('rejected')
    expect(screen.getByText(/was not approved/i)).toBeInTheDocument()
  })

  it('shows a suspension message for suspended sellers', () => {
    renderStatus('suspended')
    expect(screen.getByText(/currently suspended/i)).toBeInTheDocument()
  })
})
