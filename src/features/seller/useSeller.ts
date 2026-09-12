import { useContext } from 'react'
import { SellerContext } from './SellerProvider'

export function useSeller() {
  const context = useContext(SellerContext)
  if (context == null) {
    throw new Error('useSeller must be used within a SellerProvider')
  }
  return context
}
