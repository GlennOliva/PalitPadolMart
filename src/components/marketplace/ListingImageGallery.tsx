import { useState } from 'react'
import { sortListingImages } from '../../features/marketplace/marketplace-utils'
import type { ListingImageSummary } from '../../features/marketplace/marketplace.types'

interface ListingImageGalleryProps {
  images: ListingImageSummary[]
  /** When provided, clicking a thumbnail makes it the primary image. */
  onSetPrimary?: (imageId: string) => void
}

export default function ListingImageGallery({
  images,
  onSetPrimary,
}: ListingImageGalleryProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const sorted = sortListingImages(images)
  const active = selectedId != null ? sorted.find((image) => image.id === selectedId) ?? null : null
  const current = active ?? sorted[0] ?? null

  if (current == null) {
    return (
      <div className="gallery gallery--empty" aria-label="No photos">
        <span className="gallery__placeholder" aria-hidden="true">
          🏓
        </span>
        <p className="gallery__hint">No photos yet.</p>
      </div>
    )
  }

  return (
    <div className="gallery">
      <div className="gallery__main">
        {current.url != null ? (
          <img
            className="gallery__main-image"
            src={current.url}
            alt=""
            onError={() => setSelectedId(null)}
          />
        ) : (
          <span className="gallery__placeholder" aria-hidden="true">
            🏓
          </span>
        )}
      </div>
      {sorted.length > 1 ? (
        <div className="gallery__thumbs" role="list" aria-label="Photos">
          {sorted.map((image) => {
            const isCurrent = image.id === current.id
            return (
              <button
                key={image.id}
                type="button"
                className={`gallery__thumb${isCurrent ? ' gallery__thumb--active' : ''}`}
                aria-label={isCurrent ? 'Current photo' : 'Show photo'}
                aria-pressed={isCurrent}
                onClick={() => {
                  setSelectedId(image.id)
                  onSetPrimary?.(image.id)
                }}
              >
                {image.url != null ? (
                  <img className="gallery__thumb-image" src={image.url} alt="" />
                ) : (
                  <span className="gallery__thumb-fallback" aria-hidden="true">
                    🏓
                  </span>
                )}
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
