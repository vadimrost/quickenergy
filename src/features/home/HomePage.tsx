import { useMemo, useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { format, parseISO, subMonths, differenceInDays } from 'date-fns'
import { de } from 'date-fns/locale'
import { TrendingUp, TrendingDown, AlertTriangle, ArrowRight, Building2, User, ChevronDown, Timer, Percent, Layers, Download, FolderArchive } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import { PageTitle } from '@/components/shared/PageTitle'
import { ChatCommandBar } from './ChatCommandBar'
import { SectionCard } from '@/components/shared/SectionCard'
import { formatEuro, formatDate, cn } from '@/lib/utils'
import { useAusgangsrechnungen } from '@/features/auftraege/ausgangsrechnungen/useAusgangsrechnungen'
import { useRechnungen } from '@/features/inbox/useRechnungen'
import { useAngebote } from '@/features/auftraege/angebote/useAngebote'
import { useAuftragsbestatigungen } from '@/features/auftraege/auftragsbestatigungen/useAuftragsbestatigungen'
import { useLohnabrechnungen } from '@/features/lohn/useLohn'
import { useKontoauszuege } from '@/features/kontoauszug/useKontoauszug'
import { exportMonatsbericht, exportMonatsberichtBmd } from '@/lib/monatsbericht-export'
import { downloadBelegeZip } from '@/lib/belege-zip'

function KpiCard({
  label, value, sub, trend, accent, warn, onClick, icon,
}: {
  label: string
  value: string
  sub?: string
  trend?: 'up' | 'down' | null
  accent?: boolean
  warn?: boolean
  onClick?: () => void
  icon?: React.ReactNode
}) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'card-base p-5 md:p-6 transition-all',
        onClick && 'cursor-pointer hover:shadow-card-hover',
        accent && 'bg-gradient-to-br from-green-50 to-white border-green-100',
        warn && 'bg-gradient-to-br from-red-50 to-white border-red-100',
      )}
    >
      <div className="flex items-start justify-between mb-3">
        <span className="text-xs font-medium text-ink-muted uppercase tracking-widest">{label}</span>
        {icon && <span className="text-ink-subtle">{icon}</span>}
      </div>
      <div className={cn(
        'text-2xl md:text-3xl font-semibold tracking-tight',
        accent ? 'text-green-600' : warn ? 'text-red-600' : 'text-ink'
      )}>
        {value}
      </div>
      {(sub || trend) && (
        <div className="flex items-center gap-1.5 mt-2">
          {trend === 'up' && <TrendingUp size={12} className="text-green-500 flex-shrink-0" />}
          {trend === 'down' && <TrendingDown size={12} className="text-red-500 flex-shrink-0" />}
          {sub && <span className="text-xs text-ink-muted">{sub}</span>}
        </div>
      )}
    </div>
  )
}

function TaxRow({ label, value, muted }: { label: string; value: number; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-border/40 last:border-0">
      <span className={cn('text-sm', muted ? 'text-ink-muted' : 'text-ink')}>{label}</span>
      <span className={cn('text-sm font-medium tabular-nums', muted ? 'text-ink-muted' : 'text-ink')}>
        {formatEuro(value)}
      </span>
    </div>
  )
}

