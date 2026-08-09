import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../../features/auth/useAuth'
import { resolveReturnPath } from '../../features/auth/auth-utils'
import LoadingState from '../common/LoadingState'

export default function GuestRoute() {
  const { status, isAuthenticated } = useAuth()
  const location = useLocation()

  if (status === 'initializing') {
    return <LoadingState label="Checking your session…" />
  }

  if (isAuthenticated) {
    return <Navigate to={resolveReturnPath(location.state?.from)} replace />
  }

  return <Outlet />
}
