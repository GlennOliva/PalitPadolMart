import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import ProtectedRoute from '../../src/components/auth/ProtectedRoute'
import type { AuthContextValue } from '../../src/features/auth/AuthProvider'
import { createAuthValue, makeProfile, makeUser, renderWithAuth } from '../utils/auth'

function renderProtected(initialEntry: string, value: AuthContextValue) {
  const router = createMemoryRouter(
    [
      {
        path: '/dashboard',
        element: <ProtectedRoute />,
        children: [{ index: true, element: <div>SECRET CONTENT</div> }],
      },
      { path: '/login', element: <div>LOGIN PAGE</div> },
      { path: '/account-suspended', element: <div>SUSPENDED PAGE</div> },
    ],
    { initialEntries: [initialEntry] },
  )
  render(renderWithAuth(<RouterProvider router={router} />, value))
}

const authenticatedValue = createAuthValue({
  status: 'authenticated',
  isAuthenticated: true,
  user: makeUser(),
  profile: makeProfile(),
})

describe('ProtectedRoute', () => {
  it('shows a spinner while the session is initializing', () => {
    renderProtected('/dashboard', createAuthValue({ status: 'initializing' }))
    expect(screen.getByText('Checking your session…')).toBeInTheDocument()
    expect(screen.queryByText('SECRET CONTENT')).not.toBeInTheDocument()
  })

  it('redirects guests to /login', async () => {
    renderProtected('/dashboard', createAuthValue({ status: 'unauthenticated' }))
    expect(await screen.findByText('LOGIN PAGE')).toBeInTheDocument()
    expect(screen.queryByText('SECRET CONTENT')).not.toBeInTheDocument()
  })

  it('shows a spinner while the profile is loading', () => {
    renderProtected(
      '/dashboard',
      createAuthValue({
        status: 'authenticated',
        isAuthenticated: true,
        user: makeUser(),
        profileLoading: true,
      }),
    )
    expect(screen.getByText('Loading your profile…')).toBeInTheDocument()
  })

  it('shows the profile-unavailable state with a retry when the profile is missing', () => {
    const refreshProfile = vi.fn(async () => undefined)
    renderProtected(
      '/dashboard',
      createAuthValue({
        status: 'authenticated',
        isAuthenticated: true,
        user: makeUser(),
        profile: null,
        profileError: 'We could not load your profile.',
        refreshProfile,
      }),
    )
    expect(
      screen.getByRole('heading', { name: 'Your profile is not available' }),
    ).toBeInTheDocument()
    const retry = screen.getByRole('button', { name: 'Try again' })
    retry.click()
    expect(refreshProfile).toHaveBeenCalledTimes(1)
  })

  it('renders protected content for an active account', () => {
    renderProtected('/dashboard', authenticatedValue)
    expect(screen.getByText('SECRET CONTENT')).toBeInTheDocument()
  })

  it('redirects suspended and deactivated accounts', async () => {
    renderProtected(
      '/dashboard',
      createAuthValue({
        status: 'authenticated',
        isAuthenticated: true,
        user: makeUser(),
        profile: makeProfile({ account_status: 'suspended' }),
      }),
    )
    expect(await screen.findByText('SUSPENDED PAGE')).toBeInTheDocument()
  })
})
