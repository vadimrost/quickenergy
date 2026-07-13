import { callOpenRouterPdfJson } from './gemini-ocr'

export interface BankTransaktionRaw {
  datum: string
  betrag: number
  buchungstext: string
  empfaenger: string | null
  referenz: string | null
  typ: string
}

export interface KontoauszugOcrResult {
  konto_iban: string | null
  konto_name: string | null
  auszug_nr: string | null
  von_datum: string | null
  bis_datum: string | null
  alter_kontostand: number | null
  neuer_kontostand: number | null
  transaktionen: BankTransaktionRaw[]
}

const PROMPT = `Analysiere diesen Kontoauszug der Erste Bank und extrahiere alle Daten strukturiert als JSON.

KONTODATEN:
- konto_iban: IBAN (z.B. "AT622011129026122005")
- konto_name: Kontoinhaber-Firmenname
- auszug_nr: Auszugsnummer (z.B. "004/2026")
- von_datum: Erster Buchungstag → YYYY-MM-DD
- bis_datum: Letzter Buchungstag → YYYY-MM-DD
- alter_kontostand: Zahl (positiv)
- neuer_kontostand: Zahl (negativ wenn Schulden, z.B. -34663.83)

TRANSAKTIONEN — alle Einträge aus der Buchungstabelle:
- datum: aus der Valuta-Spalte → YYYY-MM-DD
- betrag: NEGATIV für Belastungen (Betragszeile endet auf "-"), POSITIV für Gutschriften.
  Zahlenformat: Punkt = Tausendertrenner, Komma = Dezimal → Float (z.B. "19,80-" → -19.8, "11.910,82" → 11910.82, "28.510,24" → 28510.24)
- buchungstext: erste Zeile des Eintrags (Buchungstext/Referenz)
- empfaenger: zweite Zeile falls vorhanden (Firmenname/Person), sonst null
- referenz: erkennbare Rechnungs-/Auftragsnummer aus dem Text (z.B. "R10036702", "RE 2026/0532", "RG 914278934", "RE-1002615/20260325"), sonst null
- typ:
  → Zeile beginnt mit "POS" → "pos"
  → Zeile beginnt mit "ATM" → "atm"
  → Zeile beginnt mit "E-COMM" → "ecomm"
  → Text enthält "Gehalt" → "gehalt"
  → Text enthält "Spesen" → "spesen"
  → betrag > 0 → "eingang"
  → sonst → "ueberweisung"

WICHTIG:
- ALLE Transaktionen extrahieren (auch Kartenzahlungen, ATM, E-Commerce)
- Tausenderpunkte ignorieren: "1.800,00" = 1800.00
- Einträge mit "*" im Datum sind Gutschriften (positiv)
- Keine Summenzeilen ("Neuer Kontostand" etc.) als Transaktion
- Jeden Buchungseintrag genau einmal erfassen`

export async function kontoauszugOcr(base64: string, apiKey: string): Promise<KontoauszugOcrResult> {
  const raw = await callOpenRouterPdfJson<KontoauszugOcrResult>(base64, apiKey, PROMPT)
  return { ...raw, transaktionen: raw.transaktionen ?? [] }
}
