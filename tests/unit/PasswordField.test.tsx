import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import PasswordField from '../../src/components/auth/PasswordField'

function renderPassword(overrides = {}) {
  const defaultProps = {
    id: 'test-password',
    label: 'Password',
    value: '',
    onChange: () => {},
    autoComplete: 'current-password',
    required: true,
    ...overrides,
  }
  const onChange = vi.fn()
  render(<PasswordField {...defaultProps} onChange={onChange} />)
  return { onChange }
}

describe('PasswordField', () => {
  it('renders as type="password" initially', () => {
    renderPassword({ value: 'secret123' })
    expect(screen.getByLabelText(/^Password/)).toHaveAttribute('type', 'password')
  })

  it('renders the show-password toggle button', () => {
    renderPassword()
    expect(screen.getByRole('button', { name: 'Show password' })).toBeInTheDocument()
  })

  it('toggles to type="text" when the eye button is clicked', () => {
    renderPassword({ value: 'secret123' })
    const input = screen.getByLabelText(/^Password/)
    expect(input).toHaveAttribute('type', 'password')

    fireEvent.click(screen.getByRole('button', { name: 'Show password' }))
    expect(input).toHaveAttribute('type', 'text')
  })

  it('toggles back to type="password" on second click', () => {
    renderPassword({ value: 'secret123' })
    const toggle = screen.getByRole('button', { name: 'Show password' })

    fireEvent.click(toggle)
    expect(screen.getByLabelText(/^Password/)).toHaveAttribute('type', 'text')
    expect(screen.getByRole('button', { name: 'Hide password' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Hide password' }))
    expect(screen.getByLabelText(/^Password/)).toHaveAttribute('type', 'password')
    expect(screen.getByRole('button', { name: 'Show password' })).toBeInTheDocument()
  })

  it('preserves the password value through visibility toggles', () => {
    const onChange = vi.fn()
    render(<PasswordField id="pw" label="Password" value="MyPass123!" onChange={onChange} required />)

    fireEvent.click(screen.getByRole('button', { name: 'Show password' }))
    expect(screen.getByLabelText(/^Password/)).toHaveValue('MyPass123!')

    fireEvent.click(screen.getByRole('button', { name: 'Hide password' }))
    expect(screen.getByLabelText(/^Password/)).toHaveValue('MyPass123!')
  })

  it('does not fire onChange when the toggle is clicked', () => {
    const onChange = vi.fn()
    render(<PasswordField id="pw" label="Password" value="secret" onChange={onChange} required />)

    fireEvent.click(screen.getByRole('button', { name: 'Show password' }))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('toggle button has type="button" and does not submit', () => {
    renderPassword()
    const button = screen.getByRole('button', { name: 'Show password' })
    expect(button).toHaveAttribute('type', 'button')
  })

  it('sets aria-pressed to true when visible and false when hidden', () => {
    renderPassword()
    const button = screen.getByRole('button', { name: 'Show password' })
    expect(button).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(button)
    const visibleButton = screen.getByRole('button', { name: 'Hide password' })
    expect(visibleButton).toHaveAttribute('aria-pressed', 'true')
  })

  it('disables the toggle when disabled prop is true', () => {
    renderPassword({ disabled: true })
    expect(screen.getByRole('button', { name: 'Show password' })).toBeDisabled()
  })

  it('shows error message while toggle remains functional', () => {
    renderPassword({ error: 'Password is required.' })
    expect(screen.getByText('Password is required.')).toBeInTheDocument()
    const toggle = screen.getByRole('button', { name: 'Show password' })
    expect(toggle).toBeEnabled()
    fireEvent.click(toggle)
    expect(screen.getByLabelText(/^Password/)).toHaveAttribute('type', 'text')
  })
})