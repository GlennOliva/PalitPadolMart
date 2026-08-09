import type { ReactNode } from 'react'
import type { User } from '@supabase/supabase-js'
import { AuthContext, type AuthContextValue } from '../../src/features/auth/AuthProvider'
import type { Profile, UserRole } from '../../src/features/auth/auth.types'

export function makeUser(id = 'user-1', email = 'player@example.com'): User {
  return {
    id,
    aud: 'authenticated',
    email,
    app_metadata: {},
    user_metadata: {},
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    email_confirmed_at: '2026-01-01T00:00:00.000Z',
  }
}

export function makeProfile(overrides: Partial<Profile> = {}, role: UserRole = 'customer') {
  return {
    id: 'user-1',
    account_status: 'active' as const,
    avatar_url: null,
    city: null,
    created_at: '2026-01-01T00:00:00.000Z',
    display_name: null,
    first_name: 'Test',
    last_name: 'Player',
    phone: null,
    province: null,
    role,
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } satisfies Profile
}

export function createAuthValue(
  overrides: Partial<AuthContextValue> = {},
): AuthContextValue {
  return {
    user: null,
    session: null,
    profile: null,
    status: 'unauthenticated',
    profileLoading: false,
    profileError: null,
    isAuthenticated: false,
    isPasswordRecovery: false,
    signOut: async () => undefined,
    refreshProfile: async () => undefined,
    clearPasswordRecovery: () => undefined,
    ...overrides,
  }
}

export function renderWithAuth(children: ReactNode, value: AuthContextValue) {
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
