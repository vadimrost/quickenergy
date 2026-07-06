import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { LayoutTemplate, FilePlus, Trash2, ListChecks } from 'lucide-react'
import { toast } from 'sonner'
import { PageTitle } from '@/components/shared/PageTitle'
import { SectionCard } from '@/components/shared/SectionCard'
import { EmptyState } from '@/components/shared/EmptyState'
import { Button } from '@/components/ui/button'
import { formatEuro } from '@/lib/utils'
import { berechneSummen } from '@/features/auftraege/shared/positionenUtils'
import { useVorlagen, useDeleteVorlage } from '@/features/auftraege/shared/useVorlagen'
import type { DokumentVorlage } from '@/types/database'

export function VorlagenPage() {
  const navigate = useNavigate()
  const { data: vorlagen = [], isLoading } = useVorlagen('angebot')
  const { mutate: deleteVorlage } = useDeleteVorlage()
  const [confirmId, setConfirmId] = useState<string | null>(null)

  function handleUse(v: DokumentVorlage) {
    navigate('/angebote/neu', {
      state: {
        vorlage: {
          betreff: v.betreff ?? '',
          kopftext: v.kopftext ?? '',
          fusstext: v.fusstext ?? '',
          rabattGesamt: v.rabatt_gesamt_prozent ?? 0,
          positionen: (v.positionen ?? []).map((p, i) => ({ ...p, reihenfolge: i })),
        },
      },
    })
  }

  return (
    <div>
      <PageTitle
        title="Vorlagen"
        subtitle={`${vorlagen.length} Angebots-Vorlage${vorlagen.length === 1 ? '' : 'n'}`}
        actions={
          <Button variant="outline" onClick={() => navigate('/angebote/neu')}>
            <FilePlus size={14} className="mr-1.5" /> Neues Angebot
          </Button>
        }
      />

      <p className="text-sm text-ink-muted mb-5 max-w-2xl">
        Vorlagen speichern Positionen, Betreff und Kopf-/Fußtext für wiederkehrende Angebote
        (z.B. Klimaanlagen). Neue Vorlagen legst du direkt im Angebot über „Vorlage laden →
        Aktuelle Positionen als Vorlage speichern" an.
      </p>

      {isLoading ? (
        <SectionCard><div className="py-8 text-center text-sm text-ink-muted">Laden…</div></SectionCard>
      ) : vorlagen.length === 0 ? (
        <EmptyState
          icon={<LayoutTemplate size={24} />}
          title="Noch keine Vorlagen"
          description={'Öffne ein Angebot, trage die Positionen ein und speichere sie über „Vorlage laden → Aktuelle Positionen als Vorlage speichern".'}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {vorlagen.map(v => {
            const summen = berechneSummen(v.positionen ?? [], v.rabatt_gesamt_prozent ?? 0)
            const anzahl = v.positionen?.length ?? 0
            return (
              <div
                key={v.id}
                className="bg-bg-surface border border-border/50 rounded-card p-4 shadow-card flex flex-col"
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-accent-50 flex items-center justify-center shrink-0">
                      <LayoutTemplate size={15} className="text-accent-500" />
                    </div>
                    <h3 className="text-sm font-semibold text-ink leading-snug line-clamp-2">{v.name}</h3>
                  </div>
                  {confirmId === v.id ? (
                    <button
                      onClick={() => {
                        deleteVorlage(v.id, {
                          onSuccess: () => toast.success('Vorlage gelöscht'),
                          onError: e => toast.error(String(e)),
                        })
                        setConfirmId(null)
                      }}
                      className="shrink-0 w-7 h-7 rounded-lg bg-red-500 hover:bg-red-600 text-white flex items-center justify-center transition-colors"
                      title="Wirklich löschen?"
                    >
                      <Trash2 size={13} />
                    </button>
                  ) : (
                    <button
                      onClick={() => setConfirmId(v.id)}
                      className="shrink-0 w-7 h-7 rounded-lg text-ink-subtle hover:bg-red-50 hover:text-red-500 flex items-center justify-center transition-colors"
                      title="Vorlage löschen"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>

                {v.betreff && (
                  <p className="text-xs text-ink-muted line-clamp-2 mb-3">{v.betreff}</p>
                )}

                <div className="mt-auto flex items-center justify-between text-xs text-ink-muted pt-3 border-t border-border/50">
                  <span className="flex items-center gap-1.5">
                    <ListChecks size={12} /> {anzahl} {anzahl === 1 ? 'Position' : 'Positionen'}
                  </span>
                  <span className="font-semibold text-ink">{formatEuro(summen.brutto)}</span>
                </div>

                <Button size="sm" className="mt-3 w-full" onClick={() => handleUse(v)}>
                  <FilePlus size={13} className="mr-1.5" /> Angebot erstellen
                </Button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
