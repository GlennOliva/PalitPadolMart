import { Link } from 'react-router-dom'

interface AdminStatCardProps {
  label: string
  value: number | string
  href?: string
  accent?: boolean
}

export default function AdminStatCard({ label, value, href, accent = false }: AdminStatCardProps) {
  const className = `admin-stat-card${accent ? ' admin-stat-card--accent' : ''}`
  const content = (
    <>
      <span className="admin-stat-card__value">{value}</span>
      <span className="admin-stat-card__label">{label}</span>
    </>
  )

  if (href != null) {
    return (
      <Link to={href} className={className}>
        {content}
      </Link>
    )
  }

  return <div className={className}>{content}</div>
}