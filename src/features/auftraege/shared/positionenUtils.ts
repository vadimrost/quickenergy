import type { DokumentPosition } from '@/types/database'

export type PositionDraft = Omit<DokumentPosition, 'id' | 'created_at' | 'dokument_id' | 'dokument_typ'>

export const EINHEITEN = ['Stk', 'Std', 'm²', 'lfm', 'kWp', 'kWh', 'pausch', 'Set'] as const
export const UST_SAETZE = [0, 10, 20] as const

export function berechneZeilenbetrag(p: Pick<PositionDraft, 'menge' | 'einzelpreis_netto' | 'rabatt_prozent'>): number {
  return p.menge * p.einzelpreis_netto * (1 - p.rabatt_prozent / 100)
}

export interface Summen {
  netto_20: number
  netto_10: number
  netto_0: number
  ust_20: number
  ust_10: number
  brutto: number
  netto_gesamt: number
  /** Nettosumme der Positionen, bevor der Gesamtrabatt abgezogen wurde */
  netto_vor_rabatt: number
  /** Tatsächlich abgezogener Gesamtrabatt in Euro (0 = kein Rabatt) */
  rabatt_betrag: number
  /** Rabattsatz, wenn prozentual gerabattet wurde — sonst 0 (Festbetrag) */
  rabatt_prozent: number
}

/**
 * Gesamtrabatt: entweder prozentual (rabattProzent) oder als fester Euro-Betrag
 * (rabattBetrag). Ein Festbetrag wird anteilig auf die USt-Sätze verteilt, damit
 * die Umsatzsteuer korrekt bleibt.
 */
export function berechneSummen(positionen: PositionDraft[], rabattProzent = 0, rabattBetrag = 0): Summen {
  let netto_20 = 0, netto_10 = 0, netto_0 = 0

  for (const p of positionen) {
    const z = berechneZeilenbetrag(p)
    if (p.ust_satz === 20) netto_20 += z
    else if (p.ust_satz === 10) netto_10 += z
    else netto_0 += z
  }

  const netto_vor_rabatt = netto_20 + netto_10 + netto_0

  let faktor = 1
  if (rabattBetrag > 0) {
    // Rabatt nie größer als die Positionssumme
    faktor = netto_vor_rabatt > 0 ? Math.max(0, 1 - rabattBetrag / netto_vor_rabatt) : 1
  } else if (rabattProzent > 0) {
    faktor = Math.max(0, 1 - rabattProzent / 100)
  }
  netto_20 *= faktor
  netto_10 *= faktor
  netto_0 *= faktor

  const ust_20 = netto_20 * 0.2
  const ust_10 = netto_10 * 0.1
  const netto_gesamt = netto_20 + netto_10 + netto_0
  const brutto = netto_gesamt + ust_20 + ust_10

  return {
    netto_20, netto_10, netto_0, ust_20, ust_10, brutto, netto_gesamt,
    netto_vor_rabatt,
    rabatt_betrag: netto_vor_rabatt - netto_gesamt,
    rabatt_prozent: rabattBetrag > 0 ? 0 : rabattProzent,
  }
}

/** Beschriftung der Rabattzeile — mit Satz bei Prozentrabatt, ohne bei Festbetrag. */
export function rabattLabel(rabattProzent: number): string {
  if (rabattProzent <= 0) return 'Gesamtrabatt'
  const satz = Number.isInteger(rabattProzent) ? String(rabattProzent) : String(rabattProzent).replace('.', ',')
  return `Gesamtrabatt (${satz}%)`
}

/**
 * Rabattzeile für ein bereits gespeichertes Dokument: dort sind die Netto-Summen
 * schon nach Rabatt abgelegt, der Ausgangswert muss zurückgerechnet werden.
 */
export function rabattAnzeige(
  nettoNachRabatt: number,
  rabattProzent = 0,
  rabattBetrag = 0,
): { label: string; betrag: number; nettoVorRabatt: number } | null {
  if (rabattBetrag > 0) {
    return {
      label: rabattLabel(0),
      betrag: rabattBetrag,
      nettoVorRabatt: nettoNachRabatt + rabattBetrag,
    }
  }
  // Bei 100% liesse sich der Ausgangswert nicht zurueckrechnen
  if (rabattProzent > 0 && rabattProzent < 100) {
    const vor = nettoNachRabatt / (1 - rabattProzent / 100)
    return {
      label: rabattLabel(rabattProzent),
      betrag: vor - nettoNachRabatt,
      nettoVorRabatt: vor,
    }
  }
  return null
}

export function emptyPosition(reihenfolge = 0): PositionDraft {
  return {
    reihenfolge,
    bezeichnung: '',
    beschreibung: null,
    menge: 1,
    einheit: 'Stk',
    einzelpreis_netto: 0,
    ust_satz: 20,
    rabatt_prozent: 0,
    zeilenbetrag_netto: 0,
    bild_url: null,
    ek_netto: null,
  }
}
