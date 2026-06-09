import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, BellRing, CheckCircle, Copy, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { PageTitle } from '@/components/shared/PageTitle'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useOffeneForderungen, useAdvanceMahnstufe, useMarkiereAusgangsrechnungBezahlt } from './useMahnwesen'
import { useFirmaStammdaten } from '@/features/einstellungen/useFirmaStammdaten'
import type { Ausgangsrechnung, FirmaStammdaten } from '@/types/database'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return new Intl.NumberFormat('de-AT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + ' EUR'
}
function fmtDate(d: string | null | undefined) {
  if (!d) return '—'
  const [y, m, day] = d.split('-')
  return `${day}.${m}.${y}`
}
function daysOverdue(faelligkeit: string | null): number {
  if (!faelligkeit) return 0
  const diff = new Date().getTime() - new Date(faelligkeit).getTime()
  return Math.floor(diff / (1000 * 60 * 60 * 24))
}
function kundenName(r: Ausgangsrechnung): string {
  const k = r.kunde
  if (!k) return '—'
  return k.firmenname ?? (`${k.vorname ?? ''} ${k.nachname ?? ''}`.trim() || '—')
}

// ─── Mahnstufe Badge ──────────────────────────────────────────────────────────

function MahnstufeBadge({ stufe }: { stufe: number }) {
  if (stufe === 0) return <span className="text-xs text-ink-subtle">—</span>
  const cls = stufe === 1
    ? 'bg-amber-50 text-amber-700'
    : stufe === 2
    ? 'bg-orange-50 text-orange-700'
    : 'bg-red-50 text-red-700'
  const label = stufe === 1 ? '1. Mahnung' : stufe === 2 ? '2. Mahnung' : '3. Mahnung'
  return <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium', cls)}>{label}</span>
}

// ─── Mahnschreiben Generator ──────────────────────────────────────────────────

function generateMahnschreiben(
  rechnung: Ausgangsrechnung,
  firma: FirmaStammdaten | null,
  neueStufe: 1 | 2 | 3,
  mahngebuehr: number,
): string {
  const heute = new Date().toLocaleDateString('de-AT')
  const neuesFaellig = new Date()
  neuesFaellig.setDate(neuesFaellig.getDate() + (neueStufe === 1 ? 14 : 7))
  const neuesFaelligStr = neuesFaellig.toLocaleDateString('de-AT')

  const absender = firma
    ? `${firma.name}\n${firma.strasse}\n${firma.plz_ort}\nTel: ${firma.tel} · E-Mail: ${firma.email}`
    : 'Quick Energy GmbH\nSieveringerstraße 56A\n1190 Wien'

  const bank = firma
    ? `  Bank: ${firma.bank}\n  IBAN: ${firma.iban}\n  BIC:  ${firma.bic}`
    : '  IBAN: AT62 2011 1290 2612 2005\n  BIC:  GIBAATWW'

  const gf = firma?.gf ?? 'Ihr Ansprechpartner'
  const firmenname = firma?.name ?? 'Quick Energy GmbH'

  const kunde = rechnung.kunde
  const empfaenger = [
    kundenName(rechnung),
    kunde?.adresse,
    kunde ? `${kunde.plz ?? ''} ${kunde.ort ?? ''}`.trim() : null,
  ].filter(Boolean).join('\n')

  const gesamtBetrag = rechnung.summe_brutto + mahngebuehr
  const vorherigDatum = neueStufe === 2
    ? fmtDate(rechnung.gemahnt_am_1)
    : neueStufe === 3
    ? fmtDate(rechnung.gemahnt_am_2)
    : null

  if (neueStufe === 1) {
    return `${absender}

${heute}

An:
${empfaenger}

Betreff: Zahlungserinnerung – Rechnung Nr. ${rechnung.rechnungsnummer}

Sehr geehrte Damen und Herren,

wir erlauben uns, auf folgende noch ausstehende Zahlung hinzuweisen:

  Rechnungs-Nr.:    ${rechnung.rechnungsnummer}
  Rechnungsdatum:   ${fmtDate(rechnung.rechnungsdatum)}
  Fälligkeitsdatum: ${fmtDate(rechnung.faelligkeitsdatum)}
  Offener Betrag:   ${fmt(rechnung.summe_brutto)}

Wir bitten Sie, den Betrag bis zum ${neuesFaelligStr} auf folgendes Konto zu überweisen:

${bank}
  Verwendungszweck: ${rechnung.rechnungsnummer}

Sollte sich Ihre Zahlung mit diesem Schreiben gekreuzt haben, bitten wir Sie, dieses Schreiben zu ignorieren.

Mit freundlichen Grüßen,
${gf}
${firmenname}`
  }

  return `${absender}

${heute}

An:
${empfaenger}

Betreff: ${neueStufe}. Mahnung – Rechnung Nr. ${rechnung.rechnungsnummer}

Sehr geehrte Damen und Herren,

leider mussten wir feststellen, dass trotz unserer Zahlungserinnerung vom ${vorherigDatum} die folgende Rechnung noch immer nicht beglichen wurde:

  Rechnungs-Nr.:    ${rechnung.rechnungsnummer}
  Rechnungsdatum:   ${fmtDate(rechnung.rechnungsdatum)}
  Fälligkeitsdatum: ${fmtDate(rechnung.faelligkeitsdatum)}
  Offener Betrag:   ${fmt(rechnung.summe_brutto)}${mahngebuehr > 0 ? `
  Mahngebühr:       ${fmt(mahngebuehr)}
  Gesamtbetrag:     ${fmt(gesamtBetrag)}` : ''}

Bitte überweisen Sie den ausstehenden Betrag bis spätestens ${neuesFaelligStr}:

${bank}
  Verwendungszweck: ${rechnung.rechnungsnummer}

Bei Fragen stehen wir Ihnen gerne zur Verfügung. Sollten Sie diese Angelegenheit nicht bis zum genannten Datum klären, behalten wir uns weitere rechtliche Schritte vor.

Mit freundlichen Grüßen,
${gf}
${firmenname}`
}

