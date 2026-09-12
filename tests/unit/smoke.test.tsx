import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import AppLayout from '../../src/components/layout/AppLayout'
import HomePage from '../../src/pages/HomePage'
import NotFoundPage from '../../src/pages/NotFoundPage'
import { createAuthValue, renderWithAuth } from '../utils/auth'
import { createSellerValue, renderWithSeller } from '../utils/seller'
import { createCartValue, renderWithCart } from '../utils/cart'

function createAppRouter(initialEntry: string) {
  return createMemoryRouter(
    [
      {
        path: '/',
        element: <AppLayout />,
        children: [
          { index: true, element: <HomePage /> },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
    { initialEntries: [initialEntry] },
  )
}

function renderShell(initialEntry: string) {
  const value = createAuthValue({ status: 'unauthenticated' })
  render(
    renderWithAuth(
      renderWithSeller(
        renderWithCart(<RouterProvider router={createAppRouter(initialEntry)} />, createCartValue()),
        createSellerValue(),
      ),
      value,
    ),
  )
}

describe('application shell', () => {
  it('renders the branded layout with the home page for the root route', () => {
    renderShell('/')

    expect(
      screen.getByRole('link', { name: /PalitPaddleBai Mart/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: /Buy\. Sell\. Play Better\./i }),
    ).toBeInTheDocument()
  })

  it('renders the not-found page for unknown routes', () => {
    renderShell('/does-not-exist')

    expect(
      screen.getByRole('heading', { name: /Page not found/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: /Return home/i }),
    ).toBeInTheDocument()
  })
})
