import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import { de } from 'date-fns/locale'
import { ArrowUpFromLine, CheckCircle, XCircle, Download, Database, Clock } from 'lucide-react'
import { PageTitle } from '@/components/shared/PageTitle'
import { StatCard } from '@/components/shared/StatCard'
import { SectionCard } from '@/components/shared/SectionCard'
import { EmptyState } from '@/components/shared/EmptyState'
import { ErrorState } from '@/components/shared/ErrorState'
import { Skeleton } from '@/components/ui/skeleton'
import { ExportButton } from './LexofficeExportButton'
import { useExportLog } from './useExports'
import { useRechnungen } from '@/features/inbox/useRechnungen'
import { cn, formatDate } from '@/lib/utils'
import type { ExportLog, ExportZiel } from '@/types/database'

const ZIEL_STYLES: Record<ExportZiel, string> = {
  lexoffice: 'bg-accent-50 text-accent-600 border-accent-200',
  datev: 'bg-ink/5 text-ink border-border',
}

function ExportZielBadge({ ziel }: { ziel: ExportZiel }) {
  return (
    <span className={cn('inline-flex items-center gap-1 text-label px-2.5 py-0.5 rounded-pill border', ZIEL_STYLES[ziel])}>
      {ziel === 'lexoffice' ? <ArrowUpFromLine size={10} /> : <Database size={10} />}
      {ziel === 'lexoffice' ? 'sevDesk' : 'DATEV'}
    </span>
  )
}

function formatExportDate(iso: string) {
  try {
    return format(parseISO(iso), "dd.MM.yyyy 'um' HH:mm 'Uhr'", { locale: de })
  } catch {
    return formatDate(iso)
  }
}

