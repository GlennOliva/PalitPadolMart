import { describe, it, expect } from 'vitest'
import {
  buildSellerLogoPath,
  sellerLogoBucket,
  validateSellerLogoFile,
} from '../../src/features/seller/seller-logo'

function makeFile(type: string, size: number): File {
  return new File([new ArrayBuffer(size)], 'logo.png', { type })
}

describe('validateSellerLogoFile', () => {
  it('accepts JPEG, PNG, and WebP images', () => {
    expect(validateSellerLogoFile(makeFile('image/jpeg', 1024)).ok).toBe(true)
    expect(validateSellerLogoFile(makeFile('image/png', 1024)).ok).toBe(true)
    expect(validateSellerLogoFile(makeFile('image/webp', 1024)).ok).toBe(true)
  })

  it('rejects unsupported image types', () => {
    const result = validateSellerLogoFile(makeFile('image/gif', 1024))
    expect(result.ok).toBe(false)
    expect(result.error).toBe('Only JPEG, PNG, or WebP images are allowed.')
  })

  it('rejects empty files', () => {
    const result = validateSellerLogoFile(makeFile('image/png', 0))
    expect(result.ok).toBe(false)
    expect(result.error).toBe('The selected file appears to be empty.')
  })

  it('rejects files larger than 5 MB', () => {
    const result = validateSellerLogoFile(makeFile('image/png', 5 * 1024 * 1024 + 1))
    expect(result.ok).toBe(false)
    expect(result.error).toBe('Logo must be 5 MB or smaller.')
  })
})

describe('buildSellerLogoPath', () => {
  it('scopes the logo under the seller id and logo folder', () => {
    expect(buildSellerLogoPath('seller-1', 'logo.png')).toBe('seller-1/logo/logo.png')
  })

  it('sanitizes unsafe characters in the file name', () => {
    expect(buildSellerLogoPath('seller-1', 'my logo!.png')).toBe(
      'seller-1/logo/my_logo_.png',
    )
  })
})

describe('sellerLogoBucket', () => {
  it('uses the public marketplace-products bucket', () => {
    expect(sellerLogoBucket()).toBe('marketplace-products')
  })
})
