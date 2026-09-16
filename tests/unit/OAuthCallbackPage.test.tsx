import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import OAuthCallbackPage from '../../src/pages/auth/OAuthCallbackPage'
import { createAuthValue, makeProfile, makeUser, renderWithAuth } from '../utils/auth'

function renderCallback(path: string, auth = createAuthValue()) {
  return render(renderWithAuth(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/auth/callback" element={<OAuthCallbackPage />} />
        <Route path="/dashboard" element={<div>DASHBOARD</div>} />
        <Route path="/orders/:orderId" element={<div>ORDER DETAIL</div>} />
        <Route path="/account-suspended" element={<div>ACCOUNT SUSPENDED</div>} />
      </Routes>
    </MemoryRouter>,
    auth,
  ))
}

describe('OAuthCallbackPage', () => {
  it('waits while Supabase restores the callback session', () => {
    renderCallback('/auth/callback?next=%2Fdashboard', createAuthValue({ status: 'initializing' }))
    expect(screen.getByRole('status', { name: /Completing Google sign-in/i })).toBeInTheDocument()
  })

  it('redirects an active account to its validated destination', async () => {
    renderCallback('/auth/callback?next=%2Forders%2Forder-1', createAuthValue({
      status: 'authenticated',
      isAuthenticated: true,
      user: makeUser(),
      profile: makeProfile(),
    }))
    expect(await screen.findByText('ORDER DETAIL')).toBeInTheDocument()
  })

  it('rejects an external callback destination', async () => {
    renderCallback('/auth/callback?next=https%3A%2F%2Fevil.example', createAuthValue({
      status: 'authenticated',
      isAuthenticated: true,
      user: makeUser(),
      profile: makeProfile(),
    }))
    expect(await screen.findByText('DASHBOARD')).toBeInTheDocument()
  })

  it.each(['suspended', 'deactivated'] as const)('keeps a %s account blocked', async (account_status) => {
    renderCallback('/auth/callback?next=%2Fdashboard', createAuthValue({
      status: 'authenticated',
      isAuthenticated: true,
      user: makeUser(),
      profile: makeProfile({ account_status }),
    }))
    expect(await screen.findByText('ACCOUNT SUSPENDED')).toBeInTheDocument()
  })

  it('shows safe cancellation copy without exposing provider detail', () => {
    const replaceState = vi.spyOn(window.history, 'replaceState')
    renderCallback('/auth/callback?error=access_denied&error_description=private-provider-detail')
    expect(screen.getByRole('alert')).toHaveTextContent(/cancelled/i)
    expect(screen.queryByText(/private-provider-detail/i)).not.toBeInTheDocument()
    expect(replaceState).toHaveBeenCalledWith({}, '', '/auth/callback')
  })

  it('offers profile retry instead of bypassing a failed profile load', () => {
    const refreshProfile = vi.fn(async () => undefined)
    renderCallback('/auth/callback', createAuthValue({
      status: 'authenticated',
      isAuthenticated: true,
      user: makeUser(),
      profileError: 'Profile unavailable',
      refreshProfile,
    }))
    expect(screen.getByRole('heading', { name: /profile is not available/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })

  it('offers profile retry when provisioning returned no profile row', () => {
    const refreshProfile = vi.fn(async () => undefined)
    renderCallback('/auth/callback', createAuthValue({
      status: 'authenticated',
      isAuthenticated: true,
      user: makeUser(),
      profile: null,
      profileLoading: false,
      profileError: null,
      refreshProfile,
    }))
    expect(screen.getByRole('heading', { name: /profile is not available/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })
})