export function ExportsPage() {
  const { data: exportLog = [], isLoading: logLoading, isError: logError, refetch: logRefetch } = useExportLog()
  const { data: rechnungen = [] } = useRechnungen()
  const [selectedZiel, setSelectedZiel] = useState<ExportZiel | 'alle'>('alle')

  const bezahltIds = rechnungen.filter(r => r.status === 'bezahlt').map(r => r.id)
  const exportedToSevdesk = new Set(
    exportLog.filter(e => e.success && e.ziel === 'lexoffice').flatMap(e => e.rechnung_ids_json)
  )
  const exportedToDatev = new Set(
    exportLog.filter(e => e.success && e.ziel === 'datev').flatMap(e => e.rechnung_ids_json)
  )
  const ausstehendCount = bezahltIds.filter(
    id => !exportedToSevdesk.has(id) || !exportedToDatev.has(id)
  ).length
  const gebuchteIds = bezahltIds

  const sevdeskCount = exportLog.filter(e => e.ziel === 'lexoffice').length
  const datevCount = exportLog.filter(e => e.ziel === 'datev').length

  const filtered: ExportLog[] = exportLog.filter(e =>
    selectedZiel === 'alle' || e.ziel === selectedZiel
  )

  return (
    <div>
      <PageTitle title="Exports" subtitle="sevDesk- und DATEV-Exporthistorie" />

      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-5 mb-6">
        <StatCard label="Exports Gesamt" value={logLoading ? '…' : exportLog.length.toString()} sub="Alle Zeiträume" icon={<ArrowUpFromLine size={16} />} />
        <StatCard label="sevDesk" value={logLoading ? '…' : sevdeskCount.toString()} sub="Buchhalter-Exports" accent />
        <StatCard label="DATEV" value={logLoading ? '…' : datevCount.toString()} sub="Steuerberater-Exports" />
        <StatCard
          label="Ausstehend"
          value={logLoading ? '…' : ausstehendCount.toString()}
          sub={ausstehendCount > 0 ? 'Bereit zum Export' : 'Alles exportiert'}
          icon={<Clock size={16} />}
        />
      </div>

      {/* Export-Aktionen */}
      <SectionCard title="Neuer Export" className="mb-6">
        <div className="flex flex-col sm:flex-row items-start gap-6">
          <div className="flex-1 w-full">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-semibold text-ink">sevDesk</span>
              <span className="text-xs text-ink-muted">— Buchhaltung & Steuer</span>
            </div>
            <p className="text-xs text-ink-muted mb-3">
              Exportiert alle bezahlten Rechnungen ({gebuchteIds.length} ausstehend) als Belege nach sevDesk via n8n-Webhook.
            </p>
            <ExportButton rechnungIds={gebuchteIds} ziel="lexoffice" />
          </div>

          <div className="hidden sm:block w-px h-16 bg-border self-center" />
          <div className="sm:hidden w-full h-px bg-border" />

          <div className="flex-1 w-full">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-semibold text-ink">DATEV</span>
              <span className="text-xs text-ink-muted">— Für Steuerberater</span>
            </div>
            <p className="text-xs text-ink-muted mb-3">
              Generiert DATEV-kompatibles CSV mit Buchungsstapel für den Steuerberater-Import.
            </p>
            <ExportButton rechnungIds={gebuchteIds} ziel="datev" />
          </div>
        </div>

        {gebuchteIds.length === 0 && (
          <div className="mt-4 p-3 rounded-card-sm bg-bg-muted text-sm text-ink-muted text-center">
            Keine bezahlten Rechnungen für Export vorhanden.
          </div>
        )}
      </SectionCard>

      {/* Verlauf */}
      <SectionCard
        title="Export-Verlauf"
        actions={
          <div className="flex items-center gap-1">
            {(['alle', 'lexoffice', 'datev'] as const).map(z => (
              <button
                key={z}
                onClick={() => setSelectedZiel(z)}
                className={cn(
                  'px-3 h-7 rounded-pill text-label uppercase transition-colors',
                  selectedZiel === z ? 'bg-ink text-white' : 'text-ink-muted hover:bg-bg-muted'
                )}
              >
                {z === 'alle' ? 'Alle' : z === 'lexoffice' ? 'sevDesk' : 'DATEV'}
              </button>
            ))}
          </div>
        }
      >
        {logLoading ? (
          <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-14" />)}</div>
        ) : logError ? (
          <ErrorState onRetry={() => void logRefetch()} />
        ) : filtered.length === 0 ? (
          <EmptyState title="Noch keine Exports" description="Exportierte Buchungen erscheinen hier." icon={<ArrowUpFromLine size={24} />} />
        ) : (
          <>
            {/* Mobile cards */}
            <div className="md:hidden space-y-2">
              {filtered.map(e => (
                <div key={e.id} className="p-4 rounded-card border border-border/50 bg-bg-surface">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-1.5 text-sm text-ink">
                      <Clock size={13} className="text-ink-subtle flex-shrink-0" />
                      {formatExportDate(e.exported_at)}
                    </div>
                    <ExportZielBadge ziel={e.ziel} />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {e.success ? (
                        <div className="flex items-center gap-1 text-status-active text-xs">
                          <CheckCircle size={12} /> Erfolgreich
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 text-status-danger text-xs">
                          <XCircle size={12} /> Fehlgeschlagen
                        </div>
                      )}
                      <span className="text-xs text-ink-muted">{e.rechnung_ids_json.length} Rechnungen</span>
                    </div>
                    <button
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-ink-muted hover:bg-bg-muted transition-colors"
                      title="Herunterladen"
                    >
                      <Download size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    {['Datum', 'Ziel', 'Rechnungen', 'Status', ''].map(h => (
                      <th key={h} className={cn('label-caps pb-3 border-b border-border/50 text-left font-normal', h === 'Rechnungen' && 'text-right')}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(e => (
                    <tr key={e.id} className="h-14 border-b border-border/50 last:border-0 hover:bg-bg-hover transition-colors">
                      <td>
                        <div className="flex items-center gap-1.5 text-sm text-ink">
                          <Clock size={13} className="text-ink-subtle" />
                          {formatExportDate(e.exported_at)}
                        </div>
                      </td>
                      <td><ExportZielBadge ziel={e.ziel} /></td>
                      <td className="text-right text-sm text-ink-muted">{e.rechnung_ids_json.length} Rechnungen</td>
                      <td>
                        {e.success ? (
                          <div className="flex items-center gap-1.5 text-status-active text-sm">
                            <CheckCircle size={14} /> Erfolgreich
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 text-status-danger text-sm">
                            <XCircle size={14} /> Fehlgeschlagen
                          </div>
                        )}
                      </td>
                      <td className="text-right">
                        <button
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-ink-muted hover:bg-bg-muted ml-auto transition-colors"
                          title="Herunterladen"
                        >
                          <Download size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </SectionCard>
    </div>
  )
}
