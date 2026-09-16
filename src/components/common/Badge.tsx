import type { ReactNode } from 'react'

export type BadgeVariant =
  | 'draft'
  | 'active'
  | 'sold'
  | 'archived'
  | 'removed'
  | 'pending'
  | 'suspended'
  | 'confirmed'
  | 'submitted'
  | 'paid'
  | 'failed'
  | 'refunded'
  | 'partially_refunded'
  | 'rejected'
  | 'preparing'
  | 'shipped'
  | 'ready_for_pickup'
  | 'completed'
  | 'cancelled'
  | 'disputed'
  | 'open'
  | 'under_review'
  | 'resolved'
  | 'closed'
  | 'approved'
  | 'deactivated'
  | 'hidden'
  | 'dismissed'
  | 'admin'
  | 'neutral'

interface BadgeProps {
  variant?: BadgeVariant
  children: ReactNode
}

export default function Badge({ variant = 'neutral', children }: BadgeProps) {
  return <span className={`badge badge--${variant}`}>{children}</span>
}