export function HomePage() {
  const navigate = useNavigate()
  const { data: ausgangsrechnungen = [] } = useAusgangsrechnungen()
  const { data: rechnungen = [] } = useRechnungen()
  const { data: angebote = [] } = useAngebote()
  const { data: auftragsbestatigungen = [] } = useAuftragsbestatigungen()
  const { data: lohnabrechnungen = [] } = useLohnabrechnungen()
  const { data: kontoauszuege = [] } = useKontoauszuege()

  const currentMonth = format(new Date(), 'yyyy-MM')
  const currentYear = format(new Date(), 'yyyy')
  const [periodMode, setPeriodMode] = useState<'monat' | 'jahr'>('monat')
  // selectedMonth holds either a month key ("yyyy-MM") or a year key ("yyyy").
  // Both work as a startsWith() prefix against the "yyyy-MM-dd" Rechnungsdatum.
  const [selectedMonth, setSelectedMonth] = useState(currentMonth)
  const [exportMenuOpen, setExportMenuOpen] = useState(false)
  const exportMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!exportMenuOpen) return
    function handleClick(e: MouseEvent) {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setExportMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [exportMenuOpen])

  const exportArgs = [selectedMonth, ausgangsrechnungen, rechnungen, lohnabrechnungen, kontoauszuege] as const

  const availableMonths = useMemo(() => {
    const months = new Set<string>()
    ausgangsrechnungen.forEach(r => { if (r.rechnungsdatum) months.add(r.rechnungsdatum.slice(0, 7)) })
    rechnungen.forEach(r => { if (r.rechnungsdatum) months.add(r.rechnungsdatum.slice(0, 7)) })
    if (!months.has(currentMonth)) months.add(currentMonth)
    return [...months].sort().reverse()
  }, [ausgangsrechnungen, rechnungen, currentMonth])

  const availableYears = useMemo(() => {
    const years = new Set<string>()
    ausgangsrechnungen.forEach(r => { if (r.rechnungsdatum) years.add(r.rechnungsdatum.slice(0, 4)) })
    rechnungen.forEach(r => { if (r.rechnungsdatum) years.add(r.rechnungsdatum.slice(0, 4)) })
    if (!years.has(currentYear)) years.add(currentYear)
    return [...years].sort().reverse()
  }, [ausgangsrechnungen, rechnungen, currentYear])

  // Switch between month and year overview, resetting the selected period.
  const changePeriodMode = (mode: 'monat' | 'jahr') => {
    if (mode === periodMode) return
    setPeriodMode(mode)
    setSelectedMonth(mode === 'jahr' ? currentYear : currentMonth)
  }

  // ── Finanz-KPIs ──────────────────────────────────────────
  const monatsumsatz = ausgangsrechnungen
    .filter(r => r.rechnungsdatum?.startsWith(selectedMonth))
    .reduce((s, r) => s + (r.summe_brutto ?? 0), 0)

  const monatsaufwand = rechnungen
    .filter(r => r.rechnungsdatum?.startsWith(selectedMonth))
    .reduce((s, r) => {
      const netto = (r.ocr_json as any)?.invoice_net_amount ?? r.betrag
      return s + netto * (1 + r.ust_satz / 100)
    }, 0)

  const gewinn = monatsumsatz - monatsaufwand

  const offeneForderungen = ausgangsrechnungen.filter(r => r.status === 'offen')
  const offeneForderungenTotal = offeneForderungen.reduce((s, r) => s + (r.summe_brutto ?? 0), 0)
  const ueberfaelligCount = offeneForderungen.filter(r =>
    r.faelligkeitsdatum && parseISO(r.faelligkeitsdatum) < new Date()
  ).length

  // ── Pipeline-Metriken ─────────────────────────────────────
  const submittedAngebote = angebote.filter(a => a.status !== 'entwurf')
  const convertedAngebote = angebote.filter(a => a.status === 'berechnet' || a.status === 'teilberechnet')
  const conversionRate = submittedAngebote.length > 0
    ? Math.round(convertedAngebote.length / submittedAngebote.length * 100)
    : null

  const pipelineWert = angebote
    .filter(a => a.status === 'offen')
    .reduce((s, a) => s + (a.summe_brutto ?? 0), 0)

  const avgDurchlaufzeit = useMemo(() => {
    const zeiten = auftragsbestatigungen
      .filter(ab => ab.angebot_id && ab.ab_datum)
      .map(ab => {
        const angebot = angebote.find(a => a.id === ab.angebot_id)
        if (!angebot?.angebotsdatum) return null
        const days = differenceInDays(parseISO(ab.ab_datum), parseISO(angebot.angebotsdatum))
        return days >= 0 ? days : null
      })
      .filter((d): d is number => d !== null)
    if (zeiten.length === 0) return null
    return Math.round(zeiten.reduce((s, d) => s + d, 0) / zeiten.length)
  }, [auftragsbestatigungen, angebote])

  // ── Steuer-Vorschau (monatsbezogen) ──────────────────────
  const arImMonat = ausgangsrechnungen.filter(r => r.rechnungsdatum?.startsWith(selectedMonth))
  const ustAusgang20 = arImMonat.reduce((s, r) => s + (r.ust_20 ?? 0), 0)
  const ustAusgang10 = arImMonat.reduce((s, r) => s + (r.ust_10 ?? 0), 0)
  const ustAusgangTotal = ustAusgang20 + ustAusgang10

  const erImMonat = rechnungen.filter(r => r.rechnungsdatum?.startsWith(selectedMonth))
  const vorsteuer20 = erImMonat.reduce((s, r) => s + (r.mwst_20 ?? 0), 0)
  const vorsteuer10 = erImMonat.reduce((s, r) => s + (r.mwst_10 ?? 0), 0)
  const vorsteuerTotal = vorsteuer20 + vorsteuer10

  const zahllast = ustAusgangTotal - vorsteuerTotal

  // ── Chart-Daten ───────────────────────────────────────────
  const chartData = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => {
      const date = subMonths(new Date(), 11 - i)
      const month = format(date, 'yyyy-MM')
      const einnahmen = ausgangsrechnungen
        .filter(r => r.rechnungsdatum?.startsWith(month))
        .reduce((s, r) => s + (r.summe_brutto ?? 0), 0)
      const ausgaben = rechnungen
        .filter(r => r.rechnungsdatum?.startsWith(month))
        .reduce((s, r) => {
          const netto = (r.ocr_json as any)?.invoice_net_amount ?? r.betrag
          return s + netto * (1 + r.ust_satz / 100)
        }, 0)
      return {
        label: format(date, 'MMM', { locale: de }),
        month,
        einnahmen: Math.round(einnahmen),
        ausgaben: Math.round(ausgaben),
      }
    })
  }, [ausgangsrechnungen, rechnungen])

  const openArList = [...offeneForderungen]
    .sort((a, b) => {
      const aDays = a.faelligkeitsdatum ? differenceInDays(new Date(), parseISO(a.faelligkeitsdatum)) : -999
      const bDays = b.faelligkeitsdatum ? differenceInDays(new Date(), parseISO(b.faelligkeitsdatum)) : -999
      return bDays - aDays
    })
    .slice(0, 6)

  const monthLabel = periodMode === 'jahr'
    ? `Jahr ${selectedMonth}`
    : format(parseISO(`${selectedMonth}-01`), 'MMMM yyyy', { locale: de })

  return (
    <div className="space-y-5">
      <PageTitle
        title="Übersicht"
        subtitle={monthLabel}
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => downloadBelegeZip(selectedMonth, rechnungen, ausgangsrechnungen)}
              className="h-9 px-3 flex items-center gap-1.5 text-sm border border-border rounded-card-sm bg-bg-surface text-ink hover:bg-bg-muted transition-colors"
              title="Belege als ZIP herunterladen"
            >
              <FolderArchive size={14} />
              <span className="hidden sm:inline">Belege ZIP</span>
            </button>
            {/* Monat / Jahr Umschalter */}
            <div className="flex items-center h-9 rounded-card-sm border border-border bg-bg-surface overflow-hidden">
              {(['monat', 'jahr'] as const).map(mode => (
                <button
                  key={mode}
                  onClick={() => changePeriodMode(mode)}
                  className={cn(
                    'h-full px-3 text-sm transition-colors',
                    periodMode === mode
                      ? 'bg-accent-500 text-white'
                      : 'text-ink-muted hover:bg-bg-muted'
                  )}
                >
                  {mode === 'monat' ? 'Monat' : 'Jahr'}
                </button>
              ))}
            </div>
            <div className="relative">
              <select
                value={selectedMonth}
                onChange={e => setSelectedMonth(e.target.value)}
                className="h-9 pl-3 pr-8 text-sm border border-border rounded-card-sm bg-bg-surface text-ink appearance-none cursor-pointer focus:outline-none focus:ring-1 focus:ring-accent-400"
              >
                {periodMode === 'jahr'
                  ? availableYears.map(y => (
                      <option key={y} value={y}>{y}</option>
                    ))
                  : availableMonths.map(m => (
                      <option key={m} value={m}>
                        {format(parseISO(`${m}-01`), 'MMMM yyyy', { locale: de })}
                      </option>
                    ))}
              </select>
              <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-ink-muted" />
            </div>
            <div ref={exportMenuRef} className="relative">
              <div className="flex items-center border border-border rounded-card-sm bg-bg-surface overflow-hidden">
                <button
                  onClick={() => exportMonatsberichtBmd(...exportArgs)}
                  className="h-9 pl-3 pr-2 flex items-center gap-1.5 text-sm text-ink hover:bg-bg-muted transition-colors"
                  title="Monatsbericht BMD exportieren"
                >
                  <Download size={14} />
                  <span className="hidden sm:inline">Monatsbericht</span>
                </button>
                <button
                  onClick={() => setExportMenuOpen(v => !v)}
                  className="h-9 px-1.5 border-l border-border text-ink-muted hover:bg-bg-muted transition-colors"
                  title="Exportformat wählen"
                >
                  <ChevronDown size={13} />
                </button>
              </div>
              {exportMenuOpen && (
                <div className="absolute right-0 top-full mt-1 w-44 bg-bg-surface border border-border rounded-card-sm shadow-card z-50 py-1">
                  <button
                    onClick={() => { exportMonatsberichtBmd(...exportArgs); setExportMenuOpen(false) }}
                    className="w-full px-3 py-2 text-sm text-left text-ink hover:bg-bg-muted transition-colors flex items-center gap-2"
                  >
                    <Download size={13} />
                    BMD Format
                  </button>
                  <button
                    onClick={() => { exportMonatsbericht(...exportArgs); setExportMenuOpen(false) }}
                    className="w-full px-3 py-2 text-sm text-left text-ink hover:bg-bg-muted transition-colors flex items-center gap-2"
                  >
                    <Download size={13} />
                    Allgemein (Excel)
                  </button>
                </div>
              )}
            </div>
          </div>
        }
      />

      {/* AI Command Bar */}
      <ChatCommandBar />

      {/* Finanz-KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <KpiCard
          label="Umsatz"
          value={formatEuro(monatsumsatz)}
          sub="Ausgestellte Rechnungen"
          onClick={() => navigate('/ausgangsrechnungen')}
        />
        <KpiCard
          label="Aufwand"
          value={formatEuro(monatsaufwand)}
          sub="Eingangsrechnungen"
          onClick={() => navigate('/rechnungen')}
        />
        <KpiCard
          label="Gewinn"
          value={formatEuro(gewinn)}
          sub={gewinn >= 0 ? 'Positiv' : 'Negativ'}
          trend={monatsumsatz > 0 || monatsaufwand > 0 ? (gewinn >= 0 ? 'up' : 'down') : null}
          accent={gewinn > 0}
          warn={gewinn < 0}
        />
        <KpiCard
          label="Offene Forderungen"
          value={formatEuro(offeneForderungenTotal)}
          sub={
            ueberfaelligCount > 0
              ? `${ueberfaelligCount} überfällig`
              : offeneForderungen.length > 0
                ? `${offeneForderungen.length} offen`
                : 'Alles beglichen'
          }
          trend={ueberfaelligCount > 0 ? 'down' : null}
          onClick={() => navigate('/ausgangsrechnungen')}
        />
      </div>

      {/* Chart + Offene Forderungen */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <SectionCard title="Ertrag / Aufwand — letzte 12 Monate" className="lg:col-span-2">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData} barCategoryGap="35%" barGap={2}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
              <YAxis
                tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} width={36}
                tickFormatter={v => v >= 1000 ? `${Math.round(v / 1000)}k` : String(v)}
              />
              <Tooltip
                formatter={(value, name) => [formatEuro(Number(value)), name === 'einnahmen' ? 'Einnahmen' : 'Aufwand']}
                contentStyle={{ fontSize: 12, border: '1px solid #E2E8F0', borderRadius: 8, boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.08)', padding: '8px 12px' }}
                cursor={{ fill: '#F8FAFC' }}
              />
              <Bar dataKey="einnahmen" name="einnahmen" fill="#4ADE80" radius={[3, 3, 0, 0]} />
              <Bar dataKey="ausgaben" name="ausgaben" fill="#FB923C" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <div className="flex items-center gap-5 mt-3 pl-9">
            <div className="flex items-center gap-1.5 text-xs text-ink-muted">
              <div className="w-2.5 h-2.5 rounded-sm" style={{ background: '#4ADE80' }} /> Einnahmen
            </div>
            <div className="flex items-center gap-1.5 text-xs text-ink-muted">
              <div className="w-2.5 h-2.5 rounded-sm" style={{ background: '#FB923C' }} /> Aufwand
            </div>
          </div>
        </SectionCard>

        <SectionCard
          title="Offene Forderungen"
          actions={
            offeneForderungen.length > 6 ? (
              <button onClick={() => navigate('/ausgangsrechnungen')} className="flex items-center gap-1 text-xs text-accent-500 hover:text-accent-600 transition-colors">
                Alle ({offeneForderungen.length}) <ArrowRight size={11} />
              </button>
            ) : undefined
          }
        >
          {openArList.length === 0 ? (
            <div className="py-10 text-center">
              <div className="text-2xl mb-1">✓</div>
              <div className="text-sm text-ink-muted">Keine offenen Forderungen</div>
            </div>
          ) : (
            <div>
              {openArList.map(r => {
                const isOverdue = r.faelligkeitsdatum && parseISO(r.faelligkeitsdatum) < new Date()
                const daysOverdue = r.faelligkeitsdatum ? differenceInDays(new Date(), parseISO(r.faelligkeitsdatum)) : 0
                return (
                  <div
                    key={r.id}
                    onClick={() => navigate(`/ausgangsrechnungen/${r.id}`)}
                    className="flex items-center justify-between py-2.5 border-b border-border/40 last:border-0 cursor-pointer hover:bg-bg-hover -mx-6 px-6 transition-colors"
                  >
                    <div className="min-w-0 flex-1 pr-3">
                      <div className="text-sm font-medium text-ink flex items-center gap-1.5 truncate">
                        {r.kunde?.firmenname
                          ? <><Building2 size={10} className="text-ink-muted flex-shrink-0" />{r.kunde.firmenname}</>
                          : r.kunde
                          ? <><User size={10} className="text-ink-muted flex-shrink-0" />{r.kunde.vorname} {r.kunde.nachname}</>
                          : <span className="text-ink-muted">—</span>
                        }
                      </div>
                      {isOverdue && daysOverdue > 0 ? (
                        <div className="text-xs text-red-500 flex items-center gap-1 mt-0.5">
                          <AlertTriangle size={9} className="flex-shrink-0" />
                          {daysOverdue} {daysOverdue === 1 ? 'Tag' : 'Tage'} überfällig
                        </div>
                      ) : r.faelligkeitsdatum ? (
                        <div className="text-xs text-ink-muted mt-0.5">Fällig {formatDate(r.faelligkeitsdatum)}</div>
                      ) : null}
                    </div>
                    <span className="text-sm font-semibold text-ink flex-shrink-0">{formatEuro(r.summe_brutto ?? 0)}</span>
                  </div>
                )
              })}
            </div>
          )}
        </SectionCard>
      </div>

      {/* Pipeline + Steuer */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Pipeline */}
        <SectionCard
          title="Angebots-Pipeline"
          actions={
            <button onClick={() => navigate('/angebote')} className="flex items-center gap-1 text-xs text-accent-500 hover:text-accent-600 transition-colors">
              Angebote <ArrowRight size={11} />
            </button>
          }
        >
          <div className="grid grid-cols-3 gap-3">
            {/* Conversion Rate */}
            <div className="rounded-xl border border-border bg-bg-muted/30 p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-ink-muted uppercase tracking-wide">Conversion</span>
                <Percent size={13} className="text-ink-subtle" />
              </div>
              <div className="text-2xl font-semibold text-ink">
                {conversionRate !== null ? `${conversionRate}%` : '—'}
              </div>
              <div className="text-xs text-ink-muted mt-1">
                {convertedAngebote.length} von {submittedAngebote.length} Angeboten
              </div>
            </div>

            {/* Pipeline Wert */}
            <div className="rounded-xl border border-border bg-bg-muted/30 p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-ink-muted uppercase tracking-wide">Pipeline</span>
                <Layers size={13} className="text-ink-subtle" />
              </div>
              <div className="text-2xl font-semibold text-ink">{formatEuro(pipelineWert)}</div>
              <div className="text-xs text-ink-muted mt-1">
                {angebote.filter(a => a.status === 'offen').length} offene Angebote
              </div>
            </div>

            {/* Ø Durchlaufzeit */}
            <div className="rounded-xl border border-border bg-bg-muted/30 p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-ink-muted uppercase tracking-wide">Ø Laufzeit</span>
                <Timer size={13} className="text-ink-subtle" />
              </div>
              <div className="text-2xl font-semibold text-ink">
                {avgDurchlaufzeit !== null ? `${avgDurchlaufzeit}d` : '—'}
              </div>
              <div className="text-xs text-ink-muted mt-1">Angebot → AB</div>
            </div>
          </div>

          {/* Funnel bar */}
          {angebote.length > 0 && (
            <div className="mt-4 space-y-2">
              {(
                [
                  { label: 'Offen', status: 'offen', color: 'bg-blue-400' },
                  { label: 'In AB umgewandelt', status: 'berechnet', color: 'bg-green-400' },
                  { label: 'Teilberechnet', status: 'teilberechnet', color: 'bg-amber-400' },
                  { label: 'Abgelehnt', status: 'abgelehnt', color: 'bg-red-300' },
                ] as const
              ).map(({ label, status, color }) => {
                const count = angebote.filter(a => a.status === status).length
                const pct = angebote.length > 0 ? (count / angebote.length) * 100 : 0
                if (count === 0) return null
                return (
                  <div key={status}>
                    <div className="flex items-center justify-between text-xs text-ink-muted mb-1">
                      <span>{label}</span>
                      <span>{count}</span>
                    </div>
                    <div className="h-1.5 bg-bg-muted rounded-full overflow-hidden">
                      <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </SectionCard>

        {/* Steuer-Vorschau */}
        <SectionCard title={`Steuer-Vorschau — ${monthLabel}`}>
          <div className="grid grid-cols-2 gap-4">

            {/* Umsatzsteuer */}
            <div>
              <div className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-3">Umsatzsteuer</div>
              <TaxRow label="20 % USt." value={ustAusgang20} muted />
              <TaxRow label="10 % USt." value={ustAusgang10} muted />
              <div className="flex items-center justify-between pt-2.5 mt-1">
                <span className="text-sm font-semibold text-ink">Gesamt</span>
                <span className="text-sm font-semibold text-ink tabular-nums">{formatEuro(ustAusgangTotal)}</span>
              </div>
            </div>

            {/* Vorsteuer */}
            <div>
              <div className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-3">Vorsteuer</div>
              <TaxRow label="20 % VSt." value={vorsteuer20} muted />
              <TaxRow label="10 % VSt." value={vorsteuer10} muted />
              <div className="flex items-center justify-between pt-2.5 mt-1">
                <span className="text-sm font-semibold text-ink">Gesamt</span>
                <span className="text-sm font-semibold text-ink tabular-nums">{formatEuro(vorsteuerTotal)}</span>
              </div>
            </div>
          </div>

          {/* Zahllast */}
          <div className={cn(
            'mt-4 rounded-xl p-4 flex items-center justify-between',
            zahllast > 0 ? 'bg-red-50 border border-red-100' : 'bg-green-50 border border-green-100'
          )}>
            <div>
              <div className="text-xs font-medium uppercase tracking-wide mb-0.5 text-ink-muted">USt.-Zahllast</div>
              <div className="text-xs text-ink-muted">Umsatzsteuer − Vorsteuer</div>
            </div>
            <div className={cn(
              'text-2xl font-semibold tabular-nums',
              zahllast > 0 ? 'text-red-600' : 'text-green-600'
            )}>
              {formatEuro(zahllast)}
            </div>
          </div>

          <div className="mt-3 text-xs text-ink-muted">
            Basiert auf Rechnungsdatum. Kein Ersatz für steuerliche Beratung.
          </div>
        </SectionCard>

      </div>
    </div>
  )
}
