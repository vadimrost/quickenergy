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
}

export function berechneSummen(positionen: PositionDraft[], rabattGesamt = 0): Summen {
  let netto_20 = 0, netto_10 = 0, netto_0 = 0

  for (const p of positionen) {
    const z = berechneZeilenbetrag(p)
    if (p.ust_satz === 20) netto_20 += z
    else if (p.ust_satz === 10) netto_10 += z
    else netto_0 += z
  }

  if (rabattGesamt > 0) {
    const f = 1 - rabattGesamt / 100
    netto_20 *= f
    netto_10 *= f
    netto_0 *= f
  }

  const ust_20 = netto_20 * 0.2
  const ust_10 = netto_10 * 0.1
  const netto_gesamt = netto_20 + netto_10 + netto_0
  const brutto = netto_gesamt + ust_20 + ust_10

  return { netto_20, netto_10, netto_0, ust_20, ust_10, brutto, netto_gesamt }
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
  }
}
