export const CARD_MAP: Record<string, string> = {
  '1380': 'spesen_philipp_1380',
  '0744': 'spesen_philipp_0744',
  '6362': 'firmenkarte_6362',
  '0660': 'firmenkarte_0660',
}

export function effectiveNetto(ocr: Pick<GeminiOcrResult, 'net_amount' | 'net_amount_10' | 'net_amount_20' | 'net_amount_0'>): number | null {
  // Prefer breakdown sum when available — net_amount can be wrong (brutto mistaken for netto)
  const sum = (ocr.net_amount_10 ?? 0) + (ocr.net_amount_20 ?? 0) + (ocr.net_amount_0 ?? 0)
  if (sum > 0) return Math.round(sum * 100) / 100
  return ocr.net_amount ?? null
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
  is_proforma:    boolean | null
  skonto_prozent: number | null
  skonto_tage:    number | null
  skonto_datum:   string | null
  // Dokumenttyp-Erkennung (Steuerberaterin): Angebote/Mahnungen sind keine Eingangsrechnungen
  document_kind:  string | null   // 'rechnung' | 'angebot' | 'mahnung' | 'lieferschein' | 'proforma' | 'sonstige'
  // Vollständigkeit mehrseitiger Dokumente: false = laut Seitenangaben fehlen Seiten
  seiten_vollstaendig: boolean | null
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

SCHRITT 1 — PROFORMA-CHECK (vor allem anderen prüfen):
Steht irgendwo auf dem Dokument "Proforma", "Proforma-Rechnung", "Proformarechnung", "Keine Rechnung iSd UStG" oder "keine Vorsteuerabzugsberechtigung"?
→ JA: is_proforma = true, tax_rate = null, tax_amount_10 = null, tax_amount_20 = null, net_amount_10 = null, net_amount_20 = null — KEINE MwSt berechnen oder schätzen, keine Ausnahmen
→ NEIN: is_proforma = false, normal fortfahren

SCHRITT 2 — KATEGORIEN (invoice_type):
${buildKategorienSection(kategorien)}
- Gemischte Steuersätze allein sind KEIN Hinweis auf Tanken`
}

const OCR_PROMPT = buildOcrPrompt(DEFAULT_KATEGORIEN) + `

NETTOBETRAG (net_amount / net_amount_XX):
- IMMER den Nettobetrag NACH allen Rabatten/Positionsrabatten verwenden ("Netto abzüglich Rabatt", "Nettobetrag", "Zwischensumme exkl. USt.", "Summe Positionen" + Zuschläge)
- NIE den Brutto- oder Zahlbetrag als Netto verwenden
- "Summe in €", "Summe €", "Summe", "Gesamtbetrag", "Total", "Zahlbetrag", "Endbetrag" → das ist IMMER BRUTTO — NIEMALS als net_amount verwenden
- Bei Kassenbons (Restaurant, Tankstelle): die MwSt-Tabelle am Ende (Spalten Netto/Steuer/Brutto je Steuersatz) ist die einzige verlässliche Quelle für net_amount_XX und tax_amount_XX — die Gesamtsumme "Summe in €" ignorieren
- Bei Skonto: Netto VOR Skonto nehmen (Skonto ist kein Rabatt auf den Nettobetrag)
- "Zahlungen an Dritte" / "Zahlungen an A1 f. Dienste von Dritten" / "Drittanbieter" NICHT zum Nettobetrag dazuzählen — diese sind Durchleitungszahlungen ohne eigene MwSt-Aufschlüsselung und gehören in net_amount_0
- Österreichische MwSt-Sätze (UID beginnt mit "ATU"): AUSSCHLIESSLICH 0%, 10% oder 20% — 19% ist in Österreich UNMÖGLICH und VERBOTEN
- Deutsche MwSt-Sätze (UID beginnt mit "DE"): 19% oder 7% möglich
- Wenn KEINE UID sichtbar: Standard-Österreich (20%) annehmen, NICHT 19%
- Wenn kein expliziter Steuersatz sichtbar aber Nettobetrag vorhanden: tax_rate = 20 (österreichischer Standard) — NIEMALS 0 annehmen außer bei Proforma
- 19 aus einer österreichischen Postleitzahl (z.B. "1190 Wien", "1140 Wien") oder Auftragsnummer ist KEIN Steuersatz
- Zahlen in Adressen, Postleitzahlen oder Belegnummern sind NIEMALS Steuersätze

PROFORMA / KEINE VORSTEUERABZUGSBERECHTIGUNG (Wiederholung — gilt absolut):
- "Proforma-Rechnung" erkannt → tax_rate = null, ALLE tax_amount_XX = null, ALLE net_amount_XX = null. Punkt. Keine MwSt berechnen.
- net_amount = Summe Positionen + Zuschläge VOR Skonto (z.B. "Summe Positionen" 3851,82 + "Gefahrengutzuschlag" 109,00 = 3960,82) — Skonto ("Barskonto", "Skonto") ist ein Zahlungsrabatt und wird NICHT abgezogen

MEHRSEITIGE DOKUMENTE:
- Nur die Seite mit der Gesamtzusammenfassung ("Endbetrag", "Summe Positionen", "Gesamtbetrag") für Betragsfelder verwenden
- Wenn das Dokument mehrere Rechnungen enthält: nur die ERSTE vollständige Rechnung extrahieren
- Zwischensummen auf anderen Seiten ignorieren

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

SKONTO:
- Steht auf dem Beleg "Skonto", "Barskonto", "2% Skonto bei Zahlung binnen X Tagen" o.ä.?
- skonto_prozent: der Prozentsatz als Zahl (z.B. 2 für 2%), sonst null
- skonto_tage: Anzahl der Tage für die Skontofrist (z.B. 14), sonst null
- skonto_datum: das berechnete Skonto-Fälligkeitsdatum falls explizit angegeben (YYYY-MM-DD), sonst null
- Der Nettobetrag (net_amount) bleibt IMMER der Betrag VOR Skonto — Skonto nie abziehen

RECHNUNGSNUMMER: Formale Rechnungs-Nr. bevorzugen. Bei Kassenbons (Tankstelle, Restaurant) alternativ Bon-Nr., Beleg-Nr. oder Kassen-ID verwenden — niemals null lassen wenn irgendeine Belegnummer sichtbar ist.
DATUM: immer YYYY-MM-DD.
card_last_four: letzte 4 Ziffern der Karte falls sichtbar, sonst null.
supplier_name: Firmenname des Rechnungsstellers (oberster Firmenname auf dem Beleg).

DOKUMENTTYP (document_kind) — WICHTIG für die Buchhaltung:
Klassifiziere, um welche Art von Dokument es sich handelt:
- "rechnung"     → echte Rechnung / Faktura / Kassenbon / Quittung (enthält Rechnungsnummer + zu zahlenden Betrag für bereits erbrachte Leistung)
- "angebot"      → Angebot, Kostenvoranschlag, Offert, "unverbindliches Angebot", Preisauskunft (NOCH KEINE Zahlungsverpflichtung) — z.B. Versicherungsangebote
- "mahnung"      → Mahnung, Zahlungserinnerung, "1./2./3. Mahnung", Mahnspesen, "überfällig" — verweist auf eine bereits bestehende Rechnung
- "lieferschein" → Lieferschein, Packliste (keine Preise / kein Rechnungsbetrag)
- "proforma"     → Proforma-Rechnung
- "sonstige"     → alles andere
Im Zweifel "rechnung". Ein Dokument mit dem Wort "Angebot"/"Offert" im Titel ist "angebot", KEINE Rechnung.

SEITEN-VOLLSTÄNDIGKEIT (seiten_vollstaendig):
- Prüfe Seitenangaben wie "Seite X von Y", "X/Y", "Blatt X von Y".
- true  → alle Seiten 1..Y sind vorhanden ODER keine Seitenangabe erkennbar
- false → laut Seitenangabe fehlen Seiten (z.B. nur "Seite 3 von 3" vorhanden, Seiten 1-2 fehlen)`

function sanitizeOcr(result: GeminiOcrResult): GeminiOcrResult {
  if (result.is_proforma) {
    return { ...result, tax_rate: null, tax_amount_10: null, tax_amount_20: null, net_amount_10: null, net_amount_20: null }
  }
  if (result.tax_rate === 19) result = { ...result, tax_rate: 20 }
  // Only default to 20% when there's actual taxable net — not if only Trinkgeld (net_amount_0)
  if ((result.tax_rate === null || result.tax_rate === undefined) && result.net_amount && !result.net_amount_0) {
    result = { ...result, tax_rate: 20 }
  }
  // Compute skonto_datum from invoice_date + skonto_tage if not already set
  if (!result.skonto_datum && result.skonto_tage && result.invoice_date) {
    const d = new Date(normalizeDate(result.invoice_date) ?? '')
    if (!isNaN(d.getTime())) {
      d.setDate(d.getDate() + result.skonto_tage)
      result = { ...result, skonto_datum: d.toISOString().split('T')[0] }
    }
  }
  return result
}

export async function geminiOcr(base64: string, apiKey: string, kategorien?: KategoriePrompt[]): Promise<GeminiOcrResult> {
  const prompt = kategorien?.length ? buildOcrPrompt(kategorien) + OCR_PROMPT.slice(OCR_PROMPT.indexOf('\n\nNETTOBETRAG')) : OCR_PROMPT
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${apiKey}`,
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
              is_proforma:    { type: 'BOOLEAN', nullable: true },
              skonto_prozent: { type: 'NUMBER',  nullable: true },
              skonto_tage:    { type: 'NUMBER',  nullable: true },
              skonto_datum:   { type: 'STRING',  nullable: true },
              document_kind:  { type: 'STRING',  nullable: true },
              seiten_vollstaendig: { type: 'BOOLEAN', nullable: true },
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
  const raw: GeminiOcrResult = typeof text === 'string' ? JSON.parse(text) : (text ?? {})
  return sanitizeOcr(raw)
}

