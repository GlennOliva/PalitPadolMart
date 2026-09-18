import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import InquiryDetailPage from '../../src/pages/account/InquiryDetailPage'

const { detailMocks, user } = vi.hoisted(() => ({
  detailMocks: {
    getInquiry: vi.fn(),
    getInquiryMessages: vi.fn(),
    getInquiryAttachments: vi.fn(),
    markInquiryRead: vi.fn(),
    sendInquiryReply: vi.fn(),
    closeInquiry: vi.fn(),
  },
  user: { id: 'seller-1', email: 'seller@example.com' },
}))

vi.mock('../../src/features/auth/useAuth', () => ({
  useAuth: () => ({ user, isAuthenticated: true }),
}))

vi.mock('../../src/features/inquiries/inquiries.service', () => ({
  getInquiry: detailMocks.getInquiry,
  getInquiryMessages: detailMocks.getInquiryMessages,
  markInquiryRead: detailMocks.markInquiryRead,
  sendInquiryReply: detailMocks.sendInquiryReply,
  closeInquiry: detailMocks.closeInquiry,
}))

vi.mock('../../src/features/inquiries/inquiry-attachments.service', () => ({
  getInquiryAttachments: detailMocks.getInquiryAttachments,
  uploadInquiryImage: vi.fn(),
  removeInquiryUploads: vi.fn(),
  createInquiryImageFilename: vi.fn(),
  validateInquiryImageFiles: vi.fn(),
}))

function inquiry(overrides: Record<string, unknown> = {}) {
  return {
    id: 'inq-1',
    listing_id: 'list-1',
    listing_title: 'Selkirk Amped Epic',
    buyer_id: 'buyer-1',
    seller_id: 'seller-1',
    subject: 'Is this available?',
    message: 'Hi, is this still for sale?',
    status: 'open',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    seller: { id: 'seller-1', store_name: 'Ace Paddles' },
    buyer_name: 'Juan dela Cruz',
    ...overrides,
  }
}

function message(overrides: Record<string, unknown> = {}) {
  return {
    id: 'm-1',
    inquiry_id: 'inq-1',
    sender_id: 'buyer-1',
    message: 'Yes it is available!',
    is_read: false,
    created_at: '2026-01-02T00:00:00.000Z',
    ...overrides,
  }
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/inquiries/inq-1']}>
      <Routes>
        <Route path="/inquiries/:inquiryId" element={<InquiryDetailPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

function stubOpenThread() {
  detailMocks.getInquiry.mockResolvedValue({ data: inquiry(), error: null })
  detailMocks.getInquiryMessages.mockResolvedValue({ data: [message()], error: null })
  detailMocks.getInquiryAttachments.mockResolvedValue({ data: [], error: null })
  detailMocks.markInquiryRead.mockResolvedValue({ data: null, error: null })
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('InquiryDetailPage', () => {
  it('shows the thread and marks inbound messages read on load', async () => {
    stubOpenThread()

    renderPage()

    expect(screen.getByRole('status', { name: 'Loading conversation…' })).toBeInTheDocument()

    await screen.findByRole('heading', { name: 'Is this available?' })
    const thread = screen.getByRole('region', { name: 'Messages' })
    expect(within(thread).getByText('Yes it is available!')).toBeInTheDocument()

    await waitFor(() => {
      expect(detailMocks.markInquiryRead).toHaveBeenCalledWith('inq-1', 'seller-1')
    })
  })

  it('sends a reply and appends it to the thread', async () => {
    stubOpenThread()
    detailMocks.sendInquiryReply.mockResolvedValue({
      data: message({ id: 'm-2', sender_id: 'seller-1', message: 'Great, it is yours!' }),
      error: null,
    })

    renderPage()

    const textarea = await screen.findByLabelText('Your reply')
    fireEvent.change(textarea, { target: { value: 'Great, it is yours!' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }))

    await waitFor(() => {
      expect(detailMocks.sendInquiryReply).toHaveBeenCalledWith('inq-1', 'Great, it is yours!', [])
    })
    expect(await screen.findByText('Great, it is yours!')).toBeInTheDocument()
  })

  it('shows a validation error for an empty reply', async () => {
    stubOpenThread()

    renderPage()

    const textarea = await screen.findByLabelText('Your reply')
    fireEvent.change(textarea, { target: { value: '   ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }))

    expect(screen.getByText('Type a message or attach an image.')).toBeInTheDocument()
    expect(detailMocks.sendInquiryReply).not.toHaveBeenCalled()
  })

  it('locks a closed conversation and hides the reply form', async () => {
    detailMocks.getInquiry.mockResolvedValue({ data: inquiry({ status: 'closed' }), error: null })
    detailMocks.getInquiryMessages.mockResolvedValue({ data: [message()], error: null })
    detailMocks.markInquiryRead.mockResolvedValue({ data: null, error: null })

    renderPage()

    expect(await screen.findByText('This conversation is closed.')).toBeInTheDocument()
    expect(screen.queryByLabelText('Your reply')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Send message' })).not.toBeInTheDocument()
  })

  it('closes the conversation from the close button', async () => {
    stubOpenThread()
    detailMocks.closeInquiry.mockResolvedValue({ data: null, error: null })

    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: 'Close conversation' }))

    await waitFor(() => {
      expect(detailMocks.closeInquiry).toHaveBeenCalledWith('inq-1')
    })
    expect(await screen.findByText('This conversation is closed.')).toBeInTheDocument()
  })

  it('shows an empty state when the conversation is not found', async () => {
    detailMocks.getInquiry.mockResolvedValue({ data: null, error: null })
    detailMocks.getInquiryMessages.mockResolvedValue({ data: [], error: null })

    renderPage()

    expect(
      await screen.findByRole('heading', { name: 'Conversation not found' }),
    ).toBeInTheDocument()
  })
})
