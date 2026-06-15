import * as XLSX from 'xlsx'
import { toast } from 'sonner'
import type { Ausgangsrechnung, Rechnung, Lohnabrechnung, Kontoauszug } from '@/types/database'
import { buildArRows, buildErRows } from './bmd-export'

const BMD_COL_WIDTHS = [8, 9, 9, 10, 10, 10, 11, 11, 8, 12, 12, 24]

function setColWidths(ws: XLSX.WorkSheet, widths: number[]) {
  ws['!cols'] = widths.map(w => ({ wch: w }))
}

export function getMonthLabel(month: string): string {
  const [y, m] = month.split('-')
  return new Date(parseInt(y), parseInt(m) - 1, 1)
    .toLocaleString('de-AT', { month: 'long', year: 'numeric' })
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
