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
  /** Kontrollsumme aus dem Auszugskopf — nur zur Pruefung, wird nicht gespeichert */
  summe_gutschriften: number | null
  /** Kontrollsumme aus dem Auszugskopf (positiver Betrag) */
  summe_belastungen: number | null
  transaktionen: BankTransaktionRaw[]
}

const PROMPT = `Analysiere diesen Kontoauszug der Erste Bank und extrahiere alle Daten strukturiert als JSON.

KONTODATEN — diese Felder sind PFLICHT, sie stehen immer im Kopf der ersten Seite:
- konto_iban: IBAN (z.B. "AT622011129026122005")
- konto_name: Kontoinhaber-Firmenname
- auszug_nr: Auszugsnummer, steht neben "Kontoauszug" als "Nr. 003/2026" → "003/2026"
- alter_kontostand: Zahl hinter "Alter Kontostand" (negativ wenn der Betrag auf "-" endet)
- neuer_kontostand: Zahl hinter "Neuer Kontostand" (negativ wenn der Betrag auf "-" endet)
- summe_gutschriften: Zahl hinter "Gutschriften" (immer positiv)
- summe_belastungen: Zahl hinter "Belastungen" (als positive Zahl angeben)
- von_datum: fruehester Valuta-Tag der Buchungstabelle → YYYY-MM-DD
- bis_datum: spaetester Valuta-Tag der Buchungstabelle → YYYY-MM-DD

TRANSAKTIONEN — alle Einträge aus der Buchungstabelle:
- datum: aus der Valuta-Spalte → YYYY-MM-DD. Achtung: im Buchungstext steht oft ein
  ANDERES Datum (der Kartenzeitpunkt, z.B. "POS 59,47 AT K1 27.02. 00:00"). Nimm immer
  das vollstaendige Datum aus der Valuta-Spalte, niemals das aus dem Buchungstext.
- betrag: Das Vorzeichen haengt AUSSCHLIESSLICH davon ab, ob der Betrag auf "-" endet:
  → Betrag endet auf "-" (z.B. "59,47-")  ⇒ NEGATIV (Belastung)
  → Betrag endet NICHT auf "-" (z.B. "2.500,00") ⇒ POSITIV (Gutschrift)
  Zahlenformat: Punkt = Tausendertrenner, Komma = Dezimal → Float
  (z.B. "19,80-" → -19.8, "11.910,82" → 11910.82, "28.510,24" → 28510.24)
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
- Ein "*" hinter dem Valuta-Datum ist NUR die Markierung der Belege-Spalte
  ("Belege/Vouchers"). Es sagt NICHTS über das Vorzeichen aus. Ein Eintrag mit "*"
  kann genauso eine Belastung sein — allein das "-" am Betrag entscheidet.
- ALLE Transaktionen extrahieren (auch Kartenzahlungen, ATM, E-Commerce), auch die
  auf der letzten Seite und die Kleinbetraege (Spesen, Zinsen, 0,01).
- Tausenderpunkte ignorieren: "1.800,00" = 1800.00
- Keine Summenzeilen ("Alter/Neuer Kontostand", "Gutschriften", "Belastungen",
  Seitenuebertraege) als Transaktion erfassen
- Jeden Buchungseintrag genau einmal erfassen
- Kontrolle: alter_kontostand + Summe aller Transaktionen muss exakt
  neuer_kontostand ergeben. Stimmt es nicht, fehlt eine Buchung oder ein
  Vorzeichen ist falsch — dann die Buchungstabelle noch einmal durchgehen.`

export async function kontoauszugOcr(base64: string): Promise<KontoauszugOcrResult> {
  const raw = await callOpenRouterPdfJson<KontoauszugOcrResult>(base64, PROMPT)
  const transaktionen = raw.transaktionen ?? []

  // Zeitraum notfalls aus den Buchungen ableiten — sonst steht im Auszug "? – ?"
  // und die Lueckenerkennung zwischen den Monaten greift nicht.
  const daten = transaktionen.map(t => t.datum).filter(Boolean).sort()
  const von_datum = raw.von_datum ?? daten[0] ?? null
  const bis_datum = raw.bis_datum ?? daten[daten.length - 1] ?? null

  return { ...raw, von_datum, bis_datum, transaktionen }
}

/**
 * Kontrolle des Auszugs: alter Kontostand + Summe der Buchungen muss den neuen
 * Kontostand ergeben. Weicht es ab, fehlt eine Buchung oder ein Vorzeichen ist
 * falsch. Gibt die Differenz zurueck (null = kein Befund / nicht pruefbar).
 */
export function kontoauszugDifferenz(
  alterKontostand: number | null | undefined,
  neuerKontostand: number | null | undefined,
  betraege: number[],
): number | null {
  if (alterKontostand == null || neuerKontostand == null) return null
  const summe = betraege.reduce((s, b) => s + b, 0)
  const diff = Math.round((alterKontostand + summe - neuerKontostand) * 100) / 100
  return Math.abs(diff) < 0.01 ? null : diff
}
