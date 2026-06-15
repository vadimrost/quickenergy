import * as XLSX from 'xlsx'
import { toast } from 'sonner'
import type { Ausgangsrechnung, Rechnung, Lohnabrechnung, Kontoauszug } from '@/types/database'
import { buildArRows, buildErRows } from './bmd-export'

const BMD_COL_WIDTHS = [8, 9, 9, 10, 10, 10, 11, 11, 8, 12, 12, 24]

function setColWidths(ws: XLSX.WorkSheet, widths: number[]) {
  ws['!cols'] = widths.map(w => ({ wch: w }))
}

function toYYYYMMDD(dateStr: string | null | undefined): number {
  if (!dateStr) return 0
  return parseInt(dateStr.replace(/-/g, '').slice(0, 8), 10)
}

export function getMonthLabel(month: string): string {
  const [y, m] = month.split('-')
  return new Date(parseInt(y), parseInt(m) - 1, 1)
    .toLocaleString('de-AT', { month: 'long', year: 'numeric' })
}

// ─── BMD: Lohnkosten rows ─────────────────────────────────────────────────────
// Dienstnehmer:  konto 6000 = Bruttolöhne, gkonto 3500 = Verb. Dienstnehmer
// Körperschaften je typ:
//   ÖGK       → konto 6030 (DG-Anteil SV),       gkonto 3800 (Verb. ÖGK)
//   Finanzamt → konto 6020 (DB/DZ),               gkonto 3700 (Verb. Finanzamt)
//   KommSt    → konto 6025 (Kommunalsteuer),      gkonto 3720 (Verb. KommSt)
//   DGA       → konto 6040 (Dienstgeberabgabe),   gkonto 3730 (Verb. DGA)

const KOERPERSCHAFT_KONTEN: Record<string, { konto: number; gkonto: number }> = {
  ÖGK:       { konto: 6030, gkonto: 3800 },
  Finanzamt: { konto: 6020, gkonto: 3700 },
  KommSt:    { konto: 6025, gkonto: 3720 },
  DGA:       { konto: 6040, gkonto: 3730 },
}
const KOERPERSCHAFT_FALLBACK = { konto: 6020, gkonto: 3501 }

function buildLohnBmdRows(lohnabrechnungen: Lohnabrechnung[], monat: number, jahr: number) {
  const today = toYYYYMMDD(new Date().toISOString().split('T')[0])
  const belegdatum = toYYYYMMDD(`${jahr}-${String(monat).padStart(2, '0')}-01`)
  const rows: object[] = []
  let idx = 1

  lohnabrechnungen
    .filter(l => l.monat === monat && l.jahr === jahr)
    .forEach(l => {
      l.lohn_dienstnehmer?.forEach(d => {
        rows.push({
          konto: 6000, buchcode: 2, gkonto: 3500,
          belegnr: idx++, buchdatum: today, belegdatum,
          buchsymbol: 'LO', steuercode: 0, prozent: 0,
          betrag: Math.round(d.betrag * 100) / 100, steuer: 0,
          text: d.name,
        })
      })
      l.lohn_koerperschaften?.forEach(k => {
        const { konto, gkonto } = KOERPERSCHAFT_KONTEN[k.typ ?? ''] ?? KOERPERSCHAFT_FALLBACK
        rows.push({
          konto, buchcode: 2, gkonto,
          belegnr: idx++, buchdatum: today, belegdatum,
          buchsymbol: 'LO', steuercode: 0, prozent: 0,
          betrag: Math.round(k.betrag * 100) / 100, steuer: 0,
          text: k.bezeichnung,
        })
      })
    })

  return rows
}

// ─── BMD: Kontoauszug rows ────────────────────────────────────────────────────
// konto/gkonto 280000 = Girokonto, 200000 = Forderungen, 330000 = Verbindlichkeiten, 3500 = Verb. Lohn

function buildKontoBmdRows(kontoauszuege: Kontoauszug[], month: string) {
  const today = toYYYYMMDD(new Date().toISOString().split('T')[0])
  const rows: object[] = []
  let idx = 1

  kontoauszuege.forEach(k => {
    const txImMonat = (k.bank_transaktionen ?? []).filter(t => t.datum?.startsWith(month))
    txImMonat.forEach(t => {
      const belegdatum = toYYYYMMDD(t.datum)
      const absBetrag = Math.abs(Math.round(t.betrag * 100) / 100)

      // resolve nested join (Supabase returns object or single-item array)
      const rnr = (t.rechnungen as any)?.[0]?.rechnungsnr ?? (t.rechnungen as any)?.rechnungsnr ?? ''
      const lname = (t.lohn_dienstnehmer as any)?.[0]?.name ?? (t.lohn_dienstnehmer as any)?.name ?? ''

      let konto: number
      let gkonto: number

      if (t.betrag > 0) {
        // Eingang (Kundenzahlung): Bank ← Forderungen
        konto = 280000; gkonto = 200000
      } else if (rnr) {
        // Ausgang Lieferant: Verbindlichkeiten → Bank
        konto = 330000; gkonto = 280000
      } else if (lname) {
        // Ausgang Lohn: Verb. Lohn → Bank
        konto = 3500; gkonto = 280000
      } else {
        // Unbekannt: Bank ↔ Clearing
        konto = 280000; gkonto = 9999
      }

      const suffix = (rnr || lname) ? ` / ${rnr || lname}` : ''
      const text = `${t.buchungstext}${suffix}`.slice(0, 60)

      rows.push({
        konto, buchcode: 2, gkonto,
        belegnr: idx++, buchdatum: today, belegdatum,
        buchsymbol: 'KA', steuercode: 0, prozent: 0,
        betrag: absBetrag, steuer: 0,
        text,
      })
    })
  })

  return rows
}

