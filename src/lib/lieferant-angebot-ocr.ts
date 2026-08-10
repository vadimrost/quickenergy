import { callOpenRouterPdfJson } from './gemini-ocr'

export interface AngebotPosition {
  menge:         number
  einheit:       string | null
  artikelnummer: string | null
  bezeichnung:   string
  einzelpreis:   number   // Netto-Einzelpreis pro Einheit (EK bei Lieferant, VK bei eigenem Angebot)
}

export interface LieferantAngebotOcrResult {
  lieferant:           string | null
  angebotsnummer:      string | null
  ist_eigenes_angebot: boolean   // true = von Quick Energy ausgestellt (Einzelpreis = VK)
  positionen:          AngebotPosition[]
}

const PROMPT = `Du analysierst ein ANGEBOT und extrahierst alle Positionen als JSON.

DOKUMENTTYP (WICHTIG):
- ist_eigenes_angebot = true, wenn das Angebot von "Quick Energy" AUSGESTELLT wurde (Absender/Logo oben = Quick Energy, gerichtet an einen Kunden). Dann ist der Einzelpreis unser VERKAUFSPREIS.
- ist_eigenes_angebot = false, wenn ein Lieferant/Großhändler (z.B. Kontinentale) UNS ein Angebot macht (Quick Energy steht als Empfänger). Dann ist der Einzelpreis der EINKAUFSPREIS.

KOPFDATEN:
- lieferant: Name des Ausstellers (bei Lieferanten-Angebot der Großhändler; bei eigenem Angebot "Quick Energy")
- angebotsnummer: die Angebots-/Beleg-Nummer

POSITIONEN (positionen[]) — jede Artikel-/Leistungszeile über ALLE Abschnitte/Tabellen hinweg:
- menge:         Stückzahl (z.B. "1 ST" / "1,00 Stk" → 1, "2 ST" → 2, "pauschal"/"pausch" → 1)
- einheit:       "ST"/"Stk" → "Stk", "pauschal" → "pausch", "M"/"lfm" → "lfm", sonst "Stk"
- artikelnummer: Artikel-/Materialnummer falls vorhanden (z.B. "ALKLMAE125NO"), sonst null
- bezeichnung:   Bezeichnung der Position (erste/fette Zeile; Aufzählungs-/Detailzeilen nicht nötig)
- einzelpreis:   NETTO-Einzelpreis pro EINER Einheit (Spalte "Einzelpreis"/"EP netto"/"Preis") — NICHT der Gesamtpreis/GP/Nettowert.

WICHTIG:
- einzelpreis ist pro EINER Einheit. Beispiel "2 ST ... 119,02 / 1 ST" → 119.02 (nicht 238,03).
- Auch Pauschalpositionen (Montage, Montagematerial etc.) erfassen: menge 1, einheit "pausch", einzelpreis = Pauschalbetrag.
- Summen, USt, Skonto, Endbetrag, Zusammenfassung, Zwischensummen NICHT als Position aufnehmen.
- Zahlenformat: Punkt = Tausendertrenner, Komma = Dezimal (1.834,51 → 1834.51).`

export function mapLieferantEinheit(e: string | null): string {
  const s = (e ?? '').trim().toLowerCase()
  if (s.startsWith('st')) return 'Stk'
  if (s.startsWith('pausch')) return 'pausch'
  if (s === 'm' || s === 'lfm') return 'lfm'
  if (s === 'm2' || s === 'm²') return 'm²'
  if (s === 'kwp') return 'kWp'
  if (s === 'kwh') return 'kWh'
  if (['std', 'set'].includes(s)) return s
  return 'Stk'
}

export async function lieferantAngebotOcr(base64: string, apiKey: string): Promise<LieferantAngebotOcrResult> {
  const raw = await callOpenRouterPdfJson<LieferantAngebotOcrResult>(base64, apiKey, PROMPT)
  return {
    lieferant:           raw.lieferant ?? null,
    angebotsnummer:      raw.angebotsnummer ?? null,
    ist_eigenes_angebot: raw.ist_eigenes_angebot ?? false,
    positionen:          (raw.positionen ?? []).filter(p => p && p.bezeichnung),
  }
}
