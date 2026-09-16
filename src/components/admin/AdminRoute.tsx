import { Link, Outlet } from 'react-router-dom'
import { useAuth } from '../../features/auth/useAuth'
import GlassPanel from '../common/GlassPanel'
import LoadingState from '../common/LoadingState'

export default function AdminRoute() {
  const { status, profile, profileLoading } = useAuth()

  if (status === 'initializing' || profileLoading) {
    return <LoadingState label="Checking administrator access..." />
  }

  if (status !== 'authenticated' || profile?.role !== 'admin') {
    return (
      <div className="container page admin-forbidden">
        <GlassPanel intensity="strong" className="admin-forbidden__panel">
          <p className="admin-forbidden__code">403</p>
          <h1 className="page__title">Administrator access required</h1>
          <p>
            Your account does not have permission to access this area. Administrator
            controls are also enforced by the database.
          </p>
          <Link className="btn btn--primary" to="/dashboard">
            Return to dashboard
          </Link>
        </GlassPanel>
      </div>
    )
  }

  return <Outlet />
}