// ─── Mahnen Modal ─────────────────────────────────────────────────────────────

function MahnenModal({
  rechnung,
  firma,
  onClose,
}: {
  rechnung: Ausgangsrechnung
  firma: FirmaStammdaten | null
  onClose: () => void
}) {
  const neueStufe = Math.min((rechnung.mahnstufe ?? 0) + 1, 3) as 1 | 2 | 3
  const defaultGebuehr = neueStufe === 1 ? 0 : neueStufe === 2 ? 5 : 10
  const [mahngebuehr, setMahngebuehr] = useState(defaultGebuehr)
  const text = generateMahnschreiben(rechnung, firma, neueStufe, mahngebuehr)

  const { mutate: advance, isPending } = useAdvanceMahnstufe()

  function handleBestaetigen() {
    advance({ id: rechnung.id, neueStufe, mahngebuehr }, {
      onSuccess: () => {
        toast.success(`${neueStufe === 1 ? 'Zahlungserinnerung' : `${neueStufe}. Mahnung`} gespeichert`)
        onClose()
      },
      onError: e => toast.error(String(e)),
    })
  }

  function handleCopy() {
    navigator.clipboard.writeText(text)
    toast.success('Text kopiert')
  }

  const titel = neueStufe === 1 ? 'Zahlungserinnerung' : `${neueStufe}. Mahnung`

  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BellRing size={16} />
            {titel} – {rechnung.rechnungsnummer}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <div className="flex items-center gap-4 p-3 bg-bg-muted rounded-lg">
            <div>
              <div className="text-xs text-ink-muted">Neue Mahnstufe</div>
              <MahnstufeBadge stufe={neueStufe} />
            </div>
            <div>
              <div className="text-xs text-ink-muted">Mahngebühr</div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <Input
                  type="number"
                  min={0}
                  step={1}
                  value={mahngebuehr}
                  onChange={e => setMahngebuehr(parseFloat(e.target.value) || 0)}
                  className="h-7 w-20 text-sm text-right"
                />
                <span className="text-xs text-ink-muted">EUR</span>
              </div>
            </div>
            <div className="ml-auto text-right">
              <div className="text-xs text-ink-muted">Offener Betrag</div>
              <div className="font-semibold text-sm">{fmt(rechnung.summe_brutto + mahngebuehr)}</div>
            </div>
          </div>

          <div className="relative">
            <label className="text-xs font-medium text-ink-muted mb-1 block">Mahnschreiben</label>
            <textarea
              readOnly
              value={text}
              rows={18}
              className="w-full text-xs font-mono border border-border rounded-md px-3 py-2 bg-bg-muted resize-y"
            />
            <button
              onClick={handleCopy}
              className="absolute top-7 right-2 p-1.5 rounded bg-white border border-border hover:bg-bg-muted transition-colors"
              title="Kopieren"
            >
              <Copy size={13} className="text-ink-muted" />
            </button>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Abbrechen</Button>
            <Button onClick={handleBestaetigen} disabled={isPending}>
              {isPending ? 'Speichern…' : 'Als versendet markieren'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Hauptseite ───────────────────────────────────────────────────────────────

export function MahnwesenPage() {
  const navigate = useNavigate()
  const { data: rechnungen = [], isPending, isError, refetch } = useOffeneForderungen()
  const { data: firma } = useFirmaStammdaten()
  const { mutate: markiereZahlt } = useMarkiereAusgangsrechnungBezahlt()
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const ueberfaellig = rechnungen.filter(r => r.faelligkeitsdatum && new Date(r.faelligkeitsdatum) < today)
  const offen = rechnungen.filter(r => !r.faelligkeitsdatum || new Date(r.faelligkeitsdatum) >= today)

  const gesamtBetrag = rechnungen.reduce((s, r) => s + r.summe_brutto, 0)
  const ueberfaelligBetrag = ueberfaellig.reduce((s, r) => s + r.summe_brutto, 0)

  const selected = rechnungen.find(r => r.id === selectedId) ?? null

  function handleMarkZahlt(r: Ausgangsrechnung) {
    if (!window.confirm(`Rechnung ${r.rechnungsnummer} als bezahlt markieren?`)) return
    markiereZahlt({ id: r.id, betrag: r.summe_brutto }, {
      onSuccess: () => toast.success(`${r.rechnungsnummer} als bezahlt markiert`),
      onError: e => toast.error(String(e)),
    })
  }

  return (
    <div className="space-y-5 max-w-5xl">
      <PageTitle title="Mahnwesen" subtitle="Offene Forderungen & Zahlungserinnerungen" />

      {/* KPI row */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Offene Forderungen', value: rechnungen.length.toString(), sub: fmt(gesamtBetrag) },
          { label: 'Überfällig', value: ueberfaellig.length.toString(), sub: fmt(ueberfaelligBetrag), warn: ueberfaellig.length > 0 },
          { label: 'Gemahnt (gesamt)', value: rechnungen.filter(r => r.mahnstufe > 0).length.toString() },
        ].map(kpi => (
          <div key={kpi.label} className={cn(
            'bg-bg-surface rounded-card border shadow-card p-4',
            kpi.warn && ueberfaellig.length > 0 ? 'border-red-200' : 'border-border'
          )}>
            <div className="text-xs text-ink-muted mb-1">{kpi.label}</div>
            <div className={cn('text-2xl font-semibold', kpi.warn && ueberfaellig.length > 0 ? 'text-red-600' : 'text-ink')}>
              {kpi.value}
            </div>
            {kpi.sub && <div className="text-xs text-ink-muted mt-0.5">{kpi.sub}</div>}
          </div>
        ))}
      </div>

      {isPending && (
        <div className="flex items-center justify-center h-32">
          <div className="w-6 h-6 border-2 border-accent-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {isError && (
        <div className="py-8 text-center text-sm text-ink-muted">
          Fehler beim Laden.{' '}
          <button className="text-accent-600 hover:underline" onClick={() => refetch()}>Neu laden</button>
        </div>
      )}

      {/* Überfällige Rechnungen */}
      {!isPending && ueberfaellig.length > 0 && (
        <RechnungTable
          title="Überfällig"
          icon={<AlertTriangle size={14} className="text-red-500" />}
          rechnungen={ueberfaellig}
          today={today}
          onMahnen={id => setSelectedId(id)}
          onBezahlt={handleMarkZahlt}
          onNavigate={id => navigate(`/ausgangsrechnungen/${id}`)}
        />
      )}

      {/* Offene Rechnungen (noch nicht fällig) */}
      {!isPending && offen.length > 0 && (
        <RechnungTable
          title="Offen"
          icon={<BellRing size={14} className="text-ink-muted" />}
          rechnungen={offen}
          today={today}
          onMahnen={id => setSelectedId(id)}
          onBezahlt={handleMarkZahlt}
          onNavigate={id => navigate(`/ausgangsrechnungen/${id}`)}
        />
      )}

      {!isPending && !isError && rechnungen.length === 0 && (
        <div className="py-12 text-center text-sm text-ink-muted flex flex-col items-center gap-2">
          <CheckCircle size={28} className="text-green-400" />
          Alle Rechnungen sind bezahlt!
        </div>
      )}

      {selected && (
        <MahnenModal
          rechnung={selected}
          firma={firma ?? null}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  )
}

// ─── Table Sub-Component ──────────────────────────────────────────────────────

function RechnungTable({
  title,
  icon,
  rechnungen,
  today,
  onMahnen,
  onBezahlt,
  onNavigate,
}: {
  title: string
  icon: React.ReactNode
  rechnungen: Ausgangsrechnung[]
  today: Date
  onMahnen: (id: string) => void
  onBezahlt: (r: Ausgangsrechnung) => void
  onNavigate: (id: string) => void
}) {
  return (
    <div className="bg-bg-surface rounded-card border border-border shadow-card overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center gap-2">
        {icon}
        <span className="text-xs font-semibold uppercase tracking-widest text-ink-muted">{title}</span>
        <span className="ml-1 text-xs text-ink-subtle">({rechnungen.length})</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-bg-muted">
              <th className="text-left text-xs font-medium text-ink-muted px-4 py-2.5">Rechnungsnr.</th>
              <th className="text-left text-xs font-medium text-ink-muted px-4 py-2.5">Kunde</th>
              <th className="text-right text-xs font-medium text-ink-muted px-4 py-2.5">Betrag</th>
              <th className="text-left text-xs font-medium text-ink-muted px-4 py-2.5">Fälligkeit</th>
              <th className="text-left text-xs font-medium text-ink-muted px-4 py-2.5">Tage</th>
              <th className="text-left text-xs font-medium text-ink-muted px-4 py-2.5">Mahnstufe</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {rechnungen.map(r => {
              const days = daysOverdue(r.faelligkeitsdatum)
              const overdue = r.faelligkeitsdatum ? new Date(r.faelligkeitsdatum) < today : false
              const canMahnen = (r.mahnstufe ?? 0) < 3
              return (
                <tr key={r.id} className="border-b border-border/50 hover:bg-bg-hover transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-accent-600">{r.rechnungsnummer}</td>
                  <td className="px-4 py-3 text-sm">{kundenName(r)}</td>
                  <td className="px-4 py-3 text-sm text-right font-medium">{fmt(r.summe_brutto)}</td>
                  <td className="px-4 py-3 text-sm">{fmtDate(r.faelligkeitsdatum)}</td>
                  <td className="px-4 py-3 text-sm">
                    {overdue
                      ? <span className="text-red-600 font-medium">+{days}d</span>
                      : <span className="text-green-600">–{Math.abs(days)}d</span>
                    }
                  </td>
                  <td className="px-4 py-3"><MahnstufeBadge stufe={r.mahnstufe ?? 0} /></td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5 justify-end">
                      {canMahnen && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onMahnen(r.id)}
                          className="h-7 text-xs px-2"
                        >
                          <BellRing size={12} className="mr-1" />
                          Mahnen
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onBezahlt(r)}
                        className="h-7 text-xs px-2 text-green-700 hover:bg-green-50"
                      >
                        <CheckCircle size={12} className="mr-1" />
                        Bezahlt
                      </Button>
                      <button
                        onClick={() => onNavigate(r.id)}
                        className="p-1.5 text-ink-muted hover:text-ink transition-colors"
                        title="Rechnung öffnen"
                      >
                        <ExternalLink size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
