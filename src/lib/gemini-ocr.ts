export const CARD_MAP: Record<string, string> = {
  '1380': 'spesen_philipp_1380',
  '0744': 'spesen_philipp_0744',
  '6362': 'firmenkarte_6362',
  '0660': 'firmenkarte_0660',
}

export function effectiveNetto(ocr: Pick<GeminiOcrResult, 'net_amount' | 'net_amount_10' | 'net_amount_20' | 'net_amount_0'>): number | null {
  if (ocr.net_amount) return ocr.net_amount
  const sum = (ocr.net_amount_10 ?? 0) + (ocr.net_amount_20 ?? 0) + (ocr.net_amount_0 ?? 0)
  return sum > 0 ? Math.round(sum * 100) / 100 : null
}

export function resolveCard(lastFour: string | null | undefined): string | null {
  if (!lastFour) return null
  const digits = String(lastFour).trim()
  return CARD_MAP[digits] ?? 'sonstige'
}

export function normalizeDate(raw: string | null | undefined): string | null {
  if (!raw) return null
  const s = String(raw).trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  if (s.includes('.')) {
    const parts = s.split('.')
    if (parts.length === 3) {
      const [d, m, y] = parts
      return `${y.trim()}-${m.trim().padStart(2, '0')}-${d.trim().padStart(2, '0')}`
    }
  }
  const p = new Date(s)
  return isNaN(p.getTime()) ? null : p.toISOString().split('T')[0]
}

