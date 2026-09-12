import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import ReviewForm from '../../src/components/reviews/ReviewForm'
import { submitReview } from '../../src/features/reviews/reviews.service'

const mocks = vi.hoisted(() => ({ submitReview: vi.fn() }))

vi.mock('../../src/features/reviews/reviews.service', () => ({
  submitReview: mocks.submitReview,
  reviewErrorLabel: (code: string) => {
    switch (code) {
      case 'ORDER_NOT_COMPLETED':
        return 'You can only review items from completed orders.'
      case 'INVALID_RATING':
        return 'Please choose a product rating between 1 and 5.'
      default:
        return 'Something went wrong. Please try again.'
    }
  },
}))

const mockedSubmit = vi.mocked(submitReview)

function pickRating(label: string, value: number) {
  const name = label === 'Product rating' ? 'review-product-rating' : 'review-seller-rating'
  const radios = screen.getAllByRole('radio') as HTMLElement[]
  const radio = radios.find((node) => node.getAttribute('name') === name && (node as HTMLInputElement).value === String(value))
  if (radio != null) fireEvent.click(radio)
  return radio
}

const onSuccess = vi.fn()

beforeEach(() => {
  mockedSubmit.mockReset()
  onSuccess.mockReset()
})

describe('ReviewForm', () => {

  it('submits ratings and a comment through the service RPC', async () => {
    mockedSubmit.mockResolvedValueOnce({
      data: { id: 'rev-1', orderItemId: 'item-1', orderId: 'order-1', productRating: 5, sellerRating: 4, comment: 'Great' },
      error: null,
    })
    render(<ReviewForm orderItemId="item-1" productTitle="Selkirk Amped Epic" onSuccess={onSuccess} />)

    pickRating('Product rating', 5)
    pickRating('Seller rating', 4)
    fireEvent.change(screen.getByLabelText('Review', { selector: 'textarea' }), {
      target: { value: 'Great paddle' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Submit review' }))

    await waitFor(() => {
      expect(mockedSubmit).toHaveBeenCalledWith({
        orderItemId: 'item-1',
        productRating: 5,
        sellerRating: 4,
        comment: 'Great paddle',
      })
    })
    await waitFor(() => expect(onSuccess).toHaveBeenCalled())
  })

  it('does not submit until both ratings are chosen', async () => {
    render(<ReviewForm orderItemId="item-1" productTitle="Selkirk Amped Epic" onSuccess={onSuccess} />)

    fireEvent.click(screen.getByRole('button', { name: 'Submit review' }))

    expect(mockedSubmit).not.toHaveBeenCalled()
    expect(screen.getByText(/product rating from 1 to 5 stars/)).toBeInTheDocument()
    expect(screen.getByText(/seller rating from 1 to 5 stars/)).toBeInTheDocument()
  })

  it('surfaces a server-side structured error to the buyer', async () => {
    mockedSubmit.mockResolvedValueOnce({
      data: null,
      error: { code: 'ORDER_NOT_COMPLETED', message: 'You can only review items from completed orders.' },
    })
    render(<ReviewForm orderItemId="item-1" productTitle="Selkirk Amped Epic" onSuccess={onSuccess} />)

    pickRating('Product rating', 4)
    pickRating('Seller rating', 4)
    fireEvent.click(screen.getByRole('button', { name: 'Submit review' }))

    expect(
      await screen.findByText('You can only review items from completed orders.'),
    ).toBeInTheDocument()
    expect(onSuccess).not.toHaveBeenCalled()
  })

  it('shows the product title being reviewed', () => {
    render(<ReviewForm orderItemId="item-1" productTitle="Selkirk Amped Epic" onSuccess={onSuccess} />)
    expect(screen.getByText('Reviewing: Selkirk Amped Epic')).toBeInTheDocument()
  })
})