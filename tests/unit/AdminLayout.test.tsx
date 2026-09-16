import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import AdminLayout from '../../src/components/admin/AdminLayout'

const expectedLinks = [
  ['Dashboard', '/admin'],
  ['Users', '/admin/users'],
  ['Sellers', '/admin/sellers'],
  ['Listings', '/admin/listings'],
  ['Reports', '/admin/reports'],
  ['Reviews', '/admin/reviews'],
  ['Orders', '/admin/orders'],
  ['Payments', '/admin/payments'],
  ['Disputes', '/admin/disputes'],
  ['Refunds', '/admin/refunds'],
  ['Audit Logs', '/admin/audit-logs'],
  ['Categories', '/admin/categories'],
  ['Brands', '/admin/brands'],
] as const

function renderAdminLayout() {
  const router = createMemoryRouter(
    [
      {
        path: '/admin',
        element: <AdminLayout />,
        children: [
          { index: true, element: <h1>ADMIN DASHBOARD PAGE</h1> },
          { path: 'users', element: <h1>USERS PAGE</h1> },
        ],
      },
    ],
    { initialEntries: ['/admin'] },
  )

  render(<RouterProvider router={router} />)
}

describe('AdminLayout and AdminNav', () => {
  it('renders its outlet and every administration destination once', () => {
    renderAdminLayout()

    expect(screen.getByRole('heading', { name: 'ADMIN DASHBOARD PAGE' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Administration sections' })).toBeInTheDocument()
    for (const [name, href] of expectedLinks) {
      expect(screen.getByRole('link', { name })).toHaveAttribute('href', href)
    }
  })

  it('exposes mobile menu state and restores toggle focus after Escape', async () => {
    renderAdminLayout()

    const toggle = screen.getByRole('button', { name: /Menu/i })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(toggle)
    expect(screen.getByRole('button', { name: /Close/i })).toHaveAttribute('aria-expanded', 'true')

    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.getByRole('button', { name: /Menu/i })).toHaveFocus())
    expect(screen.getByRole('button', { name: /Menu/i })).toHaveAttribute('aria-expanded', 'false')
  })

  it('closes the mobile menu after navigation', async () => {
    renderAdminLayout()

    fireEvent.click(screen.getByRole('button', { name: /Menu/i }))
    fireEvent.click(screen.getByRole('link', { name: 'Users' }))

    expect(await screen.findByRole('heading', { name: 'USERS PAGE' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Menu/i })).toHaveAttribute('aria-expanded', 'false')
  })
})
