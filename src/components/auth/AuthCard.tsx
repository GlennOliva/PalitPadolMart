import type { ReactNode } from 'react'

interface AuthCardProps {
  title: string
  subtitle?: string
  children: ReactNode
}

export default function AuthCard({ title, subtitle, children }: AuthCardProps) {
  return (
    <section className="auth-card" aria-labelledby="auth-card-title">
      <h1 className="auth-card__title" id="auth-card-title">
        {title}
      </h1>
      {subtitle != null ? <p className="auth-card__subtitle">{subtitle}</p> : null}
      {children}
    </section>
  )
}
