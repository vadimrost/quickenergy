import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface StatCardProps {
  label: string
  value: string
  sub?: string
  accent?: boolean
  className?: string
  icon?: ReactNode
}

export function StatCard({ label, value, sub, accent = false, className, icon }: StatCardProps) {
  return (
    <div
      className={cn(
        'card-base p-7 transition-shadow hover:shadow-card-hover',
        accent && 'bg-gradient-to-br from-accent-50 to-white border-accent-100',
        className
      )}
    >
      <div className="flex items-start justify-between mb-3">
        <span className="label-caps">{label}</span>
        {icon && <span className="text-ink-subtle">{icon}</span>}
      </div>
      <div className={cn('text-kpi font-normal', accent ? 'text-accent-500' : 'text-ink')}>
        {value}
      </div>
      {sub && <div className="text-sm text-ink-muted mt-1">{sub}</div>}
    </div>
  )
}
