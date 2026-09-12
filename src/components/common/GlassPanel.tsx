import type { ReactNode } from 'react'

interface GlassPanelProps {
  /** Glass strength: soft | default | strong */
  intensity?: 'soft' | 'default' | 'strong'
  className?: string
  children: ReactNode
}

export default function GlassPanel({
  intensity = 'default',
  className = '',
  children,
}: GlassPanelProps) {
  const intensityClass =
    intensity === 'soft'
      ? 'glass--soft'
      : intensity === 'strong'
        ? 'glass--strong'
        : ''
  return <div className={`glass ${intensityClass} ${className}`.trim()}>{children}</div>
}
