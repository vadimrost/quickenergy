import JSZip from 'jszip'
import { toast } from 'sonner'
import type { Rechnung, Ausgangsrechnung } from '@/types/database'

function safeFilename(s: string): string {
  return s.replace(/[^a-zA-Z0-9._\-äöüÄÖÜß]/g, '_').slice(0, 80)
}

function getMonthLabel(month: string): string {
  const [y, m] = month.split('-')
  return new Date(parseInt(y), parseInt(m) - 1, 1)
    .toLocaleString('de-AT', { month: 'long', year: 'numeric' })
}

export async function downloadBelegeZip(
  month: string,
  eingangsrechnungen: Rechnung[],
  ausgangsrechnungen: Ausgangsrechnung[],
) {
  const erImMonat = eingangsrechnungen.filter(r => r.rechnungsdatum?.startsWith(month) && r.pdf_url)
  const arImMonat = ausgangsrechnungen.filter(r => r.rechnungsdatum?.startsWith(month))

  if (erImMonat.length === 0 && arImMonat.length === 0) {
    toast.error('Keine Rechnungen in diesem Monat')
    return
  }

  const toastId = toast.loading(`Belege werden geladen…`)

  const zip = new JSZip()
  const erFolder = zip.folder('Eingangsrechnungen')!
  const arFolder = zip.folder('Ausgangsrechnungen')!

  // ── Eingangsrechnungen: stored PDFs ─────────────────────────────────────────
  let erOk = 0
  let erFail = 0

  await Promise.allSettled(
    erImMonat.map(async r => {
      try {
        const res = await fetch(r.pdf_url!)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const blob = await res.blob()
        const lieferant = r.lieferant?.name ?? 'Unbekannt'
        const filename = safeFilename(`${r.rechnungsnr}_${lieferant}`) + '.pdf'
        erFolder.file(filename, blob)
        erOk++
      } catch {
        erFail++
      }
    })
  )

  // ── Ausgangsrechnungen: kein gespeichertes PDF → Readme ────────────────────
  if (arImMonat.length > 0) {
    const lines = [
      `Ausgangsrechnungen ${getMonthLabel(month)}`,
      '='.repeat(40),
      'PDFs können in QuickEnergy unter Aufträge → Rechnungen einzeln heruntergeladen werden.',
      '',
      'Enthaltene Rechnungen:',
      ...arImMonat.map(r => {
        const kunde = r.kunde?.firmenname
          || `${r.kunde?.vorname ?? ''} ${r.kunde?.nachname ?? ''}`.trim()
          || '—'
        return `  ${r.rechnungsnummer}  ${kunde}  € ${(r.summe_brutto ?? 0).toFixed(2)}`
      }),
    ]
    arFolder.file('_Rechnungsliste.txt', lines.join('\n'))
  }

  toast.dismiss(toastId)

  if (erOk === 0 && erImMonat.length > 0) {
    toast.error('PDFs konnten nicht geladen werden')
    return
  }

  const content = await zip.generateAsync({ type: 'blob' })
  const url = URL.createObjectURL(content)
  const a = document.createElement('a')
  a.href = url
  a.download = `Belege_${month}.zip`
  a.click()
  URL.revokeObjectURL(url)

  const msg = erFail > 0
    ? `${erOk} Belege heruntergeladen, ${erFail} fehlgeschlagen`
    : `${erOk} Eingangsbelege + ${arImMonat.length} AR-Liste heruntergeladen`
  toast.success(msg)
}
