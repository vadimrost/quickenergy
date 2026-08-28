import { useNavigate } from 'react-router-dom'
import { Truck, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { format, parseISO } from 'date-fns'
import { de } from 'date-fns/locale'
import { PageTitle } from '@/components/shared/PageTitle'
import { SectionCard } from '@/components/shared/SectionCard'
import { EmptyState } from '@/components/shared/EmptyState'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { useLieferscheine, useDeleteLieferschein } from './useLieferscheine'
import type { LieferscheinStatus } from '@/types/database'

const STATUS_CLS: Record<LieferscheinStatus, string> = {
  entwurf:    'bg-gray-100 text-gray-700',
  geliefert:  'bg-green-50 text-green-700',
  storniert:  'bg-red-50 text-red-700',
}
const STATUS_LABEL: Record<LieferscheinStatus, string> = {
  entwurf: 'Entwurf', geliefert: 'Geliefert', storniert: 'Storniert',
}

function kundeName(k: { firmenname?: string | null; vorname?: string | null; nachname?: string | null } | null | undefined) {
  if (!k) return '—'
  return k.firmenname || [k.vorname, k.nachname].filter(Boolean).join(' ') || '—'
}

export function LieferscheinPage() {
  const navigate = useNavigate()
  const { data: lieferscheine = [], isLoading } = useLieferscheine()
  const { mutate: del } = useDeleteLieferschein()

  return (
    <div>
      <PageTitle title="Lieferscheine" subtitle={`${lieferscheine.length} Lieferscheine`} />

      <SectionCard>
        {isLoading ? (
          <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : lieferscheine.length === 0 ? (
          <EmptyState
            icon={<Truck size={24} />}
            title="Noch keine Lieferscheine"
            description="Lieferscheine werden aus einem Angebot erzeugt — Button „Lieferschein“ in der Angebotsmaske."
          />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-ink-muted uppercase tracking-wide border-b border-border/60">
                <th className="text-left font-medium py-2 pr-3">Nummer</th>
                <th className="text-left font-medium py-2 pr-3">Kunde</th>
                <th className="text-left font-medium py-2 pr-3">Betreff</th>
                <th className="text-left font-medium py-2 pr-3">Lieferdatum</th>
                <th className="text-left font-medium py-2 pr-3">Status</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {lieferscheine.map(ls => (
                <tr
                  key={ls.id}
                  onClick={() => navigate(`/lieferscheine/${ls.id}`)}
                  className="border-b border-border/40 hover:bg-bg-muted/40 cursor-pointer transition-colors group"
                >
                  <td className="py-2.5 pr-3 font-mono text-ink">{ls.lieferschein_nr}</td>
                  <td className="py-2.5 pr-3 text-ink">{kundeName(ls.kunde)}</td>
                  <td className="py-2.5 pr-3 text-ink-muted truncate max-w-[260px]">{ls.betreff || '—'}</td>
                  <td className="py-2.5 pr-3 text-ink-muted">
                    {ls.lieferdatum ? format(parseISO(ls.lieferdatum), 'dd.MM.yyyy', { locale: de }) : '—'}
                  </td>
                  <td className="py-2.5 pr-3">
                    <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', STATUS_CLS[ls.status])}>
                      {STATUS_LABEL[ls.status]}
                    </span>
                  </td>
                  <td className="py-2.5" onClick={e => e.stopPropagation()}>
                    <button
                      onClick={() => {
                        if (confirm(`Lieferschein ${ls.lieferschein_nr} löschen?`)) {
                          del(ls.id, { onError: e => toast.error(String(e)) })
                        }
                      }}
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-ink-muted hover:text-status-danger hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SectionCard>
    </div>
  )
}