export interface AusgangsrechnungOcrResult {
  invoice_number:        string | null
  invoice_date:          string | null
  due_date:              string | null
  customer_name:         string | null
  subject:               string | null
  net_amount_20:         number | null
  net_amount_10:         number | null
  net_amount_0:          number | null
  tax_amount_20:         number | null
  tax_amount_10:         number | null
  total_brutto:          number | null
  zahlungsziel_tage:     number | null
  is_schlussrechnung:    boolean | null
  teilrechnungen_brutto: number | null
  is_stornorechnung:     boolean | null
}

const AUSGANGSRECHNUNG_PROMPT = `Du analysierst eine AUSGANGSRECHNUNG (eine Rechnung, die wir an einen Kunden gestellt haben).
Extrahiere alle Felder als JSON.

WICHTIG — RECHNUNGSEMPFÄNGER (customer_name):
- Das ist der KUNDE / EMPFÄNGER der Rechnung, NICHT der Aussteller
- Suche nach "An:", "Rechnungsempfänger:", "Kunde:", "Auftraggeber:", Adressblock oben rechts oder Mitte
- Der Aussteller (unser Unternehmen, z.B. "Quick Energy") ist NICHT der customer_name
- customer_name = Firmenname oder Vor-/Nachname des Empfängers

BETREFF / SUBJECT:
- Suche nach "Betreff:", "Re:", "Leistungsbeschreibung:", Überschrift unter dem Dokument
- Bei Schlussrechnungen: Überschrift wie "Schlussrechnung Nr. RE-XXXX aus Auftragsbestätigung YYYY" verwenden
- Kurze Beschreibung der Leistung (max. 1 Zeile)

STORNORECHNUNG — PRÜFE ZUERST:
- Erkenne ob es eine Stornorechnung ist: Schlagwörter "Stornorechnung", "Storno zur Rechnung", "Storno-Rechnung", oder wenn ALLE Beträge negativ sind
- is_stornorechnung = true wenn solche Begriffe vorkommen oder alle Beträge negativ sind, sonst false
- Bei einer Stornorechnung sind ALLE Beträge negativ (Netto, USt., Brutto)
- net_amount_20 = negativer Nettobetrag (z.B. -9705.60) — negative Zahl ist KORREKT und PFLICHT
- tax_amount_20 = negativer USt-Betrag (z.B. -1941.12)
- total_brutto = negativer Bruttobetrag (z.B. -11646.72)
- NIEMALS 0 oder positiv zurückgeben bei einer Stornorechnung — die negativen Zahlen MÜSSEN erhalten bleiben
- Beispiel RE-1002639: Gesamtbetrag netto -9.705,60 → net_amount_20=-9705.60, tax_amount_20=-1941.12, total_brutto=-11646.72

SCHLUSSRECHNUNG — WICHTIGSTE REGEL:
- Erkenne ob es eine Schlussrechnung ist: Schlagwörter "Schlussrechnung", "Verrechnung der Teilrechnungen", "Verbleibende Restforderung", "Summe Teilrechnungen"
- is_schlussrechnung = true wenn solche Begriffe vorkommen, sonst false
- Bei einer Schlussrechnung gibt es am ENDE (letzte Seite) eine Zusammenfassung mit:
    "Summe Schlussrechnung brutto"  → Gesamtbetrag der Anlage (NICHT verwenden für total_brutto)
    "Summe Teilrechnungen brutto"   → bereits bezahlte Anzahlungen → teilrechnungen_brutto
    "Gesamtbetrag netto"            → verbleibendes Netto nach Abzug der Teilrechnungen
    "zzgl. Umsatzsteuer XX%"        → verbleibende USt.
    "Verbleibende Restforderung brutto" → DER TATSÄCHLICH ZU ZAHLENDE BETRAG → total_brutto
- total_brutto bei Schlussrechnung = "Verbleibende Restforderung brutto" (NICHT "Gesamtbetrag brutto" aus der Positionsliste!)
- net_amount_20 bei Schlussrechnung = "Gesamtbetrag netto" aus der Schlussrechnung-Zusammenfassung (letzte Seite, NICHT aus der Positionstabelle)
- tax_amount_20 bei Schlussrechnung = "zzgl. Umsatzsteuer" aus der Schlussrechnung-Zusammenfassung (letzte Seite)
- Beispiel RE-1002625: Positionsliste ergibt 14.326,88 netto / 17.192,26 brutto — ABER Schlussrechnung-Zusammenfassung zeigt 8.596,13 netto / 1.719,23 USt. / 10.315,36 Restforderung → net_amount_20=8596.13, tax_amount_20=1719.23, total_brutto=10315.36

BETRÄGE (normale Rechnung ohne Schlussrechnung-Zusammenfassung):
- net_amount_20: Summe aller Nettopositionen mit 20% USt.
- net_amount_10: Summe aller Nettopositionen mit 10% USt.
- net_amount_0:  Summe aller Nettopositionen mit 0% USt.
- tax_amount_20: tatsächlicher USt.-Betrag bei 20% (direkt vom Beleg, nicht ausrechnen)
- tax_amount_10: tatsächlicher USt.-Betrag bei 10%
- total_brutto:  Gesamtbetrag inkl. USt. ("Gesamtbetrag", "Brutto", "Zahlbetrag", "Zu zahlen")

ZAHLUNGSZIEL:
- zahlungsziel_tage: Anzahl Tage Zahlungsziel (z.B. "zahlbar binnen 14 Tagen" → 14), null wenn nicht angegeben
- Bei "Zahlung sofort nach Rechnungseingang" → zahlungsziel_tage = 0

DATUM: immer YYYY-MM-DD.
invoice_number: formale Rechnungsnummer.`

