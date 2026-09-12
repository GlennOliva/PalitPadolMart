import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import SellerRoute from '../../src/components/seller/SellerRoute'
import type { SellerContextValue } from '../../src/features/seller/SellerProvider'
import { createSellerValue, makeSellerProfile, renderWithSeller } from '../utils/seller'

function renderSellerRoute(initialEntry: string, value: SellerContextValue) {
  const router = createMemoryRouter(
    [
      {
        path: '/seller',
        element: <SellerRoute />,
        children: [{ index: true, element: <div>SELLER TOOLS CONTENT</div> }],
      },
      { path: '/seller/onboarding', element: <div>ONBOARDING PAGE</div> },
      { path: '/seller/status', element: <div>STATUS PAGE</div> },
    ],
    { initialEntries: [initialEntry] },
  )
  render(renderWithSeller(<RouterProvider router={router} />, value))
}

describe('SellerRoute', () => {
  it('shows a spinner while the seller profile is loading', () => {
    renderSellerRoute('/seller', createSellerValue({ sellerLoading: true }))
    expect(screen.getByText('Loading your seller account…')).toBeInTheDocument()
    expect(screen.queryByText('SELLER TOOLS CONTENT')).not.toBeInTheDocument()
  })

  it('redirects users without a seller profile to onboarding', async () => {
    renderSellerRoute('/seller', createSellerValue())
    expect(await screen.findByText('ONBOARDING PAGE')).toBeInTheDocument()
    expect(screen.queryByText('SELLER TOOLS CONTENT')).not.toBeInTheDocument()
  })

  it('redirects pending sellers to the status page', async () => {
    renderSellerRoute(
      '/seller',
      createSellerValue({ sellerProfile: makeSellerProfile({ seller_status: 'pending' }) }),
    )
    expect(await screen.findByText('STATUS PAGE')).toBeInTheDocument()
  })

  it('redirects rejected sellers to the status page', async () => {
    renderSellerRoute(
      '/seller',
      createSellerValue({ sellerProfile: makeSellerProfile({ seller_status: 'rejected' }) }),
    )
    expect(await screen.findByText('STATUS PAGE')).toBeInTheDocument()
  })

  it('redirects suspended sellers to the status page', async () => {
    renderSellerRoute(
      '/seller',
      createSellerValue({ sellerProfile: makeSellerProfile({ seller_status: 'suspended' }) }),
    )
    expect(await screen.findByText('STATUS PAGE')).toBeInTheDocument()
  })

  it('renders seller tools for active sellers', () => {
    renderSellerRoute(
      '/seller',
      createSellerValue({ sellerProfile: makeSellerProfile({ seller_status: 'active' }) }),
    )
    expect(screen.getByText('SELLER TOOLS CONTENT')).toBeInTheDocument()
  })
})
