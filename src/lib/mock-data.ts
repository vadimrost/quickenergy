import { addDays, subDays, format } from 'date-fns'
import type { Rechnung, Lieferant, Duplikat, ExportLog, OcrJson } from '@/types/database'
import { DEMO_PDF_BBOXES } from './invoice-pdf-generator'

const today = new Date()
const d = (offset: number) => format(addDays(today, offset), 'yyyy-MM-dd')
const past = (offset: number) => format(subDays(today, offset), 'yyyy-MM-dd')

export const MOCK_LIEFERANTEN: Lieferant[] = [
  { id: 'l1', name: 'M\u00FCller & Partner GmbH', ustid: 'DE123456789', iban: 'DE89370400440532013000', auto_kostengruppe: '4930', anzahl_rechnungen: 26 },
  { id: 'l2', name: 'Baustoffe Wagner KG', ustid: 'DE987654321', iban: 'DE27200505501265584079', auto_kostengruppe: '5200', anzahl_rechnungen: 34 },
  { id: 'l3', name: 'IT-Solutions Schreiber', ustid: 'DE456789123', iban: 'DE68210501700012345678', auto_kostengruppe: '4940', anzahl_rechnungen: 18 },
  { id: 'l4', name: 'Reinigungsdienst Sauer', ustid: null, iban: 'DE41500105170123456789', auto_kostengruppe: '4210', anzahl_rechnungen: 9 },
  { id: 'l5', name: 'Energieversorger Nord AG', ustid: 'DE789123456', iban: 'DE75512108001245126199', auto_kostengruppe: null, anzahl_rechnungen: 2 },
]

// OCR json with bboxes matching the generated PDF layout (see invoice-pdf-generator.ts)
function ocr(rechnungsnr: string, betrag: number, ustSatz: number, faelligkeit: string): OcrJson {
  return {
    rechnungsnr: { value: rechnungsnr, bbox: DEMO_PDF_BBOXES.rechnungsnr, confidence: 0.98 },
    betrag: { value: betrag, bbox: DEMO_PDF_BBOXES.betrag, confidence: 0.95 },
    ust_satz: { value: ustSatz, bbox: DEMO_PDF_BBOXES.ust_satz, confidence: 0.97 },
    faelligkeit: { value: faelligkeit, bbox: DEMO_PDF_BBOXES.faelligkeit, confidence: 0.92 },
  }
}

