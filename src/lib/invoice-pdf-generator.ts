import { jsPDF } from 'jspdf'
import type { Rechnung } from '@/types/database'

// A4: 210 x 297mm — all coordinates in mm from top-left

interface LineItem {
  pos: number
  desc: string
  menge: number
  einheit: string
  ep: number
}

// Map lieferant auto_kostengruppe → plausible line items (netto amounts, will be scaled to betrag)
function getLineItems(rechnung: Rechnung): LineItem[] {
  const kg = rechnung.lieferant?.auto_kostengruppe
  const name = rechnung.lieferant?.name ?? ''
  const betrag = rechnung.betrag

  // Split betrag into 2–3 plausible items
  const splits: [number, string, string, number][] = (() => {
    if (kg === '4930' || name.includes('Partner')) {
      return [
        [0.55, 'Beratungsleistungen Q1/2026', 'Std.', 95],
        [0.30, 'Projektmanagement & Koordination', 'pauschal', 1],
        [0.15, 'Reisekosten & Spesen', 'pauschal', 1],
      ]
    }
    if (kg === '5200' || name.includes('Baustoffe') || name.includes('Wagner')) {
      return [
        [0.50, 'Beton C25/30 (Lieferung & Einbau)', 'm\u00B3', 8],
        [0.35, 'Stahltr\u00E4ger HEB200, 6m', 'Stk.', 4],
        [0.15, 'Lieferpauschale', 'pauschal', 1],
      ]
    }
    if (kg === '4940' || name.includes('IT') || name.includes('Solutions')) {
      return [
        [0.60, 'IT-Support & Wartung April 2026', 'Std.', 85],
        [0.40, 'Cloud-Services / Lizenzgeb\u00FChren', 'Monat', 1],
      ]
    }
    if (kg === '4210' || name.includes('Reinigung')) {
      return [
        [1.00, 'Reinigungsdienstleistungen April 2026', 'pauschal', 1],
      ]
    }
    if (name.includes('Energie') || name.includes('Nord')) {
      return [
        [0.72, 'Stromlieferung M\u00E4rz 2026', 'kWh', 1200],
        [0.28, 'Netzentgelte & Abgaben', 'pauschal', 1],
      ]
    }
    return [
      [0.70, 'Leistungen gem. Auftragsbest\u00E4tigung', 'pauschal', 1],
      [0.30, 'Nebenkosten', 'pauschal', 1],
    ]
  })()

  return splits.map(([share, desc, einheit, menge], i) => ({
    pos: i + 1,
    desc,
    menge,
    einheit,
    ep: Math.round((betrag * share) / menge * 100) / 100,
  }))
}

function fmtEur(n: number): string {
  return n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' \u20AC'
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return `${d}.${m}.${y}`
}

const pdfCache = new Map<string, string>()

