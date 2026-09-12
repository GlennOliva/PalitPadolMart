import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import Badge from '../../src/components/common/Badge'

describe('Badge', () => {
  it('renders a neutral badge by default', () => {
    render(<Badge>Draft</Badge>)
    const badge = screen.getByText('Draft')
    expect(badge.className).toContain('badge--neutral')
  })

  it('maps listing statuses to badge variants', () => {
    for (const variant of ['draft', 'active', 'sold', 'archived', 'removed'] as const) {
      const { unmount } = render(<Badge variant={variant}>{variant}</Badge>)
      expect(screen.getByText(variant).className).toContain(`badge--${variant}`)
      unmount()
    }
  })

  it('supports seller status variants', () => {
    for (const variant of ['pending', 'suspended'] as const) {
      const { unmount } = render(<Badge variant={variant}>{variant}</Badge>)
      expect(screen.getByText(variant).className).toContain(`badge--${variant}`)
      unmount()
    }
  })
})
