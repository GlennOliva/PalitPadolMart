import { Navigate, Outlet } from 'react-router-dom'
import { useSeller } from '../../features/seller/useSeller'
import LoadingState from '../common/LoadingState'

/**
 * Guards seller tool routes. Renders the seller area only when the current
 * user has an active seller profile; otherwise it redirects to onboarding
 * (no application yet) or the status page (pending/rejected/suspended).
 * The outer ProtectedRoute already guarantees an authenticated, active
 * main account. This is a UX guard — RLS is the real enforcement.
 */
export default function SellerRoute() {
  const { sellerProfile, sellerLoading } = useSeller()

  if (sellerLoading) {
    return <LoadingState label="Loading your seller account…" />
  }

  if (sellerProfile == null) {
    return <Navigate to="/seller/onboarding" replace />
  }

  if (sellerProfile.seller_status !== 'active') {
    return <Navigate to="/seller/status" replace />
  }

  return <Outlet />
}
