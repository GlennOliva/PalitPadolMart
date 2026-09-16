import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import GoogleOAuthButton from '../../src/components/auth/GoogleOAuthButton'
import { signInWithGoogle } from '../../src/features/auth/auth.service'

vi.mock('../../src/features/auth/auth.service', () => ({ signInWithGoogle: vi.fn() }))

const mockedSignIn = vi.mocked(signInWithGoogle)

describe('GoogleOAuthButton', () => {
  beforeEach(() => mockedSignIn.mockReset())

  it('starts OAuth once and passes the return path', async () => {
    mockedSignIn.mockResolvedValue({
      data: { provider: 'google', url: 'https://accounts.google.com' },
      error: null,
    })
    const onError = vi.fn()
    render(<GoogleOAuthButton returnPath="/orders/order-1" onError={onError} />)

    fireEvent.click(screen.getByRole('button', { name: 'Continue with Google' }))
    await waitFor(() => expect(mockedSignIn).toHaveBeenCalledWith('/orders/order-1'))
    expect(onError).toHaveBeenCalledWith(null)
  })

  it('maps provider initialization errors to safe copy', async () => {
    mockedSignIn.mockResolvedValue({
      data: { provider: 'google', url: null },
      error: { code: 'provider_disabled', message: 'raw hosted setting details' } as never,
    })
    const onError = vi.fn()
    render(<GoogleOAuthButton onError={onError} />)

    fireEvent.click(screen.getByRole('button', { name: 'Continue with Google' }))
    await waitFor(() => expect(onError).toHaveBeenCalledWith(expect.stringMatching(/not available/i)))
    expect(onError).not.toHaveBeenCalledWith(expect.stringContaining('raw hosted'))
  })

  it('blocks duplicate clicks while OAuth is starting', async () => {
    let finish!: (value: Awaited<ReturnType<typeof signInWithGoogle>>) => void
    mockedSignIn.mockReturnValue(new Promise((resolve) => { finish = resolve }))
    render(<GoogleOAuthButton onError={() => undefined} />)

    const button = screen.getByRole('button', { name: 'Continue with Google' })
    fireEvent.click(button)
    fireEvent.click(button)
    expect(mockedSignIn).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Opening Google...' })).toBeDisabled()
    finish({ data: { provider: 'google', url: 'https://accounts.google.com' }, error: null })
    await waitFor(() => expect(mockedSignIn).toHaveBeenCalledTimes(1))
  })
})
