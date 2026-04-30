import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface SectionCardProps {
  title?: string
  actions?: ReactNode
  children: ReactNode
  className?: string
}

export function SectionCard({ title, actions, children, className }: SectionCardProps) {
  return (
    <div className={cn('card-base p-6', className)}>
      {(title || actions) && (
        <div className="flex items-center justify-between mb-5">
          {title && <span className="label-caps">{title}</span>}
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </div>
  )
}
