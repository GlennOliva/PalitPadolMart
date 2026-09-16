import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import AdminReportCenterPage from '../../src/pages/admin/AdminReportCenterPage'

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/admin/report-center']}>
      <AdminReportCenterPage />
    </MemoryRouter>,
  )
}

describe('AdminReportCenterPage', () => {
  it('lists the expected printable reports with destinations', () => {
    renderPage()
    expect(screen.getByRole('heading', { name: 'Report Center' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Executive Report/ })).toHaveAttribute('href', '/admin')
    expect(screen.getByRole('link', { name: /Sales & Revenue Report/ })).toHaveAttribute('href', '/admin/analytics')
    expect(screen.getByRole('link', { name: /Payments Report/ })).toHaveAttribute('href', '/admin/payments')
    expect(screen.getByRole('link', { name: /Disputes Report/ })).toHaveAttribute('href', '/admin/disputes')
    expect(screen.getByRole('link', { name: /Refunds Report/ })).toHaveAttribute('href', '/admin/refunds')
  })

  it('exposes a Print Report Directory action', async () => {
    const printSpy = vi.fn()
    Object.defineProperty(window, 'print', { value: printSpy, configurable: true, writable: true })
    renderPage()
    screen.getByRole('button', { name: 'Print Report Directory' }).click()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(printSpy).toHaveBeenCalledTimes(1)
  })
})