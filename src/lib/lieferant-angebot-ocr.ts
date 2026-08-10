import { callOpenRouterPdfJson } from './gemini-ocr'

export interface LieferantAngebotPosition {
  menge:          number
  einheit:        string | null
  artikelnummer:  string | null
  bezeichnung:    string
  ek_einzelpreis: number   // Netto-Einkaufspreis pro Einheit
}

export interface LieferantAngebotOcrResult {
  lieferant:      string | null
  angebotsnummer: string | null
  positionen:     LieferantAngebotPosition[]
}

const PROMPT = `Du analysierst ein LIEFERANTEN-ANGEBOT (Großhändler-Angebot an uns) und extrahierst alle Positionen als JSON.

ZIEL: Für jede Angebotsposition den EINKAUFSPREIS (Netto pro Einheit) und die Daten auslesen. Es geht um den Preis, den WIR beim Lieferanten zahlen.

KOPFDATEN:
- lieferant: Name des Lieferanten/Großhändlers (oberer Absender, z.B. "Kontinentale")
- angebotsnummer: die Angebots-/Beleg-Nummer

POSITIONEN (positionen[]) — jede Artikelzeile (z.B. "Pos. 100", "Pos. 200"):
- menge:          Stückzahl der Position (z.B. "1 ST" → 1, "2 ST" → 2)
- einheit:        Mengeneinheit (z.B. "ST" → "Stk", "M" → "lfm"), sonst "Stk"
- artikelnummer:  Artikel-/Materialnummer des Lieferanten (z.B. "ALKLMAE125NO"), sonst null
- bezeichnung:    vollständige Artikelbezeichnung inkl. Zusatzzeile (z.B. "ALVA Klima Außeneinheit Multi 12,3 kW, KSTI M5-42/125 NOVA")
- ek_einzelpreis: NETTO-EINZELPREIS pro EINHEIT (die Spalte "Preis / Preiseinheit", z.B. "1.834,51 / 1 ST" → 1834.51). NICHT der Nettowert/Gesamtwert der Zeile.

WICHTIG:
- ek_einzelpreis ist der Preis pro EINER Einheit, nicht Menge × Preis. Beispiel: "2 ST ... 119,02 / 1 ST" → ek_einzelpreis = 119.02 (nicht 238,03).
- Zahlenformat: Punkt = Tausendertrenner, Komma = Dezimal (1.834,51 → 1834.51).
- Summen, Skonto, Mehrwertsteuer, Endbetrag, Ursprung, ZolltarifNr. NICHT als Position aufnehmen.
- Nur echte Artikelpositionen extrahieren.`

// Lieferanten-Einheit ("ST", "M", …) auf unsere Einheiten mappen.
export function mapLieferantEinheit(e: string | null): string {
  const s = (e ?? '').trim().toLowerCase()
  if (s.startsWith('st')) return 'Stk'
  if (s === 'm' || s === 'lfm') return 'lfm'
  if (s === 'm2' || s === 'm²') return 'm²'
  if (s === 'kwp') return 'kWp'
  if (s === 'kwh') return 'kWh'
  if (['std', 'pausch', 'set'].includes(s)) return s
  return 'Stk'
}

export async function lieferantAngebotOcr(base64: string, apiKey: string): Promise<LieferantAngebotOcrResult> {
  const raw = await callOpenRouterPdfJson<LieferantAngebotOcrResult>(base64, apiKey, PROMPT)
  return {
    lieferant:      raw.lieferant ?? null,
    angebotsnummer: raw.angebotsnummer ?? null,
    positionen:     (raw.positionen ?? []).filter(p => p && p.bezeichnung),
  }
}
