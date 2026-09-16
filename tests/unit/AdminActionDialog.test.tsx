import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import AdminActionDialog from '../../src/components/admin/AdminActionDialog'

function DialogHarness({ onConfirm }: { onConfirm: (reason: string) => void }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open action
      </button>
      <AdminActionDialog
        open={open}
        title="Suspend account"
        description="This prevents the user from accessing marketplace features."
        confirmLabel="Suspend"
        reasonRequired
        onCancel={() => setOpen(false)}
        onConfirm={onConfirm}
      />
    </>
  )
}

describe('AdminActionDialog', () => {
  it('requires a non-blank reason and returns its normalized value', async () => {
    const onConfirm = vi.fn()
    render(<DialogHarness onConfirm={onConfirm} />)

    fireEvent.click(screen.getByRole('button', { name: 'Open action' }))
    const reason = await screen.findByRole('textbox', { name: /Reason/i })
    await waitFor(() => expect(reason).toHaveFocus())

    fireEvent.change(reason, { target: { value: '   ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Suspend' }))
    expect(screen.getByText('Enter a reason for this action.')).toBeInTheDocument()
    expect(onConfirm).not.toHaveBeenCalled()

    fireEvent.change(reason, { target: { value: '  Repeated policy violation  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Suspend' }))
    expect(onConfirm).toHaveBeenCalledWith('Repeated policy violation')
  })

  it('closes with Escape and restores focus to the opening control', async () => {
    render(<DialogHarness onConfirm={vi.fn()} />)

    const trigger = screen.getByRole('button', { name: 'Open action' })
    trigger.focus()
    fireEvent.click(trigger)
    const dialog = await screen.findByRole('dialog', { name: 'Suspend account' })

    fireEvent.keyDown(dialog, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await waitFor(() => expect(trigger).toHaveFocus())
  })

  it('supports optional reasons and disables actions while loading', async () => {
    render(
      <AdminActionDialog
        open
        title="Restore listing"
        confirmLabel="Restore"
        loading
        loadingLabel="Restoring..."
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    )

    expect(await screen.findByText('Optional')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Restoring...' })).toBeDisabled()
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-busy', 'true')
  })
})
