import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../../features/auth/useAuth'
import {
  isAccountDeactivated,
  isAccountSuspended,
} from '../../features/auth/auth-utils'
import LoadingState from '../common/LoadingState'
import ProfileUnavailable from '../common/ProfileUnavailable'

export default function ProtectedRoute() {
  const { status, isAuthenticated, profile, profileLoading, profileError, refreshProfile } =
    useAuth()
  const location = useLocation()

  if (status === 'initializing') {
    return <LoadingState label="Checking your session…" />
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  if (profileLoading) {
    return <LoadingState label="Loading your profile…" />
  }

  if (profile == null) {
    return (
      <ProfileUnavailable
        error={profileError}
        onRetry={() => void refreshProfile()}
      />
    )
  }

  if (isAccountSuspended(profile) || isAccountDeactivated(profile)) {
    return <Navigate to="/account-suspended" replace />
  }

  return <Outlet />
}
