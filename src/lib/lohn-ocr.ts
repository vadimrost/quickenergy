import { callOpenRouterPdfJson } from './gemini-ocr'

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
  const raw = await callOpenRouterPdfJson<LohnOcrResult>(base64, apiKey, LOHN_PROMPT)
  return {
    ...raw,
    dienstnehmer:    raw.dienstnehmer    ?? [],
    koerperschaften: raw.koerperschaften ?? [],
  }
}
