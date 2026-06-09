import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Building2, User, AlertTriangle, Search } from 'lucide-react'
import { differenceInDays, parseISO } from 'date-fns'
import { PageTitle } from '@/components/shared/PageTitle'
import { SectionCard } from '@/components/shared/SectionCard'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { ErrorState } from '@/components/shared/ErrorState'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatEuro, formatDate } from '@/lib/utils'
import { useAusgangsrechnungen } from './useAusgangsrechnungen'
import type { AusgangsrechnungStatus } from '@/types/database'

type Tab = 'alle' | AusgangsrechnungStatus

const TABS: { key: Tab; label: string }[] = [
  { key: 'alle', label: 'Alle' },
  { key: 'entwurf', label: 'Entwurf' },
  { key: 'offen', label: 'Offen' },
  { key: 'teilbezahlt', label: 'Teilbezahlt' },
  { key: 'bezahlt', label: 'Bezahlt' },
  { key: 'storniert', label: 'Storniert' },
]

const STATUS_VARIANT: Record<AusgangsrechnungStatus, Parameters<typeof StatusBadge>[0]['variant']> = {
  entwurf: 'neutral',
  offen: 'info',
  teilbezahlt: 'warning',
  bezahlt: 'done',
  storniert: 'danger',
}

const TYP_LABEL: Record<string, string> = {
  rechnung: 'Rechnung',
  teilrechnung: 'Teilrechnung',
  schlussrechnung: 'Schlussrechnung',
  stornorechnung: 'Storno',
}

export function AusgangsrechnungPage() {
  const navigate = useNavigate()
  const { data: rechnungen = [], isLoading, isError, refetch } = useAusgangsrechnungen()
  const [tab, setTab] = useState<Tab>('alle')
  const [search, setSearch] = useState('')

  const byTab = tab === 'alle' ? rechnungen : rechnungen.filter(r => r.status === tab)
  const filtered = search
    ? byTab.filter(r => {
        const q = search.toLowerCase()
        return (
          r.rechnungsnummer?.toLowerCase().includes(q) ||
          r.betreff?.toLowerCase().includes(q) ||
          r.kunde?.firmenname?.toLowerCase().includes(q) ||
          (`${r.kunde?.vorname ?? ''} ${r.kunde?.nachname ?? ''}`).toLowerCase().includes(q)
        )
      })
    : byTab

  const today = new Date()
  const ueberfaellig = rechnungen.filter(r =>
    r.status === 'offen' && r.faelligkeitsdatum && differenceInDays(parseISO(r.faelligkeitsdatum), today) < 0
  ).length

  return (
    <div>
      <PageTitle
        title="Ausgangsrechnungen"
        subtitle={`${rechnungen.length} Rechnungen gesamt`}
        actions={
          <Button onClick={() => navigate('/ausgangsrechnungen/neu')}>
            <Plus size={14} className="mr-1.5" /> Rechnung erstellen
          </Button>
        }
      />

      {ueberfaellig > 0 && (
        <div className="mb-4 flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 text-sm text-red-700">
          <AlertTriangle size={14} />
          <span><strong>{ueberfaellig}</strong> überfällige {ueberfaellig === 1 ? 'Rechnung' : 'Rechnungen'} — bitte prüfen!</span>
        </div>
      )}

      <div className="relative mb-4 max-w-sm">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
        <Input
          placeholder="Suchen nach Nr., Kunde, Betreff…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-8 h-8 text-sm"
        />
      </div>

      <div className="flex items-center gap-0 border-b border-border mb-5">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === t.key
                ? 'border-accent-500 text-accent-600'
                : 'border-transparent text-ink-muted hover:text-ink'
            }`}
          >
            {t.label}
            {t.key !== 'alle' && (
              <span className="ml-1.5 text-xs text-ink-muted">
                ({rechnungen.filter(r => r.status === t.key).length})
              </span>
            )}
          </button>
        ))}
      </div>

      <SectionCard>
        <div className="grid grid-cols-[130px_110px_1fr_110px_110px_130px] gap-4 px-1 mb-2">
          {['Status', 'Nr.', 'Kunde / Betreff', 'Datum', 'Fällig', 'Betrag (Brutto)'].map(h => (
            <span key={h} className="text-xs font-medium text-ink-muted uppercase tracking-wide">{h}</span>
          ))}
        </div>

        {isLoading && <div className="py-8 text-center text-sm text-ink-muted">Laden…</div>}
        {isError && <ErrorState description="Rechnungen konnten nicht geladen werden." onRetry={refetch} />}
        {!isLoading && !isError && filtered.length === 0 && (
          <div className="py-12 text-center text-sm text-ink-muted">
            {search ? 'Keine Treffer für diese Suche' : 'Keine Rechnungen vorhanden'}
          </div>
        )}

        <div className="space-y-0">
          {filtered.map(r => {
            const istUeberfaellig = r.status === 'offen' && r.faelligkeitsdatum &&
              differenceInDays(parseISO(r.faelligkeitsdatum), today) < 0
            return (
              <div
                key={r.id}
                onClick={() => navigate(`/ausgangsrechnungen/${r.id}`)}
                className="grid grid-cols-[130px_110px_1fr_110px_110px_130px] gap-4 items-center py-3 border-b border-border/50 last:border-0 cursor-pointer hover:bg-bg-hover -mx-6 px-6 transition-colors"
              >
                <div className="flex flex-col gap-0.5">
                  <StatusBadge variant={STATUS_VARIANT[r.status]} label={r.status.charAt(0).toUpperCase() + r.status.slice(1)} />
                  {r.typ !== 'rechnung' && (
                    <span className="text-label text-ink-muted">{TYP_LABEL[r.typ]}</span>
                  )}
                </div>
                <span className="text-sm font-mono text-ink-muted">{r.rechnungsnummer || '- - -'}</span>
                <div>
                  <div className="text-sm font-medium text-ink flex items-center gap-1.5">
                    {r.kunde?.firmenname
                      ? <><Building2 size={12} className="text-ink-muted" />{r.kunde.firmenname}</>
                      : r.kunde
                      ? <><User size={12} className="text-ink-muted" />{r.kunde.vorname} {r.kunde.nachname}</>
                      : <span className="text-ink-muted">—</span>
                    }
                  </div>
                  <div className="text-xs text-ink-muted truncate">{r.betreff}</div>
                </div>
                <span className="text-sm text-ink-muted">{formatDate(r.rechnungsdatum)}</span>
                <span className={`text-sm ${istUeberfaellig ? 'text-red-600 font-medium' : 'text-ink-muted'}`}>
                  {r.faelligkeitsdatum ? formatDate(r.faelligkeitsdatum) : '—'}
                  {istUeberfaellig && <AlertTriangle size={10} className="inline ml-1" />}
                </span>
                <span className="text-sm font-semibold text-ink text-right">{formatEuro(r.summe_brutto)}</span>
              </div>
            )
          })}
        </div>
      </SectionCard>
    </div>
  )
}
