import { useEffect, useMemo } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import Alert from '../../components/common/Alert'
import LoadingState from '../../components/common/LoadingState'
import ProfileUnavailable from '../../components/common/ProfileUnavailable'
import { mapAuthError } from '../../features/auth/auth-errors'
import { isAccountBlocked, resolveReturnPath } from '../../features/auth/auth-utils'
import { useAuth } from '../../features/auth/useAuth'

function getCallbackError(search: string, hash: string) {
  const query = new URLSearchParams(search)
  const fragment = new URLSearchParams(hash.replace(/^#/, ''))
  const code = query.get('error_code') ?? query.get('error') ?? fragment.get('error_code') ?? fragment.get('error')
  return code == null ? null : mapAuthError({ code }).message
}

export default function OAuthCallbackPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const {
    status,
    profile,
    profileLoading,
    profileError,
    refreshProfile,
  } = useAuth()
  const callbackError = useMemo(
    () => getCallbackError(location.search, location.hash),
    [location.hash, location.search],
  )
  const nextPath = useMemo(() => {
    const next = new URLSearchParams(location.search).get('next')
    return resolveReturnPath(next)
  }, [location.search])

  useEffect(() => {
    if (callbackError != null) {
      window.history.replaceState({}, '', '/auth/callback')
    }
  }, [callbackError])

  useEffect(() => {
    if (callbackError != null || status !== 'authenticated' || profileLoading) return
    if (profile == null) return
    navigate(isAccountBlocked(profile) ? '/account-suspended' : nextPath, { replace: true })
  }, [callbackError, navigate, nextPath, profile, profileLoading, status])

  if (callbackError != null) {
    return (
      <div className="container auth-page oauth-callback">
        <h1 className="visually-hidden">Google sign-in</h1>
        <Alert variant="error" message={callbackError} />
        <Link className="btn btn--primary" to="/login" replace>
          Return to sign in
        </Link>
      </div>
    )
  }

  if (status === 'unauthenticated') {
    return (
      <div className="container auth-page oauth-callback">
        <h1 className="visually-hidden">Google sign-in</h1>
        <Alert
          variant="error"
          message="Google sign-in could not be completed. Please start the sign-in process again."
        />
        <Link className="btn btn--primary" to="/login" replace>
          Return to sign in
        </Link>
      </div>
    )
  }

  if (profileError != null && !profileLoading) {
    return (
      <div className="container auth-page oauth-callback">
        <ProfileUnavailable error={profileError} onRetry={() => void refreshProfile()} />
      </div>
    )
  }

  if (status === 'authenticated' && !profileLoading && profile == null) {
    return (
      <div className="container auth-page oauth-callback">
        <ProfileUnavailable
          error="We could not load your profile. Please try again."
          onRetry={() => void refreshProfile()}
        />
      </div>
    )
  }

  return (
    <div className="container auth-page oauth-callback">
      <h1 className="visually-hidden">Google sign-in</h1>
      <LoadingState label="Completing Google sign-in..." />
    </div>
  )
}
