import * as XLSX from 'xlsx'
import { toast } from 'sonner'
import type { Rechnung, Ausgangsrechnung } from '@/types/database'

// BMD NTCS account defaults (Austrian chart of accounts)
const AR_GKONTO  = 200000  // Forderungen aus L+L
const ER_GKONTO  = 330000  // Verbindlichkeiten aus L+L
const AR_BUCHCODE = 2
const ER_BUCHCODE = 2

const ER_KONTO_BY_TYP: Record<string, number> = {
  bewirtung:      7600,
  tanken_diesel:  6320,
  tanken_super:   6320,
  dienstleistung: 5900,
}
const ER_KONTO_DEFAULT = 5900

// steuercode: 1 = 20%, 2 = 10%, 0 = 0%
function steuercode(prozent: number): number {
  if (prozent === 20) return 1
  if (prozent === 10) return 2
  return 0
}

function toYYYYMMDD(dateStr: string | null | undefined): number {
  if (!dateStr) return 0
  return parseInt(dateStr.replace(/-/g, '').slice(0, 8), 10)
}

function extractBelegnr(nr: string | null | undefined, fallback: number): number {
  if (!nr) return fallback
  const digits = nr.replace(/\D/g, '')
  return digits ? parseInt(digits.slice(-8), 10) : fallback
}

interface BmdRow {
  konto:      number
  buchcode:   number
  gkonto:     number
  belegnr:    number
  buchdatum:  number
  belegdatum: number
  buchsymbol: string
  steuercode: number
  prozent:    number
  betrag:     number
  steuer:     number
  text:       string
}

// ─── Ausgangsrechnungen → AR rows ─────────────────────────────────────────────

export function buildArRows(rechnungen: Ausgangsrechnung[]): BmdRow[] {
  const today = toYYYYMMDD(new Date().toISOString().split('T')[0])
  const rows: BmdRow[] = []

  // Entwürfe nie exportieren.
  // Stornierte normale Rechnungen ausschließen (wurden durch Stornorechnung ersetzt).
  // Stornorechnungen (typ='stornorechnung') immer einschließen — negative Gegenbuchung.
  const exportierbar = rechnungen.filter(r =>
    r.status !== 'entwurf' &&
    !(r.status === 'storniert' && r.typ !== 'stornorechnung')
  )

  exportierbar.forEach((r, idx) => {
    const text = r.kunde?.firmenname
      || `${r.kunde?.vorname ?? ''} ${r.kunde?.nachname ?? ''}`.trim()
      || r.betreff
      || '—'
    const belegnr = extractBelegnr(r.rechnungsnummer, idx + 1)
    const belegdatum = toYYYYMMDD(r.rechnungsdatum)

    if ((r.summe_netto_20 ?? 0) > 0) {
      rows.push({
        konto:      4000,
        buchcode:   AR_BUCHCODE,
        gkonto:     AR_GKONTO,
        belegnr,
        buchdatum:  today,
        belegdatum,
        buchsymbol: 'AR',
        steuercode: steuercode(20),
        prozent:    20,
        betrag:     -Math.round(r.summe_netto_20 * 100) / 100,
        steuer:     -Math.round((r.ust_20 ?? r.summe_netto_20 * 0.2) * 100) / 100,
        text,
      })
    }
    if ((r.summe_netto_10 ?? 0) > 0) {
      rows.push({
        konto:      4100,
        buchcode:   AR_BUCHCODE,
        gkonto:     AR_GKONTO,
        belegnr,
        buchdatum:  today,
        belegdatum,
        buchsymbol: 'AR',
        steuercode: steuercode(10),
        prozent:    10,
        betrag:     -Math.round(r.summe_netto_10 * 100) / 100,
        steuer:     -Math.round((r.ust_10 ?? r.summe_netto_10 * 0.1) * 100) / 100,
        text,
      })
    }
    // Fallback: invoice has brutto but no detailed breakdown
    if ((r.summe_netto_20 ?? 0) === 0 && (r.summe_netto_10 ?? 0) === 0 && r.summe_brutto > 0) {
      const netto = Math.round((r.summe_netto_0 > 0 ? r.summe_netto_0 : r.summe_brutto / 1.2) * 100) / 100
      const ust   = Math.round((r.summe_brutto - netto) * 100) / 100
      rows.push({
        konto:      4000,
        buchcode:   AR_BUCHCODE,
        gkonto:     AR_GKONTO,
        belegnr,
        buchdatum:  today,
        belegdatum,
        buchsymbol: 'AR',
        steuercode: steuercode(20),
        prozent:    20,
        betrag:     -netto,
        steuer:     -ust,
        text,
      })
    }
  })

  return rows
}

