import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import GlassPanel from '../../src/components/common/GlassPanel'
import EmptyState from '../../src/components/common/EmptyState'
import PageHeader from '../../src/components/common/PageHeader'

describe('GlassPanel', () => {
  it('renders children inside the glass surface', () => {
    render(<GlassPanel>Hello glass</GlassPanel>)
    const panel = screen.getByText('Hello glass')
    expect(panel.className).toContain('glass')
  })

  it('applies the requested intensity', () => {
    const { rerender } = render(<GlassPanel intensity="strong">x</GlassPanel>)
    expect(screen.getByText('x').className).toContain('glass--strong')
    rerender(<GlassPanel intensity="soft">x</GlassPanel>)
    expect(screen.getByText('x').className).toContain('glass--soft')
  })

  it('merges a custom class name', () => {
    render(<GlassPanel className="custom-panel">x</GlassPanel>)
    expect(screen.getByText('x').className).toContain('custom-panel')
  })
})

describe('EmptyState', () => {
  it('renders title and body', () => {
    render(<EmptyState title="Nothing here" body="Come back later." />)
    expect(screen.getByRole('heading', { name: 'Nothing here' })).toBeInTheDocument()
    expect(screen.getByText('Come back later.')).toBeInTheDocument()
  })

  it('renders an optional action', () => {
    render(<EmptyState title="Empty" action={<button type="button">Add one</button>} />)
    expect(screen.getByRole('button', { name: 'Add one' })).toBeInTheDocument()
  })
})

describe('PageHeader', () => {
  it('renders title, intro, and actions', () => {
    render(
      <MemoryRouter>
        <PageHeader
          title="Your listings"
          intro="Manage everything you sell."
          actions={<a href="/new">New</a>}
        />
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { name: 'Your listings' })).toBeInTheDocument()
    expect(screen.getByText('Manage everything you sell.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'New' })).toBeInTheDocument()
  })

  it('omits intro and actions when not provided', () => {
    render(<PageHeader title="Only title" />)
    expect(screen.getByRole('heading', { name: 'Only title' })).toBeInTheDocument()
    expect(screen.queryByText('Manage everything you sell.')).not.toBeInTheDocument()
  })
})
