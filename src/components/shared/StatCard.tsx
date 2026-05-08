import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface StatCardProps {
  label: string
  value: string
  sub?: string
  accent?: boolean
  active?: boolean
  onClick?: () => void
  className?: string
  icon?: ReactNode
}

export function StatCard({ label, value, sub, accent = false, active = false, onClick, className, icon }: StatCardProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'card-base p-4 md:p-7 transition-all hover:shadow-card-hover',
        accent && 'bg-gradient-to-br from-accent-50 to-white border-accent-100',
        onClick && 'cursor-pointer select-none',
        active && 'ring-2 ring-ink ring-offset-1',
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