export function generateInvoicePdf(rechnung: Rechnung): string {
  if (pdfCache.has(rechnung.id)) return pdfCache.get(rechnung.id)!

  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })
  const W = 210
  const lieferant = rechnung.lieferant
  const items = getLineItems(rechnung)
  const netto = rechnung.betrag
  const ust = netto * (rechnung.ust_satz / 100)
  const brutto = netto + ust

  // ─── Helper functions ──────────────────────────────────────────────────────

  const setColor = (hex: string) => {
    const r = parseInt(hex.slice(1, 3), 16)
    const g = parseInt(hex.slice(3, 5), 16)
    const b = parseInt(hex.slice(5, 7), 16)
    doc.setTextColor(r, g, b)
  }

  const hline = (y: number, x1 = 15, x2 = W - 15, color = '#E2E8F0', lw = 0.2) => {
    doc.setDrawColor(
      parseInt(color.slice(1, 3), 16),
      parseInt(color.slice(3, 5), 16),
      parseInt(color.slice(5, 7), 16)
    )
    doc.setLineWidth(lw)
    doc.line(x1, y, x2, y)
  }

  const fillRect = (x: number, y: number, w: number, h: number, hex: string) => {
    const r = parseInt(hex.slice(1, 3), 16)
    const g = parseInt(hex.slice(3, 5), 16)
    const b = parseInt(hex.slice(5, 7), 16)
    doc.setFillColor(r, g, b)
    doc.rect(x, y, w, h, 'F')
  }

  // ─── TOP ACCENT BAR ─────────────────────────────────────────────────────────
  fillRect(0, 0, W, 4, '#EC4899')

  // ─── SENDER BLOCK (left) ────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  setColor('#0F172A')
  doc.text(lieferant?.name ?? 'Unbekannter Lieferant', 15, 18)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  setColor('#64748B')

  const senderLines = [
    'Musterstra\u00DFe 42 · 10115 Berlin',
    'Tel: +49 30 123 456 · rechnung@lieferant.de',
    ...(lieferant?.ustid ? [`USt-IdNr.: ${lieferant.ustid}`] : ['Kleinunternehmer gem. \u00A7 19 UStG']),
  ]
  senderLines.forEach((line, i) => doc.text(line, 15, 24 + i * 5))

  // ─── "RECHNUNG" TITLE (right) ────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(26)
  setColor('#0F172A')
  doc.text('RECHNUNG', W - 15, 20, { align: 'right' })

  // ─── SEPARATOR ──────────────────────────────────────────────────────────────
  hline(40, 15, W - 15, '#0F172A', 0.4)

  // ─── INVOICE METADATA (right column, x=110..195) ────────────────────────────
  // These positions define where OCR highlight boxes land
  const metaLabelX = 110
  const metaValueX = W - 15   // right-aligned values
  const ROW_H = 7

  const metaRows: [string, string][] = [
    ['Rechnungsnummer:', rechnung.rechnungsnr],         // y=46 → bbox rechnungsnr
    ['Rechnungsdatum:', fmtDate(rechnung.created_at)],
    ['F\u00E4lligkeit:', fmtDate(rechnung.faelligkeit)], // y=60 → bbox faelligkeit
    ...(rechnung.skonto_datum && rechnung.skonto_prozent
      ? [[`Skonto (${rechnung.skonto_prozent}%) bis:`, fmtDate(rechnung.skonto_datum)] as [string, string]]
      : []),
  ]

  doc.setFontSize(8.5)
  metaRows.forEach(([label, value], i) => {
    const y = 46 + i * ROW_H
    doc.setFont('helvetica', 'normal')
    setColor('#64748B')
    doc.text(label, metaLabelX, y)
    doc.setFont('helvetica', 'bold')
    setColor('#0F172A')
    doc.text(value, metaValueX, y, { align: 'right' })
  })

  // ─── RECIPIENT BLOCK (left) ──────────────────────────────────────────────────
  doc.setFontSize(7.5)
  setColor('#94A3B8')
  doc.setFont('helvetica', 'normal')
  doc.text('Rechnungsempf\u00E4nger', 15, 46)

  hline(48, 15, 90, '#E2E8F0')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  setColor('#0F172A')
  doc.text('AIWERK GmbH', 15, 54)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  setColor('#64748B')
  ;['Berliner Allee 12', '10623 Berlin', 'DE 987 654 321'].forEach((line, i) => {
    doc.text(line, 15, 60 + i * 5)
  })

  // ─── ITEMS TABLE ─────────────────────────────────────────────────────────────
  const tableTop = 88
  fillRect(15, tableTop, W - 30, 7, '#F1F5F9')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  setColor('#64748B')
  ;[
    [15, 'Pos.'],
    [28, 'Beschreibung'],
    [120, 'Menge'],
    [140, 'Einheit'],
    [162, 'Einzelpreis'],
    [W - 15, 'Gesamt'],
  ].forEach(([x, label]) => doc.text(String(label), Number(x), tableTop + 4.8, { align: Number(x) === W - 15 || Number(x) === 162 ? 'right' : 'left' }))

  hline(tableTop + 7, 15, W - 15)

  let rowY = tableTop + 13
  items.forEach(item => {
    const gesamt = item.menge * item.ep

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    setColor('#0F172A')
    doc.text(String(item.pos), 15, rowY)
    doc.text(item.desc, 28, rowY)

    setColor('#64748B')
    doc.text(String(item.menge), 120, rowY)
    doc.text(item.einheit, 140, rowY)

    setColor('#0F172A')
    doc.text(fmtEur(item.ep), 162, rowY, { align: 'right' })
    doc.setFont('helvetica', 'bold')
    doc.text(fmtEur(gesamt), W - 15, rowY, { align: 'right' })

    hline(rowY + 3, 15, W - 15)
    rowY += 10
  })

  // ─── TOTALS (right side) ────────────────────────────────────────────────────
  // These y-positions define where OCR highlight boxes for betrag/ust_satz land
  const totalsX = 130
  const totalsValueX = W - 15
  const totalsTop = 210

  // Netto
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  setColor('#64748B')
  doc.text('Nettobetrag:', totalsX, totalsTop)
  setColor('#0F172A')
  doc.text(fmtEur(netto), totalsValueX, totalsTop, { align: 'right' })

  hline(totalsTop + 3, totalsX, W - 15)

  // USt — bbox: x≈0.619, y≈0.724
  const ustY = totalsTop + 9   // ~219mm → 219/297 ≈ 0.737
  setColor('#64748B')
  doc.setFont('helvetica', 'normal')
  doc.text(`zzgl. MwSt. ${rechnung.ust_satz}%:`, totalsX, ustY)
  setColor('#0F172A')
  doc.text(fmtEur(ust), totalsValueX, ustY, { align: 'right' })

  hline(ustY + 3, totalsX, W - 15)

  // Brutto — bbox: x≈0.619, y≈0.754
  const bruttoY = ustY + 9    // ~228mm → 228/297 ≈ 0.768
  fillRect(totalsX - 2, bruttoY - 5, W - 15 - totalsX + 4, 8, '#F8FAFC')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9.5)
  setColor('#0F172A')
  doc.text('GESAMT (Brutto):', totalsX, bruttoY)
  doc.setFontSize(11)
  doc.text(fmtEur(brutto), totalsValueX, bruttoY, { align: 'right' })

  // ─── PAYMENT FOOTER ─────────────────────────────────────────────────────────
  hline(252, 15, W - 15, '#E2E8F0', 0.3)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  setColor('#0F172A')
  doc.text('Zahlungsbedingungen', 15, 257)

  doc.setFont('helvetica', 'normal')
  setColor('#64748B')
  const payLines: string[] = [
    `Zahlungsziel: 30 Tage bis ${fmtDate(rechnung.faelligkeit)}`,
    ...(rechnung.skonto_datum && rechnung.skonto_prozent
      ? [`Skonto: ${rechnung.skonto_prozent}% bei Zahlung bis ${fmtDate(rechnung.skonto_datum)} (Ersparnis: ${fmtEur(brutto * rechnung.skonto_prozent / 100)})`]
      : []),
    `IBAN: ${formatIban(lieferant?.iban ?? null)}`,
    `BIC: COBADEFFXXX · Commerzbank AG`,
  ]
  payLines.forEach((line, i) => doc.text(line, 15, 263 + i * 5.5))

  // ─── PAGE NUMBER ─────────────────────────────────────────────────────────────
  doc.setFontSize(7)
  setColor('#94A3B8')
  doc.text(`Seite 1 von 1  ·  ${lieferant?.name ?? ''}  ·  ${rechnung.rechnungsnr}`, W / 2, 292, { align: 'center' })

  const dataUrl = doc.output('datauristring')
  pdfCache.set(rechnung.id, dataUrl)
  return dataUrl
}

function formatIban(iban: string | null): string {
  if (!iban) return '—'
  const c = iban.replace(/\s/g, '')
  return c.replace(/(.{4})/g, '$1 ').trim()
}

// Normalized bboxes that match the layout above (for mock-data)
// Page: 210 x 297mm, jspdf y=0 is top
// rechnungsnr: x=110, y=43, w=85, h=5  → [0.524, 0.145, 0.405, 0.017]
// betrag(brutto): x=130, y=225, w=65, h=8 → [0.619, 0.757, 0.310, 0.027]
// ust_satz: x=130, y=216, w=65, h=5    → [0.619, 0.727, 0.310, 0.017]
// faelligkeit: x=110, y=57, w=85, h=5  → [0.524, 0.192, 0.405, 0.017]
export const DEMO_PDF_BBOXES = {
  rechnungsnr:  [0.524, 0.145, 0.405, 0.017] as [number, number, number, number],
  betrag:       [0.619, 0.757, 0.310, 0.027] as [number, number, number, number],
  ust_satz:     [0.619, 0.727, 0.310, 0.017] as [number, number, number, number],
  faelligkeit:  [0.524, 0.192, 0.405, 0.017] as [number, number, number, number],
}
