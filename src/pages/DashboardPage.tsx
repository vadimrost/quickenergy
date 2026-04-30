import { useNavigate } from 'react-router-dom'
import { differenceInDays, parseISO } from 'date-fns'
import { FileText, Clock, TrendingUp, AlertTriangle, ArrowRight } from 'lucide-react'
import { PageTitle } from '@/components/shared/PageTitle'
import { StatCard } from '@/components/shared/StatCard'
import { SectionCard } from '@/components/shared/SectionCard'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { ProjectColorDot } from '@/components/shared/ProjectColorDot'
import { useRechnungen } from '@/features/inbox/useRechnungen'
import { useExportLog } from '@/features/exports/useExports'
import { formatEuro, formatDate } from '@/lib/utils'
import type { RechnungStatus } from '@/types/database'

const STATUS_VARIANT: Record<RechnungStatus, Parameters<typeof StatusBadge>[0]['variant']> = {
  eingegangen: 'info',
  'geprüft': 'warning',
  gebucht: 'active',
  bezahlt: 'done',
}
const STATUS_LABEL: Record<RechnungStatus, string> = {
  eingegangen: 'Neu', 'geprüft': 'In Prüfung', gebucht: 'Gebucht', bezahlt: 'Bezahlt',
}
const STATUS_BAR_COLOR: Record<RechnungStatus, string> = {
  eingegangen: '#3B82F6',
  'geprüft': '#F59E0B',
  gebucht: '#10B981',
  bezahlt: '#94A3B8',
}

export function DashboardPage() {
  const navigate = useNavigate()
  const { data: rechnungen = [] } = useRechnungen()
  const { data: exportLog = [] } = useExportLog()

  const offenBetrag = rechnungen
    .filter(r => r.status !== 'bezahlt')
    .reduce((sum, r) => sum + r.betrag, 0)

  const kpiEingegangen = rechnungen.filter(r => r.status === 'eingegangen').length
  const kpiInPruefung = rechnungen.filter(r => r.status === 'geprüft').length
  const kpiSkontoAlarm = rechnungen.filter(r => {
    if (!r.skonto_datum) return false
    const d = differenceInDays(parseISO(r.skonto_datum), new Date())
    return d >= 0 && d <= 3
  }).length

  const letzteRechnungen = rechnungen.slice(0, 5)
  const letzteExports = exportLog.slice(0, 3)

  return (
    <div>
      <PageTitle
        title="Invoice Automation Cockpit"
        subtitle="Übersicht aller Rechnungen und Verarbeitungsstatus"
      />

      {/* KPI Row */}
      <div className="grid grid-cols-4 gap-5 mb-6">
        <StatCard
          label="Offenes Volumen"
          value={formatEuro(offenBetrag)}
          sub={`${rechnungen.filter(r => r.status !== 'bezahlt').length} offene Rechnungen`}
          icon={<TrendingUp size={16} />}
        />
        <StatCard
          label="Neu Eingegangen"
          value={kpiEingegangen.toString()}
          sub="Warten auf Prüfung"
          icon={<FileText size={16} />}
        />
        <StatCard
          label="In Prüfung"
          value={kpiInPruefung.toString()}
          sub="Zur Freigabe ausstehend"
          accent
          icon={<Clock size={16} />}
        />
        <StatCard
          label="Skonto-Alarm"
          value={kpiSkontoAlarm.toString()}
          sub={kpiSkontoAlarm > 0 ? 'Frist innerhalb 3 Tagen!' : 'Keine dringenden Fristen'}
          icon={<AlertTriangle size={16} />}
        />
      </div>

      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-5">
          {/* Letzte Rechnungen */}
          <SectionCard
            title="Zuletzt Eingegangen"
            actions={
              <button onClick={() => navigate('/inbox')} className="flex items-center gap-1 text-xs text-accent-600 hover:text-accent-700 font-medium">
                Alle anzeigen <ArrowRight size={12} />
              </button>
            }
          >
            <div className="space-y-0">
              {letzteRechnungen.map(r => (
                <div
                  key={r.id}
                  onClick={() => navigate(`/buchung/${r.id}`)}
                  className="flex items-center gap-3 py-3 border-b border-border/50 last:border-0 cursor-pointer hover:bg-bg-hover -mx-6 px-6 transition-colors"
                >
                  <ProjectColorDot id={r.id} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-ink truncate">{r.lieferant?.name ?? '—'}</div>
                    <div className="text-xs text-ink-muted font-mono">{r.rechnungsnr}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold text-ink">{formatEuro(r.betrag)}</div>
                    <StatusBadge variant={STATUS_VARIANT[r.status]} label={STATUS_LABEL[r.status]} />
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>

          {/* Status-Übersicht */}
          <SectionCard title="Status-Übersicht">
            <div className="space-y-5">
              {(['eingegangen', 'geprüft', 'gebucht', 'bezahlt'] as RechnungStatus[]).map(s => {
                const count = rechnungen.filter(r => r.status === s).length
                const pct = rechnungen.length ? (count / rechnungen.length) * 100 : 0
                return (
                  <div key={s}>
                    <div className="flex items-center justify-between mb-2">
                      <StatusBadge variant={STATUS_VARIANT[s]} label={STATUS_LABEL[s]} />
                      <span className="text-sm font-medium text-ink">{count}</span>
                    </div>
                    <div className="h-1 bg-border rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${pct}%`, backgroundColor: STATUS_BAR_COLOR[s] }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </SectionCard>
        </div>

        {/* Letzte Exports */}
        <SectionCard
          title="Letzte Exports"
          actions={
            <button onClick={() => navigate('/exports')} className="flex items-center gap-1 text-xs text-accent-600 hover:text-accent-700 font-medium">
              Alle anzeigen <ArrowRight size={12} />
            </button>
          }
        >
          {letzteExports.length === 0 ? (
            <p className="text-sm text-ink-muted text-center py-4">Noch keine Exports</p>
          ) : (
            <div className="space-y-0">
              {letzteExports.map(e => (
                <div key={e.id} className="flex items-center gap-4 py-3 border-b border-border/50 last:border-0">
                  <span className={`text-label uppercase px-2.5 py-0.5 rounded-pill border ${e.ziel === 'lexoffice' ? 'bg-accent-50 text-accent-600 border-accent-200' : 'bg-bg-muted text-ink-muted border-border'}`}>
                    {e.ziel}
                  </span>
                  <span className="text-sm text-ink-muted flex-1">{formatDate(e.exported_at)} — {e.rechnung_ids_json.length} Rechnungen</span>
                  <span className={`text-xs font-medium ${e.success ? 'text-status-active' : 'text-status-danger'}`}>
                    {e.success ? 'Erfolgreich' : 'Fehlgeschlagen'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  )
}
