import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { AuthProvider } from '../../src/features/auth/AuthProvider'
import { useAuth } from '../../src/features/auth/useAuth'
import { makeProfile, makeUser } from '../utils/auth'

const { authMocks } = vi.hoisted(() => {
  let listener: ((event: string, session: unknown) => void) | null = null
  return {
    authMocks: {
      onAuthStateChange: vi.fn(),
      getSession: vi.fn(),
      signOut: vi.fn(),
      from: vi.fn(),
      emit: (event: string, session: unknown) => {
        listener?.(event, session)
      },
      setListener: (fn: (event: string, session: unknown) => void) => {
        listener = fn
      },
    },
  }
})

vi.mock('../../src/lib/supabase/client', () => ({
  supabase: {
    auth: {
      onAuthStateChange: authMocks.onAuthStateChange,
      getSession: authMocks.getSession,
      signOut: authMocks.signOut,
    },
    from: authMocks.from,
  },
}))

function authProbe() {
  return function Probe() {
    const { status, isAuthenticated, isPasswordRecovery, user, profile } = useAuth()
    return (
      <div>
        <span data-testid="status">{status}</span>
        <span data-testid="authenticated">{String(isAuthenticated)}</span>
        <span data-testid="recovery">{String(isPasswordRecovery)}</span>
        <span data-testid="user-id">{user?.id ?? 'none'}</span>
        <span data-testid="profile-name">{profile?.first_name ?? 'none'}</span>
      </div>
    )
  }
}

const Probe = authProbe()

function sessionFor(user = makeUser()) {
  return {
    access_token: 'token',
    refresh_token: 'refresh',
    expires_in: 3600,
    expires_at: 9999999999,
    token_type: 'bearer',
    user,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  authMocks.onAuthStateChange.mockImplementation((callback) => {
    authMocks.setListener(callback)
    return { data: { subscription: { unsubscribe: vi.fn() } } }
  })
  authMocks.signOut.mockResolvedValue({ error: null })
  authMocks.from.mockReturnValue({
    select: () => ({
      eq: () => ({
        maybeSingle: async () => ({ data: null, error: null }),
      }),
    }),
  })
})

describe('AuthProvider', () => {
  it('starts in the initializing state and settles to unauthenticated without a session', async () => {
    authMocks.getSession.mockResolvedValue({ data: { session: null }, error: null })

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    )

    expect(screen.getByTestId('status')).toHaveTextContent('initializing')
    await waitFor(() =>
      expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated'),
    )
    expect(screen.getByTestId('authenticated')).toHaveTextContent('false')
    expect(screen.getByTestId('user-id')).toHaveTextContent('none')
  })

  it('restores an existing session and loads the profile', async () => {
    const user = makeUser()
    authMocks.getSession.mockResolvedValue({
      data: { session: sessionFor(user) },
      error: null,
    })
    authMocks.from.mockReturnValue({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: makeProfile({ id: user.id }), error: null }),
        }),
      }),
    })

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    )

    await waitFor(() =>
      expect(screen.getByTestId('status')).toHaveTextContent('authenticated'),
    )
    expect(screen.getByTestId('user-id')).toHaveTextContent('user-1')
    expect(screen.getByTestId('profile-name')).toHaveTextContent('Test')
  })

  it('flags password recovery state from a PASSWORD_RECOVERY event', async () => {
    const user = makeUser()
    authMocks.getSession.mockResolvedValue({ data: { session: null }, error: null })

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    )

    await waitFor(() =>
      expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated'),
    )

    const listener = authMocks.onAuthStateChange.mock.calls[0][0] as (
      event: string,
      session: unknown,
    ) => void
    listener('PASSWORD_RECOVERY', sessionFor(user))

    await waitFor(() => expect(screen.getByTestId('recovery')).toHaveTextContent('true'))
  })

  it('signs out and resets application state', async () => {
    const user = makeUser()
    authMocks.getSession.mockResolvedValue({
      data: { session: sessionFor(user) },
      error: null,
    })
    authMocks.from.mockReturnValue({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: makeProfile({ id: user.id }), error: null }),
        }),
      }),
    })

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    )

    await waitFor(() =>
      expect(screen.getByTestId('status')).toHaveTextContent('authenticated'),
    )

    const listener = authMocks.onAuthStateChange.mock.calls[0][0] as (
      event: string,
      session: unknown,
    ) => void
    listener('SIGNED_OUT', null)

    await waitFor(() =>
      expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated'),
    )
    expect(screen.getByTestId('user-id')).toHaveTextContent('none')
    expect(screen.getByTestId('profile-name')).toHaveTextContent('none')
  })
})
