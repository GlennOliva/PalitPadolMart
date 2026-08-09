import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import AppLayout from '../../src/components/layout/AppLayout'
import HomePage from '../../src/pages/HomePage'
import NotFoundPage from '../../src/pages/NotFoundPage'
import { createAuthValue, renderWithAuth } from '../utils/auth'

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

describe('application shell', () => {
  it('renders the branded layout with the home page for the root route', () => {
    const value = createAuthValue({ status: 'unauthenticated' })
    render(renderWithAuth(<RouterProvider router={createAppRouter('/')} />, value))

    expect(
      screen.getByRole('link', { name: /PalitPaddleBai Mart/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: /Welcome to PalitPaddleBai Mart/i }),
    ).toBeInTheDocument()
  })

  it('renders the not-found page for unknown routes', () => {
    const value = createAuthValue({ status: 'unauthenticated' })
    render(
      renderWithAuth(<RouterProvider router={createAppRouter('/does-not-exist')} />, value),
    )

    expect(
      screen.getByRole('heading', { name: /Page not found/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: /Back to home/i }),
    ).toBeInTheDocument()
  })
})
