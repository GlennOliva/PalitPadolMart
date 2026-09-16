import { beforeEach, describe, expect, it, vi } from 'vitest'

const { signInWithOAuth } = vi.hoisted(() => ({ signInWithOAuth: vi.fn() }))

vi.mock('../../src/lib/supabase/client', () => ({
  supabase: { auth: { signInWithOAuth } },
}))

import { signInWithGoogle } from '../../src/features/auth/auth.service'

describe('signInWithGoogle', () => {
  beforeEach(() => signInWithOAuth.mockReset())

  it('uses Supabase Google OAuth with minimal identity scopes', async () => {
    signInWithOAuth.mockResolvedValue({ data: { provider: 'google', url: 'https://accounts.google.com' }, error: null })
    await signInWithGoogle('/orders/order-1?tab=payment#proof')

    expect(signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: {
        redirectTo: 'https://palit-padol-mart.vercel.app/auth/callback?next=%2Forders%2Forder-1%3Ftab%3Dpayment%23proof',
        scopes: 'openid email profile',
      },
    })
  })

  it('falls back to a safe dashboard return path', async () => {
    signInWithOAuth.mockResolvedValue({ data: { provider: 'google', url: null }, error: null })
    await signInWithGoogle('https://evil.example')
    const call = signInWithOAuth.mock.calls[0][0]
    expect(new URL(call.options.redirectTo).searchParams.get('next')).toBe('/dashboard')
  })
})
