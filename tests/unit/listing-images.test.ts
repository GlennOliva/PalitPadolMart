import { describe, it, expect } from 'vitest'
import {
  buildListingImagePath,
  validateListingImageFile,
} from '../../src/features/marketplace/listing-images'

describe('validateListingImageFile', () => {
  it('rejects non-image types', () => {
    const file = new File([new ArrayBuffer(8)], 'notes.txt', { type: 'text/plain' })
    const result = validateListingImageFile(file)
    expect(result.ok).toBe(false)
  })

  it('rejects files larger than 5 MB', () => {
    const file = new File([new ArrayBuffer(5 * 1024 * 1024 + 1)], 'big.png', {
      type: 'image/png',
    })
    expect(validateListingImageFile(file).ok).toBe(false)
  })

  it('accepts allowed image types under the size limit', () => {
    const file = new File([new ArrayBuffer(8)], 'paddle.png', { type: 'image/png' })
    expect(validateListingImageFile(file).ok).toBe(true)
  })
})

describe('buildListingImagePath', () => {
  it('scopes the path by seller then listing and adds a unique suffix', () => {
    expect(buildListingImagePath('seller-1', 'listing-2', 'paddle.png', 'abc')).toBe(
      'seller-1/listing-2/abc-paddle.png',
    )
  })

  it('sanitizes unsafe filename characters', () => {
    expect(buildListingImagePath('s', 'l', 'my photo!.png', 'x')).toBe('s/l/x-my_photo_.png')
  })
})