// pdf_url = 'demo' signals the hook to generate a PDF from invoice data
export const MOCK_RECHNUNGEN: Rechnung[] = [
  {
    id: 'r1', rechnungsnr: 'RE-2026-0142', betrag: 4250.00, ust_satz: 19,
    faelligkeit: d(27), skonto_datum: d(4), skonto_prozent: 2,
    status: 'eingegangen', created_at: past(2), lieferant_id: 'l1',
    pdf_url: 'demo',
    ocr_json: ocr('RE-2026-0142', 4250, 19, d(27)),
    mitarbeiter: null, karte: null, rechnungsdatum: null, rechnungstyp: null, betrag_10: null, betrag_20: null, betrag_0: null, mwst_10: null, mwst_20: null, flag: null, bank_transaktion_id: null, bezahlt_am: null, bezahlt_konto: null, lieferant: MOCK_LIEFERANTEN[0],
  },
  {
    id: 'r2', rechnungsnr: 'RE-8821', betrag: 12800.00, ust_satz: 19,
    faelligkeit: d(17), skonto_datum: d(2), skonto_prozent: 3,
    status: 'eingegangen', created_at: past(1), lieferant_id: 'l2',
    pdf_url: 'demo',
    ocr_json: ocr('RE-8821', 12800, 19, d(17)),
    mitarbeiter: null, karte: null, rechnungsdatum: null, rechnungstyp: null, betrag_10: null, betrag_20: null, betrag_0: null, mwst_10: null, mwst_20: null, flag: null, bank_transaktion_id: null, bezahlt_am: null, bezahlt_konto: null, lieferant: MOCK_LIEFERANTEN[1],
  },
  {
    id: 'r3', rechnungsnr: 'INV-2026-033', betrag: 1890.00, ust_satz: 19,
    faelligkeit: d(12), skonto_datum: null, skonto_prozent: null,
    status: 'gepr\u00FCft', created_at: past(3), lieferant_id: 'l3',
    pdf_url: 'demo',
    ocr_json: ocr('INV-2026-033', 1890, 19, d(12)),
    mitarbeiter: null, karte: null, rechnungsdatum: null, rechnungstyp: null, betrag_10: null, betrag_20: null, betrag_0: null, mwst_10: null, mwst_20: null, flag: null, bank_transaktion_id: null, bezahlt_am: null, bezahlt_konto: null, lieferant: MOCK_LIEFERANTEN[2],
  },
  {
    id: 'r4', rechnungsnr: 'RG-2026-44', betrag: 580.00, ust_satz: 7,
    faelligkeit: d(7), skonto_datum: null, skonto_prozent: null,
    status: 'gepr\u00FCft', created_at: past(4), lieferant_id: 'l4',
    pdf_url: 'demo',
    ocr_json: ocr('RG-2026-44', 580, 7, d(7)),
    mitarbeiter: null, karte: null, rechnungsdatum: null, rechnungstyp: null, betrag_10: null, betrag_20: null, betrag_0: null, mwst_10: null, mwst_20: null, flag: null, bank_transaktion_id: null, bezahlt_am: null, bezahlt_konto: null, lieferant: MOCK_LIEFERANTEN[3],
  },
  {
    id: 'r5', rechnungsnr: 'RE-2026-0138', betrag: 3100.00, ust_satz: 19,
    faelligkeit: past(3), skonto_datum: null, skonto_prozent: null,
    status: 'gebucht', created_at: past(10), lieferant_id: 'l1',
    pdf_url: 'demo',
    ocr_json: ocr('RE-2026-0138', 3100, 19, past(3)),
    mitarbeiter: null, karte: null, rechnungsdatum: null, rechnungstyp: null, betrag_10: null, betrag_20: null, betrag_0: null, mwst_10: null, mwst_20: null, flag: null, bank_transaktion_id: null, bezahlt_am: null, bezahlt_konto: null, lieferant: MOCK_LIEFERANTEN[0],
  },
  {
    id: 'r6', rechnungsnr: 'EN-2026-1234', betrag: 2340.00, ust_satz: 19,
    faelligkeit: past(18), skonto_datum: null, skonto_prozent: null,
    status: 'gebucht', created_at: past(20), lieferant_id: 'l5',
    pdf_url: 'demo',
    ocr_json: ocr('EN-2026-1234', 2340, 19, past(18)),
    mitarbeiter: null, karte: null, rechnungsdatum: null, rechnungstyp: null, betrag_10: null, betrag_20: null, betrag_0: null, mwst_10: null, mwst_20: null, flag: null, bank_transaktion_id: null, bezahlt_am: null, bezahlt_konto: null, lieferant: MOCK_LIEFERANTEN[4],
  },
  {
    id: 'r7', rechnungsnr: 'RE-8799', betrag: 15600.00, ust_satz: 19,
    faelligkeit: past(3), skonto_datum: null, skonto_prozent: null,
    status: 'bezahlt', created_at: past(25), lieferant_id: 'l2',
    pdf_url: 'demo',
    ocr_json: ocr('RE-8799', 15600, 19, past(3)),
    mitarbeiter: null, karte: null, rechnungsdatum: null, rechnungstyp: null, betrag_10: null, betrag_20: null, betrag_0: null, mwst_10: null, mwst_20: null, flag: null, bank_transaktion_id: null, bezahlt_am: null, bezahlt_konto: null, lieferant: MOCK_LIEFERANTEN[1],
  },
  {
    id: 'r8', rechnungsnr: 'INV-2026-029', betrag: 2450.00, ust_satz: 19,
    faelligkeit: past(17), skonto_datum: null, skonto_prozent: null,
    status: 'bezahlt', created_at: past(30), lieferant_id: 'l3',
    pdf_url: 'demo',
    ocr_json: ocr('INV-2026-029', 2450, 19, past(17)),
    mitarbeiter: null, karte: null, rechnungsdatum: null, rechnungstyp: null, betrag_10: null, betrag_20: null, betrag_0: null, mwst_10: null, mwst_20: null, flag: null, bank_transaktion_id: null, bezahlt_am: null, bezahlt_konto: null, lieferant: MOCK_LIEFERANTEN[2],
  },
]

export const MOCK_DUPLIKATE: Duplikat[] = [
  { id: 'd1', rechnung_a_id: 'r1', rechnung_b_id: 'r5', match_score: 0.78 },
]

export const MOCK_EXPORT_LOG: ExportLog[] = [
  { id: 'e1', rechnung_ids_json: ['r5', 'r6', 'r7', 'r8', 'r3'], ziel: 'lexoffice', exported_at: past(2), success: true },
  { id: 'e2', rechnung_ids_json: Array.from({ length: 12 }, (_, i) => `r${i + 1}`), ziel: 'lexoffice', exported_at: past(8), success: true },
  { id: 'e3', rechnung_ids_json: ['r4', 'r5', 'r6'], ziel: 'lexoffice', exported_at: past(15), success: true },
  { id: 'e4', rechnung_ids_json: Array.from({ length: 8 }, (_, i) => `r${i + 1}`), ziel: 'lexoffice', exported_at: past(23), success: true },
  { id: 'e5', rechnung_ids_json: ['r1', 'r2', 'r3', 'r4', 'r5', 'r6'], ziel: 'lexoffice', exported_at: past(29), success: false },
  { id: 'e6', rechnung_ids_json: Array.from({ length: 10 }, (_, i) => `r${i + 1}`), ziel: 'lexoffice', exported_at: past(34), success: true },
]
