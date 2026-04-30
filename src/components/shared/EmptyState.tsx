import { Inbox } from 'lucide-react'
import { cn } from '@/lib/utils'

interface EmptyStateProps {
  title?: string
  description?: string
  className?: string
  icon?: React.ReactNode
}

export function EmptyState({
  title = 'Noch keine Daten',
  description = 'Hier erscheinen Daten, sobald sie verfügbar sind.',
  className,
  icon,
}: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-16 text-center', className)}>
      <div className="w-12 h-12 rounded-2xl bg-bg-muted flex items-center justify-center mb-4 text-ink-subtle">
        {icon ?? <Inbox size={24} />}
      </div>
      <p className="text-sm font-medium text-ink">{title}</p>
      <p className="text-sm text-ink-muted mt-1 max-w-xs">{description}</p>
    </div>
  )
}
