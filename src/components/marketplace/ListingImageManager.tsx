import { useState, type ChangeEvent } from 'react'
import { describeSupabaseError } from '../../features/auth/auth-errors'
import { validateListingImageFile } from '../../features/marketplace/listing-images'
import {
  removeListingImage,
  reorderListingImages,
  setPrimaryListingImage,
  uploadListingImage,
} from '../../features/marketplace/marketplace.service'
import { sortListingImages } from '../../features/marketplace/marketplace-utils'
import type { ListingImageSummary } from '../../features/marketplace/marketplace.types'

interface ListingImageManagerProps {
  sellerId: string
  listingId: string
  images: ListingImageSummary[]
  onMutated: () => void
  onError: (message: string) => void
}

export default function ListingImageManager({
  sellerId,
  listingId,
  images,
  onMutated,
  onError,
}: ListingImageManagerProps) {
  const [busy, setBusy] = useState(false)
  const sorted = sortListingImages(images)

  function finish(result: { error: { message: string } | null } | null, message: string) {
    setBusy(false)
    if (result?.error != null) {
      onError(message)
      return
    }
    onMutated()
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file == null) return
    if (images.length >= 8) {
      onError('You can upload up to 8 photos per listing.')
      return
    }
    const validation = validateListingImageFile(file)
    if (!validation.ok) {
      onError(validation.error ?? 'That image is not allowed.')
      return
    }
    setBusy(true)
    void uploadListingImage(sellerId, listingId, file).then((result) => {
      if (result.error != null) {
        setBusy(false)
        onError(describeSupabaseError(result.error))
        return
      }
      onMutated()
      setBusy(false)
    })
  }

  function handleRemove(image: ListingImageSummary) {
    setBusy(true)
    void removeListingImage(listingId, image.id, image.storage_path).then((result) =>
      finish(result, 'We could not remove that photo. Please try again.'),
    )
  }

  function handleSetPrimary(imageId: string) {
    setBusy(true)
    void setPrimaryListingImage(listingId, imageId).then((result) =>
      finish(result, 'We could not update the primary photo. Please try again.'),
    )
  }

  function handleMove(index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= sorted.length) return
    const next = [...sorted]
    const [item] = next.splice(index, 1)
    next.splice(target, 0, item)
    setBusy(true)
    void reorderListingImages(listingId, next.map((image) => image.id)).then((result) =>
      finish(result, 'We could not reorder your photos. Please try again.'),
    )
  }

  return (
    <div className="image-manager">
      <label className="btn btn--secondary">
        {busy ? 'Uploading…' : images.length > 0 ? 'Add another photo' : 'Upload a photo'}
        <input
          className="visually-hidden"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={handleFileChange}
          disabled={busy || images.length >= 8}
        />
      </label>
      <p className="image-manager__hint">
        Up to 8 photos · JPEG, PNG, or WebP · 5 MB each. The primary photo is
        shown first on the marketplace.
      </p>

      {sorted.length > 0 ? (
        <ul className="image-picker__grid" aria-label="Listing photos">
          {sorted.map((image, index) => (
            <li key={image.id} className="image-picker__item">
              {image.url != null ? (
                <img className="image-picker__preview" src={image.url} alt="" />
              ) : (
                <span className="image-picker__fallback" aria-hidden="true">
                  🏓
                </span>
              )}
              <div className="image-picker__overlay">
                {image.is_primary ? (
                  <span className="image-picker__badge">Primary</span>
                ) : null}
              </div>
              <div className="image-picker__actions">
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  disabled={busy || index === 0}
                  onClick={() => handleMove(index, -1)}
                  aria-label={`Move photo ${index + 1} earlier`}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  disabled={busy || index === sorted.length - 1}
                  onClick={() => handleMove(index, 1)}
                  aria-label={`Move photo ${index + 1} later`}
                >
                  ↓
                </button>
                {!image.is_primary ? (
                  <button
                    type="button"
                    className="btn btn--secondary btn--sm"
                    disabled={busy}
                    onClick={() => handleSetPrimary(image.id)}
                  >
                    Set primary
                  </button>
                ) : null}
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  disabled={busy}
                  onClick={() => handleRemove(image)}
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
