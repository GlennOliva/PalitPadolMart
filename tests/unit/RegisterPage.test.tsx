import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import RegisterPage from '../../src/pages/auth/RegisterPage'
import { signInWithGoogle } from '../../src/features/auth/auth.service'

vi.mock('../../src/features/auth/auth.service', () => ({
  signUp: vi.fn(),
  signInWithGoogle: vi.fn(),
}))

describe('RegisterPage Google OAuth', () => {
  it('offers Google registration without removing the password form', async () => {
    vi.mocked(signInWithGoogle).mockResolvedValue({
      data: { provider: 'google', url: 'https://accounts.google.com' },
      error: null,
    })
    render(
      <MemoryRouter initialEntries={[{ pathname: '/register', state: { from: '/favorites' } }]}>
        <RegisterPage />
      </MemoryRouter>,
    )

    expect(screen.getByLabelText(/^Email/)).toBeInTheDocument()
    expect(screen.getByLabelText(/^Password/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Continue with Google' }))
    await waitFor(() => expect(signInWithGoogle).toHaveBeenCalledWith('/favorites'))
  })
})

describe('RegisterPage password visibility toggle', () => {
  function renderRegister() {
    render(
      <MemoryRouter>
        <RegisterPage />
      </MemoryRouter>,
    )
  }

  it('renders password as hidden initially', () => {
    renderRegister()
    const input = screen.getByLabelText(/^Password/)
    expect(input).toHaveAttribute('type', 'password')
  })

  it('renders confirm password as hidden initially', () => {
    renderRegister()
    const input = screen.getByLabelText(/^Confirm password/)
    expect(input).toHaveAttribute('type', 'password')
  })

  it('shows password when the first toggle is clicked', () => {
    renderRegister()
    const input = screen.getByLabelText(/^Password/)
    const toggles = screen.getAllByRole('button', { name: 'Show password' })

    fireEvent.click(toggles[0])
    expect(input).toHaveAttribute('type', 'text')
  })

  it('shows confirm password when the second toggle is clicked', () => {
    renderRegister()
    const confirmInput = screen.getByLabelText(/^Confirm password/)
    const toggles = screen.getAllByRole('button', { name: 'Show password' })

    fireEvent.click(toggles[1])
    expect(confirmInput).toHaveAttribute('type', 'text')
  })

  it('toggles password and confirm password independently', () => {
    renderRegister()
    const passwordInput = screen.getByLabelText(/^Password/)
    const confirmInput = screen.getByLabelText(/^Confirm password/)
    const toggles = screen.getAllByRole('button', { name: 'Show password' })

    fireEvent.click(toggles[0])

    expect(passwordInput).toHaveAttribute('type', 'text')
    expect(confirmInput).toHaveAttribute('type', 'password')
  })

  it('password matching validation still works after toggling visibility', () => {
    renderRegister()
    fireEvent.change(screen.getByLabelText(/^Password/), { target: { value: 'abc12345' } })
    fireEvent.change(screen.getByLabelText(/^Confirm password/), { target: { value: 'xyz99999' } })

    fireEvent.click(screen.getByRole('button', { name: /Create account/i }))
    expect(screen.getByText('Passwords do not match.')).toBeInTheDocument()
  })
})