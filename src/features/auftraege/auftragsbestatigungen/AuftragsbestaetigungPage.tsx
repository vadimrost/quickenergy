import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Building2, User, Search } from 'lucide-react'
import { PageTitle } from '@/components/shared/PageTitle'
import { SectionCard } from '@/components/shared/SectionCard'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { ErrorState } from '@/components/shared/ErrorState'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatEuro, formatDate } from '@/lib/utils'
import { useAuftragsbestatigungen } from './useAuftragsbestatigungen'
import type { AuftragsbestaetigungStatus } from '@/types/database'

type Tab = 'alle' | AuftragsbestaetigungStatus

const TABS: { key: Tab; label: string }[] = [
  { key: 'alle', label: 'Alle' },
  { key: 'entwurf', label: 'Entwurf' },
  { key: 'erhalten', label: 'Erhalten' },
  { key: 'teilberechnet', label: 'Teilberechnet' },
  { key: 'berechnet', label: 'Berechnet' },
  { key: 'abgelehnt', label: 'Abgelehnt' },
  { key: 'archiv', label: 'Archiv' },
]

const STATUS_VARIANT: Record<AuftragsbestaetigungStatus, Parameters<typeof StatusBadge>[0]['variant']> = {
  entwurf: 'neutral',
  erhalten: 'active',
  teilberechnet: 'warning',
  berechnet: 'done',
  abgelehnt: 'danger',
  archiv: 'neutral',
}

export function AuftragsbestaetigungPage() {
  const navigate = useNavigate()
  const { data: abs = [], isLoading, isError, refetch } = useAuftragsbestatigungen()
  const [tab, setTab] = useState<Tab>('alle')
  const [search, setSearch] = useState('')

  const byTab = tab === 'alle' ? abs : abs.filter(a => a.status === tab)
  const filtered = search
    ? byTab.filter(a => {
        const q = search.toLowerCase()
        return (
          a.ab_nummer?.toLowerCase().includes(q) ||
          a.betreff?.toLowerCase().includes(q) ||
          a.kunde?.firmenname?.toLowerCase().includes(q) ||
          (`${a.kunde?.vorname ?? ''} ${a.kunde?.nachname ?? ''}`).toLowerCase().includes(q)
        )
      })
    : byTab

  return (
    <div>
      <PageTitle
        title="Auftragsbestätigungen"
        subtitle={`${abs.length} Auftragsbestätigungen gesamt`}
        actions={
          <Button onClick={() => navigate('/auftraege/neu')}>
            <Plus size={14} className="mr-1.5" /> Auftragsbestätigung erstellen
          </Button>
        }
      />

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
                ({abs.filter(a => a.status === t.key).length})
              </span>
            )}
          </button>
        ))}
      </div>

      <SectionCard>
        <div className="grid grid-cols-[140px_100px_1fr_110px_130px] gap-4 px-1 mb-2">
          {['Status', 'Nr.', 'Kunde / Betreff', 'Datum', 'Betrag (Brutto)'].map(h => (
            <span key={h} className="text-xs font-medium text-ink-muted uppercase tracking-wide">{h}</span>
          ))}
        </div>

        {isLoading && <div className="py-8 text-center text-sm text-ink-muted">Laden…</div>}
        {isError && <ErrorState description="Auftragsbestätigungen konnten nicht geladen werden." onRetry={refetch} />}
        {!isLoading && !isError && filtered.length === 0 && (
          <div className="py-12 text-center text-sm text-ink-muted">
            {search ? 'Keine Treffer für diese Suche' : 'Keine Auftragsbestätigungen vorhanden'}
          </div>
        )}

        <div className="space-y-0">
          {filtered.map(ab => (
            <div
              key={ab.id}
              onClick={() => navigate(`/auftraege/${ab.id}`)}
              className="grid grid-cols-[140px_100px_1fr_110px_130px] gap-4 items-center py-3 border-b border-border/50 last:border-0 cursor-pointer hover:bg-bg-hover -mx-6 px-6 transition-colors"
            >
              <StatusBadge variant={STATUS_VARIANT[ab.status]} label={ab.status.charAt(0).toUpperCase() + ab.status.slice(1)} />
              <span className="text-sm font-mono text-ink-muted">{ab.ab_nummer || '- - -'}</span>
              <div>
                <div className="text-sm font-medium text-ink flex items-center gap-1.5">
                  {ab.kunde?.firmenname
                    ? <><Building2 size={12} className="text-ink-muted" />{ab.kunde.firmenname}</>
                    : ab.kunde
                    ? <><User size={12} className="text-ink-muted" />{ab.kunde.vorname} {ab.kunde.nachname}</>
                    : <span className="text-ink-muted">—</span>
                  }
                </div>
                <div className="text-xs text-ink-muted truncate">{ab.betreff}</div>
              </div>
              <span className="text-sm text-ink-muted">{formatDate(ab.ab_datum)}</span>
              <span className="text-sm font-semibold text-ink text-right">{formatEuro(ab.summe_brutto)}</span>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  )
}
