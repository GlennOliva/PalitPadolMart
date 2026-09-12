import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import AppLayout from '../../src/components/layout/AppLayout'
import type { AuthContextValue } from '../../src/features/auth/AuthProvider'
import type { SellerContextValue } from '../../src/features/seller/SellerProvider'
import { createSellerValue, makeSellerProfile, renderWithSeller } from '../utils/seller'
import { createAuthValue, makeProfile, makeUser, renderWithAuth } from '../utils/auth'
import { createCartValue, renderWithCart } from '../utils/cart'

function renderLayout(value: AuthContextValue, sellerValue: SellerContextValue) {
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: <AppLayout />,
        children: [{ index: true, element: <div>HOME PAGE</div> }],
      },
    ],
    { initialEntries: ['/'] },
  )
  return render(
    renderWithAuth(renderWithSeller(renderWithCart(<RouterProvider router={router} />, createCartValue()), sellerValue), value),
  )
}

function signedIn() {
  return createAuthValue({
    status: 'authenticated',
    isAuthenticated: true,
    user: makeUser(),
    profile: makeProfile(),
  })
}

describe('AppLayout', () => {
  it('shows guest links when signed out', () => {
    renderLayout(createAuthValue({ status: 'unauthenticated' }), createSellerValue())

    expect(screen.getByRole('link', { name: /Sign in/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Register/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Log out/i })).not.toBeInTheDocument()
  })

  it('shows account links and display name when signed in', () => {
    const profile = makeProfile({ display_name: 'Ace Player' })
    renderLayout(
      createAuthValue({
        status: 'authenticated',
        isAuthenticated: true,
        user: makeUser(),
        profile,
      }),
      createSellerValue(),
    )

    expect(screen.getByRole('link', { name: /Dashboard/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Profile/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Preferences/i })).toBeInTheDocument()
    expect(screen.getByText('Ace Player')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Sign in/i })).not.toBeInTheDocument()
  })

  it('calls signOut when the user clicks Log out', () => {
    const signOut = vi.fn(async () => undefined)
    renderLayout(
      createAuthValue({
        status: 'authenticated',
        isAuthenticated: true,
        user: makeUser(),
        profile: makeProfile(),
        signOut,
      }),
      createSellerValue(),
    )

    fireEvent.click(screen.getByRole('button', { name: /Log out/i }))
    expect(signOut).toHaveBeenCalledTimes(1)
  })

  it('links users without a seller profile to seller onboarding', () => {
    renderLayout(signedIn(), createSellerValue())

    expect(screen.getByRole('link', { name: 'Become a Seller' })).toHaveAttribute(
      'href',
      '/seller/onboarding',
    )
  })

  it('links active sellers to the seller dashboard', () => {
    renderLayout(
      signedIn(),
      createSellerValue({ sellerProfile: makeSellerProfile({ seller_status: 'active' }) }),
    )

    expect(screen.getByRole('link', { name: 'Seller Dashboard' })).toHaveAttribute(
      'href',
      '/seller/dashboard',
    )
  })

  it('links pending sellers to their application status', () => {
    renderLayout(
      signedIn(),
      createSellerValue({ sellerProfile: makeSellerProfile({ seller_status: 'pending' }) }),
    )

    expect(screen.getByRole('link', { name: 'Seller Application' })).toHaveAttribute(
      'href',
      '/seller/status',
    )
  })

  it('links rejected and suspended sellers to their status page', () => {
    for (const status of ['rejected', 'suspended'] as const) {
      const { unmount } = renderLayout(
        signedIn(),
        createSellerValue({ sellerProfile: makeSellerProfile({ seller_status: status }) }),
      )
      expect(screen.getByRole('link', { name: 'Seller Status' })).toHaveAttribute(
        'href',
        '/seller/status',
      )
      unmount()
    }
  })

  it('shows a neutral seller link while the seller profile is loading', () => {
    renderLayout(signedIn(), createSellerValue({ sellerLoading: true }))

    expect(screen.getByRole('link', { name: 'Seller' })).toHaveAttribute('href', '/seller')
  })

  it('toggles the mobile navigation menu', () => {
    renderLayout(createAuthValue({ status: 'unauthenticated' }), createSellerValue())

    const toggle = screen.getByRole('button', { name: /Open menu/i })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(toggle)
    expect(screen.getByRole('button', { name: /Close menu/i })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
    expect(document.getElementById('site-nav')).toHaveClass('site-nav--open')

    fireEvent.click(screen.getByRole('button', { name: /Close menu/i }))
    expect(document.getElementById('site-nav')).not.toHaveClass('site-nav--open')
  })

  it('contains drawer focus and restores it when Escape closes the menu', () => {
    renderLayout(createAuthValue({ status: 'unauthenticated' }), createSellerValue())

    const toggle = screen.getByRole('button', { name: /Open menu/i })
    fireEvent.click(toggle)

    expect(screen.getByRole('button', { name: 'Dismiss menu' })).toHaveFocus()
    fireEvent.keyDown(document, { key: 'Escape' })

    expect(document.getElementById('site-nav')).not.toHaveClass('site-nav--open')
    expect(screen.getByRole('button', { name: /Open menu/i })).toHaveFocus()
  })
})