export async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve((reader.result as string).split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export async function pdfUrlToBase64(url: string): Promise<string> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`PDF nicht ladbar (${res.status})`)
  const blob = await res.blob()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve((reader.result as string).split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

export interface GeminiOcrResult {
  invoice_date:   string | null
  due_date:       string | null
  invoice_number: string | null
  supplier_name:  string | null
  net_amount:     number | null
  tax_rate:       number | null
  net_amount_10:  number | null
  net_amount_20:  number | null
  net_amount_0:   number | null
  tax_amount_10:  number | null
  tax_amount_20:  number | null
  invoice_type:   string | null
  card_last_four: string | null
}

export interface KategoriePrompt {
  wert: string
  beschreibung: string
}

const DEFAULT_KATEGORIEN: KategoriePrompt[] = [
  { wert: 'tanken_diesel',  beschreibung: 'NUR wenn explizit Diesel/Kraftstoff auf einer TANKSTELLE (Shell, OMV, BP, Jet, etc.)' },
  { wert: 'tanken_super',   beschreibung: 'NUR wenn explizit Benzin/Super/E5/E10 auf einer TANKSTELLE' },
  { wert: 'bewirtung',      beschreibung: 'Restaurant, Café, Bar, Sushi, Gasthaus — Essen & Trinken' },
  { wert: 'dienstleistung', beschreibung: 'ALLES andere: Telekom, Internet, Strom, IT, Handwerk, Baumärkte, etc.' },
]

function buildKategorienSection(kategorien: KategoriePrompt[]): string {
  return kategorien.map(k => `- "${k.wert}" → ${k.beschreibung}`).join('\n')
}

function buildOcrPrompt(kategorien: KategoriePrompt[]): string {
  return `Analysiere diese Rechnung und extrahiere alle Felder als JSON.

KATEGORIEN (invoice_type):
${buildKategorienSection(kategorien)}
- Gemischte Steuersätze allein sind KEIN Hinweis auf Tanken`
}

const OCR_PROMPT = buildOcrPrompt(DEFAULT_KATEGORIEN) + `

NETTOBETRAG (net_amount / net_amount_XX):
- IMMER den Nettobetrag NACH allen Rabatten/Positionsrabatten verwenden ("Netto abzüglich Rabatt", "Nettobetrag", "Zwischensumme exkl. USt.", "Summe Positionen" + Zuschläge)
- NIE den Brutto- oder Zahlbetrag als Netto verwenden
- Bei Skonto: Netto VOR Skonto nehmen (Skonto ist kein Rabatt auf den Nettobetrag)
- "Zahlungen an Dritte" / "Zahlungen an A1 f. Dienste von Dritten" / "Drittanbieter" NICHT zum Nettobetrag dazuzählen — diese sind Durchleitungszahlungen ohne eigene MwSt-Aufschlüsselung und gehören in net_amount_0
- Österreichische MwSt-Sätze (UID beginnt mit "ATU"): ausschließlich 0%, 10% oder 20% — NIE 19%
- Deutsche MwSt-Sätze (UID beginnt mit "DE"): 19% oder 7% möglich
- 19 aus einer österreichischen Postleitzahl (z.B. "1190 Wien", "1140 Wien") oder Auftragsnummer ist KEIN Steuersatz
- Zahlen in Adressen, Postleitzahlen oder Belegnummern sind NIEMALS Steuersätze

PROFORMA / KEINE VORSTEUERABZUGSBERECHTIGUNG:
- "Proforma-Rechnung" / "Keine Rechnung iSd UStG" / "keine Vorsteuerabzugsberechtigung" → tax_rate = null, tax_amount_10 = null, tax_amount_20 = null, net_amount_10 = null, net_amount_20 = null
- net_amount = Nettosumme aller Positionen inkl. Zuschläge, VOR Skonto (z.B. "Summe Positionen" + "Gefahrengutzuschlag" etc.) — Skonto ist ein Zahlungsrabatt, der NICHT vom Nettobetrag abgezogen wird

MEHRWERTSTEUER:
- tax_amount_10 / tax_amount_20: den TATSÄCHLICHEN MwSt-Betrag direkt vom Beleg nehmen ("Steuer", "MwSt-Betrag", "Umsatzsteuer von €X") — NIEMALS selbst ausrechnen
- net_amount_10: NETTO (exkl. MwSt) aller Positionen mit 10%
- net_amount_20: NETTO (exkl. MwSt) aller Positionen mit 20%
- net_amount_0:  Trinkgeld / Tip (bei Bewirtung): "Tip", "+ Tip", "Tipp", "Trinkgeld", "tip" — dieser Betrag hat 0% MwSt und wird NICHT in net_amount_10/20 eingerechnet
- "enth. MwSt" / "Inkl. X% MwSt" / "inkl. MwSt" / "enth.Mwst" → Bruttoangabe enthält MwSt. Netto = Bruttoangabe − MwSt-Betrag. IMMER ausrechnen und net_amount_XX befüllen.
- Beispiel 1: "Betrag 118,00 EUR, Inkl. 20% MwSt 19,67 EUR" → net_amount_20 = 98,33, tax_amount_20 = 19,67
- Beispiel 2: "10% Ware 46,10 enth.Mwst 4,19" → net_amount_10 = 41,91, tax_amount_10 = 4,19  (46,10 − 4,19 = 41,91)
- Beispiel 3: "20% Ware 7,80 enth.Mwst 1,30" → net_amount_20 = 6,50, tax_amount_20 = 1,30
- Wenn KEINE MwSt auf dem Beleg steht: tax_rate = null, tax_amount_10 = null, tax_amount_20 = null, net_amount_XX = null
- Bei Dienstleistung mit einem Satz: net_amount + tax_rate + tax_amount_20 (oder tax_amount_10) füllen, net_amount_XX = null

RECHNUNGSNUMMER: Formale Rechnungs-Nr. bevorzugen. Bei Kassenbons (Tankstelle, Restaurant) alternativ Bon-Nr., Beleg-Nr. oder Kassen-ID verwenden — niemals null lassen wenn irgendeine Belegnummer sichtbar ist.
DATUM: immer YYYY-MM-DD.
card_last_four: letzte 4 Ziffern der Karte falls sichtbar, sonst null.
supplier_name: Firmenname des Rechnungsstellers (oberster Firmenname auf dem Beleg).`

export async function geminiOcr(base64: string, apiKey: string, kategorien?: KategoriePrompt[]): Promise<GeminiOcrResult> {
  const prompt = kategorien?.length ? buildOcrPrompt(kategorien) + OCR_PROMPT.slice(OCR_PROMPT.indexOf('\n\nNETTOBETRAG')) : OCR_PROMPT
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [
          { inline_data: { mime_type: 'application/pdf', data: base64 } },
          { text: prompt },
        ]}],
        generationConfig: {
          response_mime_type: 'application/json',
          response_schema: {
            type: 'OBJECT',
            properties: {
              invoice_date:   { type: 'STRING',  nullable: true },
              due_date:       { type: 'STRING',  nullable: true },
              invoice_number: { type: 'STRING',  nullable: true },
              supplier_name:  { type: 'STRING',  nullable: true },
              net_amount:     { type: 'NUMBER',  nullable: true },
              tax_rate:       { type: 'NUMBER',  nullable: true },
              net_amount_10:  { type: 'NUMBER',  nullable: true },
              net_amount_20:  { type: 'NUMBER',  nullable: true },
              net_amount_0:   { type: 'NUMBER',  nullable: true },
              tax_amount_10:  { type: 'NUMBER',  nullable: true },
              tax_amount_20:  { type: 'NUMBER',  nullable: true },
              invoice_type:   { type: 'STRING',  nullable: true },
              card_last_four: { type: 'STRING',  nullable: true },
            },
          },
        },
      }),
    }
  )
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message ?? `Gemini Fehler ${res.status}`)
  }
  const data = await res.json()
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text
  return typeof text === 'string' ? JSON.parse(text) : (text ?? {})
}
