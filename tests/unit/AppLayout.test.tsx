import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import AppLayout from '../../src/components/layout/AppLayout'
import type { AuthContextValue } from '../../src/features/auth/AuthProvider'
import { createAuthValue, makeProfile, makeUser, renderWithAuth } from '../utils/auth'

function renderLayout(value: AuthContextValue) {
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
  render(renderWithAuth(<RouterProvider router={router} />, value))
}

describe('AppLayout', () => {
  it('shows guest links when signed out', () => {
    renderLayout(createAuthValue({ status: 'unauthenticated' }))

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
    )

    fireEvent.click(screen.getByRole('button', { name: /Log out/i }))
    expect(signOut).toHaveBeenCalledTimes(1)
  })
})
