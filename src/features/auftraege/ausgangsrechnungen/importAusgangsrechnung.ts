import { supabase } from '@/lib/supabase'
import {
  pdfUrlToBase64,
  normalizeDate,
  geminiOcrAusgangsrechnung,
  type AusgangsrechnungOcrResult,
} from '@/lib/gemini-ocr'
import { DEFAULT_KOPF, DEFAULT_FUSS } from '@/features/auftraege/shared/dokumentDefaults'
import type { Rechnung } from '@/types/database'

export async function findOrCreateKunde(name: string | null | undefined): Promise<string | null> {
  if (!name?.trim()) return null
  const trimmed = name.trim()
  const { data: existing } = await supabase
    .from('kunden')
    .select('id')
    .ilike('firmenname', trimmed)
    .limit(1)
    .maybeSingle()
  if (existing) return existing.id
  const { data: created } = await supabase
    .from('kunden')
    .insert({ firmenname: trimmed })
    .select('id')
    .single()
  return created?.id ?? null
}

// Legt aus einem Ausgangsrechnungs-OCR-Ergebnis eine Ausgangsrechnung (Entwurf) an.
// Gibt die neue ID zurück.
export async function createAusgangsrechnungFromOcr(ocr: AusgangsrechnungOcrResult): Promise<string> {
  const kundeId = await findOrCreateKunde(ocr.customer_name)

  const netto20 = ocr.net_amount_20 ?? 0
  const netto10 = ocr.net_amount_10 ?? 0
  const netto0  = ocr.net_amount_0  ?? 0
  const ust20   = ocr.tax_amount_20 ?? Math.round(netto20 * 0.20 * 100) / 100
  const ust10   = ocr.tax_amount_10 ?? Math.round(netto10 * 0.10 * 100) / 100
  const brutto  = ocr.total_brutto  ?? Math.round((netto20 + netto10 + netto0 + ust20 + ust10) * 100) / 100

  const rechnungsdatum = normalizeDate(ocr.invoice_date) ?? new Date().toISOString().split('T')[0]
  const zahlungsTage   = ocr.zahlungsziel_tage || 14
  const addTage = () => {
    const d = new Date(rechnungsdatum); d.setDate(d.getDate() + zahlungsTage); return d.toISOString().split('T')[0]
  }
  const faellig = ocr.due_date ? (normalizeDate(ocr.due_date) ?? addTage()) : addTage()

  const rechnungsTyp = ocr.is_stornorechnung
    ? 'stornorechnung'
    : ocr.is_schlussrechnung
      ? 'schlussrechnung'
      : 'rechnung'
  const rechnungsStatus = ocr.is_stornorechnung ? 'storniert' : 'entwurf'

  const { data: newRechnung, error: insertErr } = await supabase
    .from('ausgangsrechnungen')
    .insert({
      typ:                rechnungsTyp,
      status:             rechnungsStatus,
      kunde_id:           kundeId,
      rechnungsnummer:    ocr.invoice_number?.trim() || null,
      betreff:            ocr.subject ?? null,
      rechnungsdatum,
      leistungsdatum:     rechnungsdatum,
      zahlungsziel_tage:  zahlungsTage,
      faelligkeitsdatum:  faellig,
      rabatt_gesamt_prozent: 0,
      kopftext:           DEFAULT_KOPF,
      fusstext:           DEFAULT_FUSS,
      summe_netto_20:     netto20,
      summe_netto_10:     netto10,
      summe_netto_0:      netto0,
      ust_20:             ust20,
      ust_10:             ust10,
      summe_brutto:       brutto,
      mahnstufe:          0,
    })
    .select('id')
    .single()

  if (insertErr) throw new Error(insertErr.message)
  const newId = newRechnung!.id as string

  // Platzhalter-Position, wenn Beträge vorhanden
  const nettoGesamt = netto20 + netto10 + netto0
  if (nettoGesamt !== 0) {
    const ustSatz = netto20 !== 0 ? 20 : netto10 !== 0 ? 10 : 0
    await supabase.from('dokument_positionen').insert({
      dokument_id:       newId,
      dokument_typ:      'rechnung',
      reihenfolge:       0,
      bezeichnung:       ocr.subject ?? 'Importierte Position',
      beschreibung:      null,
      menge:             1,
      einheit:           'pausch',
      einzelpreis_netto: nettoGesamt,
      ust_satz:          ustSatz,
      rabatt_prozent:    0,
      zeilenbetrag_netto: nettoGesamt,
    })
  }

  return newId
}

// Verschiebt eine (fälschlich als Eingangsrechnung erfasste) eigene Rechnung zu den
// Ausgangsrechnungen: PDF erneut mit dem AR-OCR lesen, Ausgangsrechnung anlegen,
// die Eingangsrechnung löschen. Gibt die neue Ausgangsrechnungs-ID zurück.
export async function moveRechnungToAusgangsrechnung(rechnung: Rechnung, apiKey: string): Promise<string> {
  if (!rechnung.pdf_url) throw new Error('Keine PDF zur Rechnung vorhanden')
  const base64 = await pdfUrlToBase64(rechnung.pdf_url)
  const ocr = await geminiOcrAusgangsrechnung(base64, apiKey)
  const newId = await createAusgangsrechnungFromOcr(ocr)
  const { error } = await supabase.from('rechnungen').delete().eq('id', rechnung.id)
  if (error) throw new Error(error.message)
  return newId
}

// Erkennt, ob der Lieferantenname zur eigenen Firma gehört (→ eigene Rechnung).
export function isEigeneRechnung(supplierName: string | null | undefined, firmaName: string | null | undefined): boolean {
  if (!supplierName || !firmaName) return false
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
  // "Marke" = die ersten beiden Wörter des Firmennamens (z.B. "Quick Energy")
  const brand = norm(firmaName.trim().split(/\s+/).slice(0, 2).join(''))
  if (brand.length < 5) return false
  return norm(supplierName).includes(brand)
}
