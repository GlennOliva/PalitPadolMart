import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import ListingImageManager from '../../src/components/marketplace/ListingImageManager'

const { managerMocks } = vi.hoisted(() => ({
  managerMocks: {
    from: vi.fn(),
    storageFrom: vi.fn(),
  },
}))

vi.mock('../../src/lib/supabase/client', () => ({
  supabase: {
    from: managerMocks.from,
    storage: {
      from: managerMocks.storageFrom,
    },
  },
}))

describe('ListingImageManager', () => {
  it('renders the uploader when a listing has no photos', () => {
    render(
      <ListingImageManager
        sellerId="seller-1"
        listingId="listing-1"
        images={[]}
        onMutated={() => undefined}
        onError={() => undefined}
      />,
    )

    expect(screen.getByText(/Upload a photo/i)).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Listing photos' })).not.toBeInTheDocument()
  })

  it('renders the photo grid with reorder and remove actions when photos exist', () => {
    render(
      <ListingImageManager
        sellerId="seller-1"
        listingId="listing-1"
        images={[
          {
            id: 'img-1',
            url: 'https://example.com/1.png',
            storage_path: 'p/1.png',
            is_primary: true,
            sort_order: 0,
          },
          {
            id: 'img-2',
            url: 'https://example.com/2.png',
            storage_path: 'p/2.png',
            is_primary: false,
            sort_order: 1,
          },
        ]}
        onMutated={() => undefined}
        onError={() => undefined}
      />,
    )

    expect(screen.getByText(/Add another photo/i)).toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'Listing photos' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Remove' })).toHaveLength(2)
  })
})
