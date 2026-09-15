import JSZip from 'jszip'
import { pdf } from '@react-pdf/renderer'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { QuickEnergyPdf } from '@/features/auftraege/shared/PdfDocument'
import type { Rechnung, Ausgangsrechnung, DokumentPosition, FirmaStammdaten } from '@/types/database'

function safeFilename(s: string): string {
  return s.replace(/[^a-zA-Z0-9._\-äöüÄÖÜß]/g, '_').slice(0, 80)
}

function kundenName(r: Ausgangsrechnung): string {
  return r.kunde?.firmenname
    || `${r.kunde?.vorname ?? ''} ${r.kunde?.nachname ?? ''}`.trim()
    || 'Unbekannt'
}

// Positionen fuer alle Rechnungen des Monats in einer Abfrage holen — die
// Listenansicht laedt sie nicht mit, das PDF braucht sie aber.
async function ladePositionen(ids: string[]): Promise<Map<string, DokumentPosition[]>> {
  const map = new Map<string, DokumentPosition[]>()
  if (ids.length === 0) return map
  const { data, error } = await supabase
    .from('dokument_positionen')
    .select('*')
    .in('dokument_id', ids)
    .eq('dokument_typ', 'rechnung')
    .order('reihenfolge')
  if (error) throw new Error(`Positionen: ${error.message}`)
  for (const p of (data ?? []) as DokumentPosition[]) {
    const list = map.get(p.dokument_id) ?? []
    list.push(p)
    map.set(p.dokument_id, list)
  }
  return map
}

/**
 * Alle Belege eines Monats (oder Jahres, "yyyy") als ZIP:
 *   Eingangsrechnungen/  — gespeicherte PDFs, unabhaengig vom Bezahlt-Status
 *   Ausgangsrechnungen/  — im Browser gerendert, auch Entwuerfe
 */
export async function downloadBelegeZip(
  month: string,
  eingangsrechnungen: Rechnung[],
  ausgangsrechnungen: Ausgangsrechnung[],
  firma: FirmaStammdaten | null,
) {
  const erImMonat = eingangsrechnungen.filter(r => r.rechnungsdatum?.startsWith(month) && r.pdf_url)
  const arImMonat = ausgangsrechnungen.filter(r => r.rechnungsdatum?.startsWith(month))

  if (erImMonat.length === 0 && arImMonat.length === 0) {
    toast.error('Keine Belege in diesem Zeitraum')
    return
  }

  const toastId = toast.loading(`Belege werden zusammengestellt… (${erImMonat.length} ER, ${arImMonat.length} AR)`)

  const zip = new JSZip()
  const erFolder = zip.folder('Eingangsrechnungen')!
  const arFolder = zip.folder('Ausgangsrechnungen')!
  const fehler: string[] = []

  // ── Eingangsrechnungen: gespeicherte PDFs ─────────────────────────────────
  let erOk = 0
  await Promise.allSettled(
    erImMonat.map(async r => {
      try {
        const res = await fetch(r.pdf_url!)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const lieferant = r.lieferant?.name ?? (r.ocr_json as any)?.supplier_name ?? 'Unbekannt'
        erFolder.file(safeFilename(`${r.rechnungsnr}_${lieferant}`) + '.pdf', await res.blob())
        erOk++
      } catch (e) {
        fehler.push(`ER ${r.rechnungsnr}: ${e instanceof Error ? e.message : 'Download fehlgeschlagen'}`)
      }
    })
  )

  // ── Ausgangsrechnungen: PDF im Browser rendern ────────────────────────────
  let arOk = 0
  try {
    const positionen = await ladePositionen(arImMonat.map(r => r.id))
    // Sequenziell: react-pdf parallel zu rendern frisst Speicher und bringt nichts
    for (const r of arImMonat) {
      try {
        const doc: Ausgangsrechnung = { ...r, positionen: positionen.get(r.id) ?? [] }
        const blob = await pdf(<QuickEnergyPdf typ="rechnung" doc={doc} firma={firma} />).toBlob()
        const suffix = r.status === 'entwurf' ? '_ENTWURF' : ''
        arFolder.file(safeFilename(`${r.rechnungsnummer}_${kundenName(r)}${suffix}`) + '.pdf', blob)
        arOk++
      } catch (e) {
        fehler.push(`AR ${r.rechnungsnummer}: ${e instanceof Error ? e.message : 'PDF fehlgeschlagen'}`)
      }
    }
  } catch (e) {
    fehler.push(e instanceof Error ? e.message : String(e))
  }

  toast.dismiss(toastId)

  if (erOk === 0 && arOk === 0) {
    toast.error('Keine Belege konnten geladen werden')
    return
  }

  if (fehler.length > 0) {
    zip.file('_Fehler.txt', ['Nicht enthaltene Belege:', '', ...fehler].join('\n'))
  }

  const content = await zip.generateAsync({ type: 'blob' })
  const url = URL.createObjectURL(content)
  const a = document.createElement('a')
  a.href = url
  a.download = `Belege_${month}.zip`
  a.click()
  URL.revokeObjectURL(url)

  toast.success(
    fehler.length > 0
      ? `${erOk} Eingangs- und ${arOk} Ausgangsrechnungen heruntergeladen, ${fehler.length} fehlgeschlagen (siehe _Fehler.txt)`
      : `${erOk} Eingangs- und ${arOk} Ausgangsrechnungen heruntergeladen`
  )
}
