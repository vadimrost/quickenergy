export interface LohnDienstnehmerRaw {
  ma_nr: number | null
  name: string
  iban: string | null
  betrag: number
  zahlungsart: string
}

export interface LohnKoerperschaftRaw {
  bezeichnung: string
  swift_bic: string | null
  iban: string | null
  betrag: number
  typ: string | null
}

export interface LohnOcrResult {
  monat: number | null
  jahr: number | null
  gesamt_dienstnehmer: number | null
  gesamt_koerperschaften: number | null
  gesamt_total: number | null
  dienstnehmer: LohnDienstnehmerRaw[]
  koerperschaften: LohnKoerperschaftRaw[]
}

const LOHN_PROMPT = `Analysiere dieses Auszahlungsjournal / Lohnabrechnung und extrahiere alle Daten als JSON.

MONAT & JAHR:
Aus dem Titel "Auszahlungsjournal Mai 2026" → monat: 5, jahr: 2026.
Januar=1, Februar=2, März=3, April=4, Mai=5, Juni=6, Juli=7, August=8, September=9, Oktober=10, November=11, Dezember=12.

DIENSTNEHMER-TABELLE (jede Zeile mit Ma-Nr und Name):
- Steht in der SWIFT/BIC-Spalte "Barzahlung" → zahlungsart: "barzahlung", iban: null
- Steht dort ein echter BIC-Code → zahlungsart: "ueberweisung", IBAN aus der IBAN-Spalte übernehmen
- Betrag: Dezimalzahl (2.790,59 → 2790.59 — Punkt ist Tausendertrenner, Komma ist Dezimaltrenner)

KÖRPERSCHAFTEN-TABELLE (Behörden & Abgaben):
- Jede Organisation als eigene Zeile erfassen
- typ-Regeln:
  → enthält "ÖGK" oder "Krankenkasse" → typ: "oegk"
  → enthält "Finanzamt" → typ: "finanzamt"
  → "KommSt" oder "Kommunalsteuer" → typ: "kommunalsteuer"
  → "DGA" → typ: "dga"
  → sonst → typ: "sonstige"
- Wenn eine Zeile Unterzeilen hat (z.B. L: 1406,48 / DB: 539,08 / DZ: 52,45), den Gesamtbetrag der Hauptzeile nehmen.
- "Summe Gemeinden" ist KEINE eigene Körperschaft — nur echte Organisationen aufnehmen.

SUMMEN: "Summe Dienstnehmer" → gesamt_dienstnehmer, "Summe Körperschaften" → gesamt_koerperschaften, "Gesamt-Summe" → gesamt_total.
Alle Beträge als Dezimalzahlen (Punkt als Dezimaltrenner).`

export async function lohnOcr(base64: string, apiKey: string): Promise<LohnOcrResult> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [
          { inline_data: { mime_type: 'application/pdf', data: base64 } },
          { text: LOHN_PROMPT },
        ]}],
        generationConfig: {
          response_mime_type: 'application/json',
          response_schema: {
            type: 'OBJECT',
            properties: {
              monat:                  { type: 'INTEGER', nullable: true },
              jahr:                   { type: 'INTEGER', nullable: true },
              gesamt_dienstnehmer:    { type: 'NUMBER',  nullable: true },
              gesamt_koerperschaften: { type: 'NUMBER',  nullable: true },
              gesamt_total:           { type: 'NUMBER',  nullable: true },
              dienstnehmer: {
                type: 'ARRAY',
                items: {
                  type: 'OBJECT',
                  properties: {
                    ma_nr:       { type: 'INTEGER', nullable: true },
                    name:        { type: 'STRING' },
                    iban:        { type: 'STRING', nullable: true },
                    betrag:      { type: 'NUMBER' },
                    zahlungsart: { type: 'STRING' },
                  },
                },
              },
              koerperschaften: {
                type: 'ARRAY',
                items: {
                  type: 'OBJECT',
                  properties: {
                    bezeichnung: { type: 'STRING' },
                    swift_bic:   { type: 'STRING', nullable: true },
                    iban:        { type: 'STRING', nullable: true },
                    betrag:      { type: 'NUMBER' },
                    typ:         { type: 'STRING', nullable: true },
                  },
                },
              },
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
  const raw: LohnOcrResult = typeof text === 'string' ? JSON.parse(text) : (text ?? {})
  return {
    ...raw,
    dienstnehmer:    raw.dienstnehmer    ?? [],
    koerperschaften: raw.koerperschaften ?? [],
  }
}