async function callGemini(base64: string, apiKey: string, prompt: string, schema: object): Promise<unknown> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${apiKey}`,
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
          response_schema: schema,
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

export async function geminiOcrAusgangsrechnung(base64: string, apiKey: string): Promise<AusgangsrechnungOcrResult> {
  const result = await callGemini(base64, apiKey, AUSGANGSRECHNUNG_PROMPT, {
    type: 'OBJECT',
    properties: {
      invoice_number:        { type: 'STRING',  nullable: true },
      invoice_date:          { type: 'STRING',  nullable: true },
      due_date:              { type: 'STRING',  nullable: true },
      customer_name:         { type: 'STRING',  nullable: true },
      subject:               { type: 'STRING',  nullable: true },
      net_amount_20:         { type: 'NUMBER',  nullable: true },
      net_amount_10:         { type: 'NUMBER',  nullable: true },
      net_amount_0:          { type: 'NUMBER',  nullable: true },
      tax_amount_20:         { type: 'NUMBER',  nullable: true },
      tax_amount_10:         { type: 'NUMBER',  nullable: true },
      total_brutto:          { type: 'NUMBER',  nullable: true },
      zahlungsziel_tage:     { type: 'NUMBER',  nullable: true },
      is_schlussrechnung:    { type: 'BOOLEAN', nullable: true },
      teilrechnungen_brutto: { type: 'NUMBER',  nullable: true },
      is_stornorechnung:     { type: 'BOOLEAN', nullable: true },
    },
  }) as AusgangsrechnungOcrResult
  return {
    ...result,
    invoice_date: normalizeDate(result.invoice_date),
    due_date:     normalizeDate(result.due_date),
  }
}
