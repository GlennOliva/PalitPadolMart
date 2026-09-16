import { Outlet } from 'react-router-dom'
import AdminNav from './AdminNav'

export default function AdminLayout() {
  return (
    <div className="container admin-shell">
      <AdminNav />
      <section className="admin-shell__content" aria-label="Administration workspace">
        <Outlet />
      </section>
    </div>
  )
}
