import { AlertOctagon, ArrowRight, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useRechnungen } from '@/features/inbox/useRechnungen'
import { useDismissDuplikat } from './useBuchung'
import type { Duplikat } from '@/types/database'

interface DuplikatWarningProps {
  duplikate: Duplikat[]
  currentId: string
}

export function DuplikatWarning({ duplikate, currentId }: DuplikatWarningProps) {
  const navigate = useNavigate()
  const { data: rechnungen = [] } = useRechnungen()
  const dismiss = useDismissDuplikat(currentId)

  if (!duplikate.length) return null

  return (
    <div className="bg-status-warning/5 border border-status-warning/30 rounded-card-sm p-4 mb-5">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg bg-status-warning/10 text-status-warning flex items-center justify-center flex-shrink-0">
          <AlertOctagon size={16} />
        </div>
        <div className="flex-1">
          <div className="text-sm font-semibold text-status-warning">
            Mögliches Duplikat erkannt
          </div>
          <div className="mt-1 space-y-2">
            {duplikate.map(d => {
              const otherId = d.rechnung_a_id === currentId ? d.rechnung_b_id : d.rechnung_a_id
              const other = rechnungen.find(r => r.id === otherId)
              const label = other?.rechnungsnr ?? otherId
              return (
                <div key={d.id} className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-sm text-ink-muted">
                    <span>Übereinstimmung {Math.round(d.match_score * 100)}% mit Rechnung</span>
                    <button
                      onClick={() => navigate(`/buchung/${otherId}`)}
                      className="inline-flex items-center gap-0.5 text-accent-600 hover:text-accent-700 font-medium font-mono"
                    >
                      {label} <ArrowRight size={12} />
                    </button>
                  </div>
                  <button
                    onClick={() => dismiss(otherId)}
                    title="Kein Duplikat — Warnung verwerfen"
                    className="flex-shrink-0 flex items-center gap-1 px-2 h-6 rounded-md text-xs text-ink-muted border border-border/60 hover:bg-status-warning/10 hover:text-status-warning hover:border-status-warning/30 transition-colors"
                  >
                    <X size={11} /> Kein Duplikat
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
