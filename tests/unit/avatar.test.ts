import { describe, it, expect } from 'vitest'
import {
  avatarBucket,
  buildAvatarPath,
  validateAvatarFile,
} from '../../src/features/auth/avatar'

function makeFile(name: string, type: string, size = 16): File {
  return new File([new ArrayBuffer(size)], name, { type })
}

describe('validateAvatarFile', () => {
  it('accepts allowed image types', () => {
    expect(validateAvatarFile(makeFile('photo.png', 'image/png')).ok).toBe(true)
    expect(validateAvatarFile(makeFile('photo.jpg', 'image/jpeg')).ok).toBe(true)
    expect(validateAvatarFile(makeFile('photo.webp', 'image/webp')).ok).toBe(true)
  })

  it('rejects disallowed types', () => {
    const result = validateAvatarFile(makeFile('movie.mp4', 'video/mp4'))
    expect(result.ok).toBe(false)
    expect(result.error).toContain('JPEG, PNG, or WebP')
  })

  it('rejects empty files', () => {
    const result = validateAvatarFile(new File([], 'empty.png', { type: 'image/png' }))
    expect(result.ok).toBe(false)
    expect(result.error).toContain('empty')
  })

  it('rejects files larger than 5 MB', () => {
    const big = makeFile('huge.png', 'image/png', 5 * 1024 * 1024 + 1)
    const result = validateAvatarFile(big)
    expect(result.ok).toBe(false)
    expect(result.error).toContain('5 MB')
  })
})

describe('buildAvatarPath', () => {
  it('scopes the file under the user id', () => {
    expect(buildAvatarPath('user-1', 'avatar.png')).toBe('user-1/avatar.png')
  })

  it('sanitizes unsafe characters', () => {
    expect(buildAvatarPath('user-1', 'my avatar?.png')).toBe('user-1/my_avatar_.png')
  })
})

describe('avatarBucket', () => {
  it('points at the avatars bucket', () => {
    expect(avatarBucket()).toBe('avatars')
  })
})
