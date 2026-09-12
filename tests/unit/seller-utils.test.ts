import { describe, it, expect } from 'vitest'
import {
  canAccessSellerTools,
  formatSellerStatus,
  isSellerActive,
  isSellerPending,
  isSellerRejected,
  isSellerSuspended,
  sellerNavLabel,
  sellerNavPath,
} from '../../src/features/seller/seller-utils'
import { makeSellerProfile } from '../utils/seller'

describe('seller status helpers', () => {
  it('classifies a null profile as not a seller', () => {
    expect(isSellerActive(null)).toBe(false)
    expect(isSellerPending(null)).toBe(false)
    expect(isSellerRejected(null)).toBe(false)
    expect(isSellerSuspended(null)).toBe(false)
    expect(canAccessSellerTools(null)).toBe(false)
  })

  it('classifies each status correctly', () => {
    expect(isSellerPending(makeSellerProfile({ seller_status: 'pending' }))).toBe(true)
    expect(isSellerActive(makeSellerProfile({ seller_status: 'active' }))).toBe(true)
    expect(isSellerRejected(makeSellerProfile({ seller_status: 'rejected' }))).toBe(true)
    expect(isSellerSuspended(makeSellerProfile({ seller_status: 'suspended' }))).toBe(true)
  })

  it('only allows active sellers to access seller tools', () => {
    expect(canAccessSellerTools(makeSellerProfile({ seller_status: 'active' }))).toBe(true)
    expect(canAccessSellerTools(makeSellerProfile({ seller_status: 'pending' }))).toBe(false)
    expect(canAccessSellerTools(makeSellerProfile({ seller_status: 'rejected' }))).toBe(false)
    expect(canAccessSellerTools(makeSellerProfile({ seller_status: 'suspended' }))).toBe(false)
  })

  it('formats seller statuses for display', () => {
    expect(formatSellerStatus('pending')).toBe('Pending')
    expect(formatSellerStatus('active')).toBe('Active')
    expect(formatSellerStatus('suspended')).toBe('Suspended')
    expect(formatSellerStatus('rejected')).toBe('Rejected')
  })
})

describe('seller navigation helpers', () => {
  it('points users without a seller profile to onboarding', () => {
    expect(sellerNavPath(null)).toBe('/seller/onboarding')
    expect(sellerNavLabel(null)).toBe('Become a Seller')
  })

  it('points active sellers to the seller dashboard', () => {
    expect(sellerNavPath(makeSellerProfile({ seller_status: 'active' }))).toBe(
      '/seller/dashboard',
    )
    expect(sellerNavLabel(makeSellerProfile({ seller_status: 'active' }))).toBe(
      'Seller Dashboard',
    )
  })

  it('points pending sellers to the status page as a pending application', () => {
    expect(sellerNavPath(makeSellerProfile({ seller_status: 'pending' }))).toBe(
      '/seller/status',
    )
    expect(sellerNavLabel(makeSellerProfile({ seller_status: 'pending' }))).toBe(
      'Seller Application',
    )
  })

  it('points rejected and suspended sellers to the status page', () => {
    for (const status of ['rejected', 'suspended'] as const) {
      expect(sellerNavPath(makeSellerProfile({ seller_status: status }))).toBe(
        '/seller/status',
      )
      expect(sellerNavLabel(makeSellerProfile({ seller_status: status }))).toBe(
        'Seller Status',
      )
    }
  })
})
