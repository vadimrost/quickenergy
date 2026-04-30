import { differenceInDays, parseISO } from 'date-fns'
import { Clock, AlertTriangle, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDate } from '@/lib/utils'

interface SkontoAlertProps {
  skontoDatum: string
  skontoProzent: number
  betrag: number
}

export function SkontoAlert({ skontoDatum, skontoProzent, betrag }: SkontoAlertProps) {
  const daysLeft = differenceInDays(parseISO(skontoDatum), new Date())
  const skontoWert = betrag * (skontoProzent / 100)
  const isUrgent = daysLeft <= 2
  const isExpired = daysLeft < 0

  if (isExpired) return null

  return (
    <div
      className={cn(
        'rounded-card-sm border p-4 mb-5 flex items-start gap-3',
        isUrgent
          ? 'bg-status-danger/5 border-status-danger/30'
          : 'bg-status-warning/5 border-status-warning/30'
      )}
    >
      <div
        className={cn(
          'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0',
          isUrgent ? 'bg-status-danger/10 text-status-danger' : 'bg-status-warning/10 text-status-warning'
        )}
      >
        {isUrgent ? <AlertTriangle size={16} /> : <Zap size={16} />}
      </div>

      <div className="flex-1 min-w-0">
        <div className={cn('text-sm font-semibold', isUrgent ? 'text-status-danger' : 'text-status-warning')}>
          {isUrgent ? 'Skonto-Frist läuft ab!' : 'Skonto verfügbar'}
        </div>
        <div className="text-sm text-ink-muted mt-0.5">
          {skontoProzent}% Skonto bis <span className="font-medium text-ink">{formatDate(skontoDatum)}</span>
          {' '}— Ersparnis{' '}
          <span className="font-semibold text-ink">
            € {skontoWert.toFixed(2)}
          </span>
        </div>
      </div>

      <div className="text-right flex-shrink-0">
        <div className="flex items-center gap-1.5 justify-end">
          <Clock size={13} className={isUrgent ? 'text-status-danger' : 'text-status-warning'} />
          <span className={cn('text-sm font-semibold', isUrgent ? 'text-status-danger' : 'text-status-warning')}>
            {daysLeft === 0 ? 'Heute!' : daysLeft === 1 ? 'Morgen' : `${daysLeft} Tage`}
          </span>
        </div>
      </div>
    </div>
  )
}
