import { useAuth } from '../features/auth/useAuth'
import { formatAccountStatus } from '../features/auth/auth-utils'

export default function AccountSuspendedPage() {
  const { profile, signOut } = useAuth()

  const statusLabel =
    profile != null ? formatAccountStatus(profile.account_status) : 'your account'

  return (
    <div className="container page">
      <section className="empty-state">
        <h1 className="empty-state__title">Account unavailable</h1>
        <p className="empty-state__body">
          {statusLabel} is currently inactive. If you believe this is a mistake,
          please contact support for help with your account.
        </p>
        <button
          type="button"
          className="btn"
          onClick={() => void signOut()}
        >
          Sign out
        </button>
      </section>
    </div>
  )
}
