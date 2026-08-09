import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AuthApiError } from '@supabase/supabase-js'
import type { AuthTokenResponsePassword, Session, User } from '@supabase/supabase-js'
import LoginPage from '../../src/pages/auth/LoginPage'
import { signInWithPassword } from '../../src/features/auth/auth.service'

vi.mock('../../src/features/auth/auth.service', () => ({
  signInWithPassword: vi.fn(),
}))

const mockedSignIn = vi.mocked(signInWithPassword)

function sessionFor(user: User): Session {
  return {
    access_token: 'token',
    refresh_token: 'refresh',
    expires_in: 3600,
    expires_at: 9999999999,
    token_type: 'bearer',
    user,
  }
}

function authError(code: string, message: string): AuthApiError {
  return new AuthApiError(message, 400, code)
}

function renderLogin() {
  render(
    <MemoryRouter initialEntries={['/login']}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/dashboard" element={<div>DASHBOARD PAGE</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

function fillForm(email: string, password: string) {
  fireEvent.change(screen.getByLabelText(/^Email/), { target: { value: email } })
  fireEvent.change(screen.getByLabelText(/^Password/), {
    target: { value: password },
  })
  fireEvent.click(screen.getByRole('button', { name: /Sign in/i }))
}

describe('LoginPage', () => {
  it('shows validation errors when fields are empty', () => {
    renderLogin()
    fireEvent.click(screen.getByRole('button', { name: /Sign in/i }))

    expect(screen.getByText('Email is required.')).toBeInTheDocument()
    expect(screen.getByText('Password is required.')).toBeInTheDocument()
    expect(mockedSignIn).not.toHaveBeenCalled()
  })

  it('shows a friendly message for invalid credentials', async () => {
    mockedSignIn.mockResolvedValue({
      data: { user: null, session: null },
      error: authError('invalid_credentials', 'Invalid login credentials'),
    } as unknown as AuthTokenResponsePassword)
    renderLogin()
    fillForm('player@example.com', 'wrongpassword')

    await screen.findByText('Invalid email or password.')
    expect(mockedSignIn).toHaveBeenCalledWith('player@example.com', 'wrongpassword')
  })

  it('shows a confirmation notice when no session is returned', async () => {
    mockedSignIn.mockResolvedValue({
      data: { user: null, session: null },
      error: null,
    } as unknown as AuthTokenResponsePassword)
    renderLogin()
    fillForm('player@example.com', 'password123')

    expect(
      await screen.findByText(/Please confirm your email address/i),
    ).toBeInTheDocument()
  })

  it('redirects to the dashboard on successful sign-in', async () => {
    const user = {
      id: 'user-1',
      aud: 'authenticated',
      email: 'player@example.com',
      app_metadata: {},
      user_metadata: {},
      created_at: '2026-01-01T00:00:00.000Z',
    } as User
    mockedSignIn.mockResolvedValue({
      data: { user, session: sessionFor(user) },
      error: null,
    })
    renderLogin()
    fillForm('player@example.com', 'password123')

    expect(await screen.findByText('DASHBOARD PAGE')).toBeInTheDocument()
  })

  it('stays on the page and does not navigate when sign-in fails', async () => {
    mockedSignIn.mockResolvedValue({
      data: { user: null, session: null },
      error: authError('over_request_rate_limit', 'rate limited'),
    } as unknown as AuthTokenResponsePassword)
    renderLogin()
    fillForm('player@example.com', 'password123')

    await screen.findByText(/Too many requests/i)
    expect(screen.queryByText('DASHBOARD PAGE')).not.toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Sign in/i })).toBeEnabled(),
    )
  })
})
