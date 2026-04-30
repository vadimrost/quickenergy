import { cn } from '@/lib/utils'

type StatusVariant = 'active' | 'warning' | 'danger' | 'info' | 'review' | 'done' | 'neutral'

interface StatusBadgeProps {
  variant: StatusVariant
  label: string
  className?: string
}

const DOT_CLASSES: Record<StatusVariant, string> = {
  active:  'bg-status-active',
  warning: 'bg-status-warning',
  danger:  'bg-status-danger',
  info:    'bg-status-info',
  review:  'bg-accent-500',
  done:    'bg-ink-subtle',
  neutral: 'bg-ink-subtle',
}

const TEXT_CLASSES: Record<StatusVariant, string> = {
  active:  'text-status-active',
  warning: 'text-status-warning',
  danger:  'text-status-danger',
  info:    'text-status-info',
  review:  'text-accent-600',
  done:    'text-ink-subtle',
  neutral: 'text-ink-subtle',
}

export function StatusBadge({ variant, label, className }: StatusBadgeProps) {
  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', DOT_CLASSES[variant])} />
      <span className={cn('text-label uppercase', TEXT_CLASSES[variant])}>{label}</span>
    </span>
  )
}
