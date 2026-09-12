import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import ApplicationErrorPage from '../../src/components/common/ApplicationErrorPage'

describe('ApplicationErrorPage', () => {
  it('renders a 404 heading and guidance for route errors', async () => {
    const router = createMemoryRouter(
      [
        {
          path: '/',
          errorElement: <ApplicationErrorPage />,
          children: [
            {
              path: '*',
              loader: () => {
                throw new Response('Not found', {
                  status: 404,
                  statusText: 'Not Found',
                })
              },
              element: <div>NEVER RENDERED</div>,
            },
          ],
        },
      ],
      { initialEntries: ['/nope'] },
    )

    render(<RouterProvider router={router} />)

    expect(
      await screen.findByRole('heading', { name: /404 — Not Found/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: /Return home/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /Try again/i }),
    ).toBeInTheDocument()
  })

  it('renders a generic message for unexpected errors', async () => {
    const router = createMemoryRouter(
      [
        {
          path: '/',
          errorElement: <ApplicationErrorPage />,
          children: [
            {
              path: '*',
              loader: () => {
                throw new Error('unexpected failure')
              },
              element: <div>NEVER RENDERED</div>,
            },
          ],
        },
      ],
      { initialEntries: ['/boom'] },
    )

    render(<RouterProvider router={router} />)

    expect(
      await screen.findByRole('heading', { name: /Something went wrong/i }),
    ).toBeInTheDocument()
  })
})
