import type { ReactNode } from 'react'

interface PageHeaderProps {
  title: string
  intro?: string
  /** Optional actions rendered on the right (e.g. a primary button). */
  actions?: ReactNode
}

export default function PageHeader({ title, intro, actions }: PageHeaderProps) {
  return (
    <div className="page__heading">
      <div>
        <h1 className="page__title">{title}</h1>
        {intro != null ? <p className="page__intro">{intro}</p> : null}
      </div>
      {actions != null ? <div className="page__heading-actions">{actions}</div> : null}
    </div>
  )
}
