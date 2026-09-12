import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import SellerPaymentSettingsPage from '../../src/pages/seller/SellerPaymentSettingsPage'
import {
  getSellerPaymentMethods,
  setSellerPaymentMethod,
} from '../../src/features/orders/payments.service'
import { makeUser, createAuthValue, renderWithAuth } from '../utils/auth'
import { createSellerValue, makeSellerProfile, renderWithSeller } from '../utils/seller'

vi.mock('../../src/features/orders/payments.service', () => ({
  getSellerPaymentMethods: vi.fn(),
  setSellerPaymentMethod: vi.fn(),
  submitOrderPayment: vi.fn(),
  approveOrderPayment: vi.fn(),
  rejectOrderPayment: vi.fn(),
  markCashReceived: vi.fn(),
  uploadPaymentProof: vi.fn(),
  paymentProofUrl: vi.fn(),
}))

vi.mock('../../src/features/orders/orders.service', () => ({
  orderErrorLabel: (code: string) => `ERR:${code}`,
}))

const mockedGet = vi.mocked(getSellerPaymentMethods)
const mockedSet = vi.mocked(setSellerPaymentMethod)

const methods = [
  {
    id: 'spm-1',
    seller_id: 'seller-1',
    method: 'manual_transfer',
    is_enabled: true,
    instructions: 'GCash 09171234567',
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
  },
  {
    id: 'spm-2',
    seller_id: 'seller-1',
    method: 'cash_on_pickup',
    is_enabled: false,
    instructions: null,
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
  },
  {
    id: 'spm-3',
    seller_id: 'seller-1',
    method: 'cash_on_delivery',
    is_enabled: true,
    instructions: null,
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
  },
]

function renderPage() {
  return render(
    renderWithAuth(
      renderWithSeller(
        <MemoryRouter initialEntries={['/seller/payment-methods']}>
          <Routes>
            <Route
              path="/seller/payment-methods"
              element={<SellerPaymentSettingsPage />}
            />
            <Route path="/seller/dashboard" element={<div>DASHBOARD PAGE</div>} />
          </Routes>
        </MemoryRouter>,
        createSellerValue({
          sellerProfile: makeSellerProfile({ seller_status: 'active' }),
        }),
      ),
      createAuthValue({ user: makeUser() }),
    ),
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedGet.mockResolvedValue({ data: methods, error: null })
  mockedSet.mockResolvedValue({ error: null })
})

describe('SellerPaymentSettingsPage', () => {
  it('shows a loading state while methods are fetched', () => {
    mockedGet.mockReturnValue(new Promise(() => undefined))
    renderPage()
    expect(screen.getByText('Loading your payment methods…')).toBeInTheDocument()
  })

  it('renders each payment method with its saved instructions', async () => {
    renderPage()

    expect(await screen.findByText('Manual transfer')).toBeInTheDocument()
    expect(screen.getByText('Cash on pickup')).toBeInTheDocument()
    expect(screen.getByText('Cash on delivery')).toBeInTheDocument()

    const manualTextarea = screen.getAllByLabelText('Instructions')[0] as HTMLTextAreaElement
    expect(manualTextarea.value).toBe('GCash 09171234567')
  })

  it('requires transfer details before saving', async () => {
    renderPage()

    await screen.findByText('Manual transfer')
    const manualTextarea = screen.getAllByLabelText('Instructions')[0] as HTMLTextAreaElement
    fireEvent.change(manualTextarea, { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save payment methods' }))

    expect(
      await screen.findByText(/Add your transfer details/),
    ).toBeInTheDocument()
    expect(mockedSet).not.toHaveBeenCalled()
  })

  it('saves all three methods when valid', async () => {
    renderPage()

    await screen.findByText('Manual transfer')
    const manualTextarea = screen.getAllByLabelText('Instructions')[0] as HTMLTextAreaElement
    fireEvent.change(manualTextarea, { target: { value: 'GCash 0999' } })

    fireEvent.click(screen.getByRole('button', { name: 'Save payment methods' }))

    expect(await screen.findByText(/payment methods were updated/)).toBeInTheDocument()
    expect(mockedSet).toHaveBeenCalledTimes(3)
    expect(mockedSet).toHaveBeenCalledWith('seller-1', 'manual_transfer', true, 'GCash 0999')
    expect(mockedSet).toHaveBeenCalledWith('seller-1', 'cash_on_pickup', false, '')
  })

  it('shows an error banner when a save fails', async () => {
    mockedSet.mockResolvedValue({ error: { code: 'FORBIDDEN', message: 'no' } })
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: 'Save payment methods' }))

    expect(await screen.findByText('ERR:FORBIDDEN')).toBeInTheDocument()
  })

  it('has a back link to the seller dashboard', async () => {
    renderPage()
    expect(
      await screen.findByRole('link', { name: /Back to seller dashboard/i }),
    ).toBeInTheDocument()
  })
})
