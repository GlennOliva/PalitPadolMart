import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import AdminRoute from '../../src/components/admin/AdminRoute'
import type { AuthContextValue } from '../../src/features/auth/AuthProvider'
import { createAuthValue, makeProfile, makeUser, renderWithAuth } from '../utils/auth'

function renderAdminRoute(value: AuthContextValue) {
  const router = createMemoryRouter(
    [
      {
        path: '/admin',
        element: <AdminRoute />,
        children: [{ index: true, element: <div>ADMIN CONTENT</div> }],
      },
      { path: '/dashboard', element: <div>ACCOUNT DASHBOARD</div> },
    ],
    { initialEntries: ['/admin'] },
  )

  render(renderWithAuth(<RouterProvider router={router} />, value))
}

describe('AdminRoute', () => {
  it('does not render admin content while the profile is loading', () => {
    renderAdminRoute(
      createAuthValue({
        status: 'authenticated',
        isAuthenticated: true,
        user: makeUser(),
        profile: makeProfile({}, 'admin'),
        profileLoading: true,
      }),
    )

    expect(screen.getByRole('status', { name: 'Checking administrator access...' })).toBeInTheDocument()
    expect(screen.queryByText('ADMIN CONTENT')).not.toBeInTheDocument()
  })

  it('shows a safe forbidden state to a non-admin', () => {
    renderAdminRoute(
      createAuthValue({
        status: 'authenticated',
        isAuthenticated: true,
        user: makeUser(),
        profile: makeProfile(),
      }),
    )

    expect(
      screen.getByRole('heading', { name: 'Administrator access required' }),
    ).toBeInTheDocument()
    expect(screen.getByText('403')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Return to dashboard' })).toHaveAttribute(
      'href',
      '/dashboard',
    )
    expect(screen.queryByText('ADMIN CONTENT')).not.toBeInTheDocument()
  })

  it('renders nested content only for an admin profile', () => {
    renderAdminRoute(
      createAuthValue({
        status: 'authenticated',
        isAuthenticated: true,
        user: makeUser(),
        profile: makeProfile({}, 'admin'),
      }),
    )

    expect(screen.getByText('ADMIN CONTENT')).toBeInTheDocument()
  })
})
