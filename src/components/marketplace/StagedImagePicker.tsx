import type { ChangeEvent } from 'react'
import { validateListingImageFile } from '../../features/marketplace/listing-images'
import type { StagedListingImage } from '../../features/marketplace/marketplace.types'

interface StagedImagePickerProps {
  images: StagedListingImage[]
  onChange: (next: StagedListingImage[]) => void
  onError: (message: string | null) => void
  disabled?: boolean
}

export default function StagedImagePicker({
  images,
  onChange,
  onError,
  disabled = false,
}: StagedImagePickerProps) {
  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (files.length === 0) return

    const room = 8 - images.length
    if (room <= 0) {
      onError('You can upload up to 8 photos per listing.')
      return
    }

    const accepted: StagedListingImage[] = []
    for (const file of files.slice(0, room)) {
      const validation = validateListingImageFile(file)
      if (!validation.ok) {
        onError(validation.error ?? 'That image is not allowed.')
        continue
      }
      accepted.push({
        id: crypto.randomUUID(),
        file,
        previewUrl: URL.createObjectURL(file),
      })
    }
    if (accepted.length > 0) {
      onError(null)
      onChange([...images, ...accepted])
    }
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= images.length) return
    const next = [...images]
    const [item] = next.splice(index, 1)
    next.splice(target, 0, item)
    onChange(next)
  }

  function remove(id: string) {
    const removed = images.find((image) => image.id === id)
    if (removed != null) URL.revokeObjectURL(removed.previewUrl)
    onChange(images.filter((image) => image.id !== id))
  }

  return (
    <div className="image-picker">
      <label className="btn btn--secondary">
        {images.length > 0 ? 'Add another photo' : 'Choose photos'}
        <input
          className="visually-hidden"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          onChange={handleFileChange}
          disabled={disabled || images.length >= 8}
        />
      </label>
      <p className="image-picker__hint">
        Up to 8 photos · JPEG, PNG, or WebP · 5 MB each. The first photo becomes
        the primary image.
      </p>

      {images.length > 0 ? (
        <ul className="image-picker__grid" aria-label="Chosen photos">
          {images.map((image, index) => (
            <li key={image.id} className="image-picker__item">
              <img className="image-picker__preview" src={image.previewUrl} alt="" />
              <div className="image-picker__overlay">
                {index === 0 ? (
                  <span className="image-picker__badge">Primary</span>
                ) : null}
              </div>
              <div className="image-picker__actions">
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  disabled={disabled || index === 0}
                  onClick={() => move(index, -1)}
                  aria-label={`Move photo ${index + 1} earlier`}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  disabled={disabled || index === images.length - 1}
                  onClick={() => move(index, 1)}
                  aria-label={`Move photo ${index + 1} later`}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  disabled={disabled}
                  onClick={() => remove(image.id)}
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