function emptyBmdSheet(): XLSX.WorkSheet {
  return XLSX.utils.json_to_sheet([{
    konto: '', buchcode: '', gkonto: '', belegnr: '',
    buchdatum: '', belegdatum: '', buchsymbol: '',
    steuercode: '', prozent: '', betrag: '', steuer: '',
    text: 'Keine Einträge',
  }])
}

// ─── BMD Export: alle 4 Tabs in BMD-Spaltenformat ────────────────────────────

export function exportMonatsberichtBmd(
  month: string,
  ausgangsrechnungen: Ausgangsrechnung[],
  eingangsrechnungen: Rechnung[],
  _lohnabrechnungen: Lohnabrechnung[],
  _kontoauszuege: Kontoauszug[],
) {
  const arRows = buildArRows(ausgangsrechnungen.filter(r => r.rechnungsdatum?.startsWith(month)))
  const erRows = buildErRows(eingangsrechnungen.filter(r => r.rechnungsdatum?.startsWith(month)))

  const toBmdSheet = (rows: object[]) => {
    const ws = rows.length > 0 ? XLSX.utils.json_to_sheet(rows) : emptyBmdSheet()
    setColWidths(ws, BMD_COL_WIDTHS)
    return ws
  }

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, toBmdSheet(arRows), 'Ausgangsrechnungen')
  XLSX.utils.book_append_sheet(wb, toBmdSheet(erRows), 'Eingangsrechnungen')

  XLSX.writeFile(wb, `Monatsbericht_BMD_${month}.xlsx`)
  toast.success(`Monatsbericht BMD ${getMonthLabel(month)} exportiert`)
}

// ─── Allgemeiner Export: lesbare Spalten ─────────────────────────────────────

export function exportMonatsbericht(
  month: string,
  ausgangsrechnungen: Ausgangsrechnung[],
  eingangsrechnungen: Rechnung[],
  _lohnabrechnungen: Lohnabrechnung[],
  _kontoauszuege: Kontoauszug[],
) {

  const arRows = ausgangsrechnungen
    .filter(r => r.rechnungsdatum?.startsWith(month))
    .map(r => ({
      'Rechnungs-Nr.': r.rechnungsnummer ?? '',
      'Datum': r.rechnungsdatum ?? '',
      'Fällig': r.faelligkeitsdatum ?? '',
      'Kunde': r.kunde?.firmenname || `${r.kunde?.vorname ?? ''} ${r.kunde?.nachname ?? ''}`.trim() || '',
      'Betreff': r.betreff ?? '',
      'Typ': r.typ,
      'Status': r.status,
      'Netto 20%': r.summe_netto_20 ?? 0,
      'USt. 20%': r.ust_20 ?? 0,
      'Netto 10%': r.summe_netto_10 ?? 0,
      'USt. 10%': r.ust_10 ?? 0,
      'Brutto': r.summe_brutto ?? 0,
    }))

  const erRows = eingangsrechnungen
    .filter(r => r.rechnungsdatum?.startsWith(month))
    .map(r => {
      const netto = (r.ocr_json as any)?.invoice_net_amount ?? r.betrag
      return {
        'Rechnungs-Nr.': r.rechnungsnr ?? '',
        'Datum': r.rechnungsdatum ?? '',
        'Fällig': r.faelligkeit ?? '',
        'Lieferant': r.lieferant?.name ?? '',
        'Typ': r.rechnungstyp ?? '',
        'Status': r.status ?? '',
        'Netto 20%': r.betrag_20 ?? 0,
        'USt. 20%': r.mwst_20 ?? 0,
        'Netto 10%': r.betrag_10 ?? 0,
        'USt. 10%': r.mwst_10 ?? 0,
        'Brutto': Math.round(netto * (1 + (r.ust_satz ?? 0) / 100) * 100) / 100,
      }
    })

  const makeSheet = (rows: object[], fallback: string) => {
    const ws = XLSX.utils.json_to_sheet(rows.length > 0 ? rows : [{ Info: fallback }])
    return ws
  }

  const wb = XLSX.utils.book_new()

  const wsAR = makeSheet(arRows, 'Keine Ausgangsrechnungen in diesem Monat')
  setColWidths(wsAR, [15, 12, 12, 24, 30, 14, 12, 12, 10, 12, 10, 14])
  XLSX.utils.book_append_sheet(wb, wsAR, 'Ausgangsrechnungen')

  const wsER = makeSheet(erRows, 'Keine Eingangsrechnungen in diesem Monat')
  setColWidths(wsER, [15, 12, 12, 22, 14, 12, 12, 10, 12, 10, 14])
  XLSX.utils.book_append_sheet(wb, wsER, 'Eingangsrechnungen')

  XLSX.writeFile(wb, `Monatsbericht_${month}.xlsx`)
  toast.success(`Monatsbericht ${getMonthLabel(month)} exportiert`)
}
