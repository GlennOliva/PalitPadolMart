import type { ReactNode } from 'react'
import type { PostgrestError, PostgrestSingleResponse } from '@supabase/supabase-js'
import { SellerContext, type SellerContextValue } from '../../src/features/seller/SellerProvider'
import type { SellerProfile } from '../../src/features/seller/seller.types'

export function makePostgrestError(message: string, code = 'PGRST301'): PostgrestError {
  return {
    message,
    details: '',
    hint: '',
    code,
    name: 'PostgrestError',
    toJSON: () => ({
      name: 'PostgrestError',
      message,
      details: '',
      hint: '',
      code,
    }),
  }
}

export function makeSuccessResponse<T>(data: T): PostgrestSingleResponse<T> {
  return {
    data,
    error: null,
    count: null,
    status: 200,
    statusText: 'OK',
    success: true,
  }
}

export function makeFailureResponse<T>(error: PostgrestError): PostgrestSingleResponse<T> {
  return {
    data: null,
    error,
    count: null,
    status: 500,
    statusText: 'Internal Server Error',
    success: false,
  }
}

export function makeSellerProfile(overrides: Partial<SellerProfile> = {}): SellerProfile {
  return {
    id: 'seller-1',
    user_id: 'user-1',
    store_name: 'Ace Paddles PH',
    description: 'Quality paddles at fair prices.',
    logo_url: null,
    seller_status: 'pending',
    city: 'Cebu City',
    province: 'Cebu',
    pickup_available: true,
    delivery_available: false,
    pickup_location: 'Metro Park, Dumanjug',
    pickup_instructions: 'Look for the white van.',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

export function createSellerValue(
  overrides: Partial<SellerContextValue> = {},
): SellerContextValue {
  return {
    sellerProfile: null,
    sellerLoading: false,
    sellerError: null,
    refreshSellerProfile: async () => undefined,
    ...overrides,
  }
}

export function renderWithSeller(children: ReactNode, value: SellerContextValue) {
  return <SellerContext.Provider value={value}>{children}</SellerContext.Provider>
}