// ─── Eingangsrechnungen → ER rows ─────────────────────────────────────────────

export function buildErRows(rechnungen: Rechnung[]): BmdRow[] {
  const today = toYYYYMMDD(new Date().toISOString().split('T')[0])
  const rows: BmdRow[] = []

  rechnungen.forEach((r, idx) => {
    const text    = r.lieferant?.name ?? (r.ocr_json as any)?.supplier_name ?? r.rechnungsnr
    const belegnr = extractBelegnr(r.rechnungsnr, idx + 1)
    const belegdatum = toYYYYMMDD(r.rechnungsdatum)
    const konto   = ER_KONTO_BY_TYP[r.rechnungstyp ?? ''] ?? ER_KONTO_DEFAULT

    if ((r.betrag_20 ?? 0) > 0) {
      rows.push({
        konto,
        buchcode:   ER_BUCHCODE,
        gkonto:     ER_GKONTO,
        belegnr,
        buchdatum:  today,
        belegdatum,
        buchsymbol: 'ER',
        steuercode: steuercode(20),
        prozent:    20,
        betrag:     Math.round((r.betrag_20 ?? 0) * 100) / 100,
        steuer:     Math.round((r.mwst_20 ?? (r.betrag_20 ?? 0) * 0.2) * 100) / 100,
        text,
      })
    }
    if ((r.betrag_10 ?? 0) > 0) {
      rows.push({
        konto,
        buchcode:   ER_BUCHCODE,
        gkonto:     ER_GKONTO,
        belegnr,
        buchdatum:  today,
        belegdatum,
        buchsymbol: 'ER',
        steuercode: steuercode(10),
        prozent:    10,
        betrag:     Math.round((r.betrag_10 ?? 0) * 100) / 100,
        steuer:     Math.round((r.mwst_10 ?? (r.betrag_10 ?? 0) * 0.1) * 100) / 100,
        text,
      })
    }
    // Fallback: single tax rate from betrag field
    if ((r.betrag_20 ?? 0) === 0 && (r.betrag_10 ?? 0) === 0 && r.betrag > 0) {
      const pct = r.ust_satz ?? 20
      rows.push({
        konto,
        buchcode:   ER_BUCHCODE,
        gkonto:     ER_GKONTO,
        belegnr,
        buchdatum:  today,
        belegdatum,
        buchsymbol: 'ER',
        steuercode: steuercode(pct),
        prozent:    pct,
        betrag:     Math.round(r.betrag * 100) / 100,
        steuer:     Math.round(r.betrag * (pct / 100) * 100) / 100,
        text,
      })
    }
  })

  return rows
}

// ─── Write to Excel ───────────────────────────────────────────────────────────

export function writeBmdExcel(rows: BmdRow[], filename: string) {
  if (rows.length === 0) {
    toast.error('Keine Buchungszeilen für den gewählten Zeitraum.')
    return
  }

  const data = rows.map(r => ({
    konto:      r.konto,
    buchcode:   r.buchcode,
    gkonto:     r.gkonto,
    belegnr:    r.belegnr,
    buchdatum:  r.buchdatum,
    belegdatum: r.belegdatum,
    buchsymbol: r.buchsymbol,
    steuercode: r.steuercode,
    prozent:    r.prozent,
    betrag:     r.betrag,
    steuer:     r.steuer,
    text:       r.text,
  }))

  const ws = XLSX.utils.json_to_sheet(data)
  ws['!cols'] = [
    { wch: 8 }, { wch: 9 }, { wch: 9 }, { wch: 10 },
    { wch: 10 }, { wch: 10 }, { wch: 11 }, { wch: 11 },
    { wch: 8 }, { wch: 12 }, { wch: 12 }, { wch: 24 },
  ]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'BMD')
  XLSX.writeFile(wb, filename)
  toast.success(`${rows.length} Buchungszeilen exportiert`)
}
