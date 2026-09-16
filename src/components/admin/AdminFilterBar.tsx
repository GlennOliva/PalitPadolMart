import type { ReactNode } from 'react'

interface AdminFilterBarProps {
  children: ReactNode
  className?: string
}

export default function AdminFilterBar({ children, className = '' }: AdminFilterBarProps) {
  return <div className={`admin-filter-bar ${className}`.trim()}>{children}</div>
}