import { supabase } from '@/lib/supabase'
import {
  pdfUrlToBase64,
  normalizeDate,
  geminiOcrAusgangsrechnung,
  type AusgangsrechnungOcrResult,
} from '@/lib/gemini-ocr'
import { DEFAULT_KOPF, DEFAULT_FUSS } from '@/features/auftraege/shared/dokumentDefaults'
import type { Rechnung } from '@/types/database'

interface KundeDaten {
  adresse?: string | null
  plz?: string | null
  ort?: string | null
  land?: string | null
  uid_nr?: string | null
}

export async function findOrCreateKunde(
  name: string | null | undefined,
  daten?: KundeDaten,
): Promise<string | null> {
  if (!name?.trim()) return null
  const trimmed = name.trim()
  const { data: existing } = await supabase
    .from('kunden')
    .select('id')
    .ilike('firmenname', trimmed)
    .limit(1)
    .maybeSingle()
  if (existing) return existing.id

  // Privatpersonen ohne Firmennamen: "Vorname Nachname" aufteilen, damit die
  // Anschrift im Dokument korrekt erscheint.
  const istFirma = /\b(gmbh|ag|kg|og|e\.?u\.?|ges\.?m\.?b\.?h|gesmbh|co|ltd|inc|verein|stiftung)\b/i.test(trimmed)
  const teile = trimmed.split(/\s+/)
  const namensFelder = !istFirma && teile.length >= 2
    ? { firmenname: null, vorname: teile.slice(0, -1).join(' '), nachname: teile[teile.length - 1] }
    : { firmenname: trimmed }

  const { data: created } = await supabase
    .from('kunden')
    .insert({
      ...namensFelder,
      adresse: daten?.adresse?.trim() || null,
      plz:     daten?.plz?.trim() || null,
      ort:     daten?.ort?.trim() || null,
      ...(daten?.land?.trim() ? { land: daten.land.trim() } : {}),
      uid_nr:  daten?.uid_nr?.trim() || null,
    })
    .select('id')
    .single()
  return created?.id ?? null
}

// Legt aus einem Ausgangsrechnungs-OCR-Ergebnis eine Ausgangsrechnung (Entwurf) an.
// Gibt die neue ID zurück.
export interface ImportWarnung {
  positionenNetto: number
  belegNetto:      number
}

export interface ImportErgebnis {
  id:       string
  warnung?: ImportWarnung
}

export async function createAusgangsrechnungFromOcr(ocr: AusgangsrechnungOcrResult): Promise<string> {
  return (await createAusgangsrechnungFromOcrDetailed(ocr)).id
}

export async function createAusgangsrechnungFromOcrDetailed(ocr: AusgangsrechnungOcrResult): Promise<ImportErgebnis> {
  const kundeId = await findOrCreateKunde(ocr.customer_name, {
    adresse: ocr.customer_adresse,
    plz:     ocr.customer_plz,
    ort:     ocr.customer_ort,
    land:    ocr.customer_land,
    uid_nr:  ocr.customer_uid,
  })

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
      leistungsdatum:     normalizeDate(ocr.leistungsdatum) ?? rechnungsdatum,
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

  if (insertErr) {
    // 23505 = unique violation auf rechnungsnummer -> Beleg ist bereits erfasst
    if (insertErr.code === '23505') {
      const nr = ocr.invoice_number?.trim()
      throw new Error(
        nr ? `Rechnung ${nr} ist bereits erfasst — nicht erneut importiert.`
           : 'Diese Rechnungsnummer ist bereits erfasst — nicht erneut importiert.',
      )
    }
    throw new Error(insertErr.message)
  }
  const newId = newRechnung!.id as string

  const nettoGesamt = netto20 + netto10 + netto0
  // Vorherrschender USt-Satz als Fallback, falls eine Position keinen eigenen hat
  const fallbackUst: 0 | 10 | 20 = netto20 !== 0 ? 20 : netto10 !== 0 ? 10 : 0
  const mapEinheit = (e: string | null): string => {
    const s = (e ?? '').trim().toLowerCase()
    if (s.startsWith('pausch')) return 'pausch'
    if (s.startsWith('st')) return 'Stk'
    if (s === 'm' || s === 'lfm') return 'lfm'
    if (s === 'm2' || s === 'm²') return 'm²'
    if (s === 'kwp') return 'kWp'
    if (s === 'kwh') return 'kWh'
    if (s === 'std') return 'Std'
    return 'Stk'
  }
  const normUst = (v: number | null): 0 | 10 | 20 =>
    v === 20 ? 20 : v === 10 ? 10 : v === 0 ? 0 : fallbackUst

  let warnung: ImportWarnung | undefined
  const ocrPositionen = ocr.positionen ?? []
  if (ocrPositionen.length > 0) {
    // Echte Positionen aus dem PDF übernehmen (bearbeitbar in der Maske)
    const rows = ocrPositionen.map((p, i) => {
      const menge = p.menge ?? 1
      const ep    = p.einzelpreis ?? 0
      return {
        dokument_id:        newId,
        dokument_typ:       'rechnung' as const,
        reihenfolge:        i,
        bezeichnung:        p.bezeichnung,
        beschreibung:       p.beschreibung,
        menge,
        einheit:            mapEinheit(p.einheit),
        einzelpreis_netto:  ep,
        ust_satz:           normUst(p.ust_satz),
        rabatt_prozent:     0,
        zeilenbetrag_netto: Math.round(menge * ep * 100) / 100,
      }
    })
    const { error: posErr } = await supabase.from('dokument_positionen').insert(rows)
    if (posErr) throw new Error(`Positionen: ${posErr.message}`)

    // Positionssumme mit dem Gesamtbetrag des Belegs abgleichen. Weicht sie ab
    // (z.B. weil die Positionspreise brutto sind), melden statt still zu übernehmen.
    const posNetto = Math.round(rows.reduce((s, r) => s + r.zeilenbetrag_netto, 0) * 100) / 100
    if (nettoGesamt !== 0 && Math.abs(posNetto - nettoGesamt) > 0.02) {
      warnung = { positionenNetto: posNetto, belegNetto: nettoGesamt }
    }
  } else if (nettoGesamt !== 0) {
    // Fallback: keine Positionen erkannt → eine Sammelposition mit der Gesamtsumme
    await supabase.from('dokument_positionen').insert({
      dokument_id:       newId,
      dokument_typ:      'rechnung',
      reihenfolge:       0,
      bezeichnung:       ocr.subject ?? 'Importierte Position',
      beschreibung:      null,
      menge:             1,
      einheit:           'pausch',
      einzelpreis_netto: nettoGesamt,
      ust_satz:          fallbackUst,
      rabatt_prozent:    0,
      zeilenbetrag_netto: nettoGesamt,
    })
  }

  return { id: newId, warnung }
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
