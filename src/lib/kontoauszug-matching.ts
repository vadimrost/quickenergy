import type { Rechnung, LohnDienstnehmer, BankTransaktion } from '@/types/database'

export interface MatchCandidate {
  type: 'rechnung' | 'lohn'
  id: string
  score: number
  label: string
  betrag: number
  datum: string | null
}

function nameSim(a: string | null | undefined, b: string | null | undefined): number {
  if (!a || !b) return 0
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim()
  const an = norm(a)
  const bn = norm(b)
  if (an === bn) return 1
  if (an.includes(bn) || bn.includes(an)) return 0.9
  const aw = an.split(' ').filter(w => w.length > 2)
  const bw = bn.split(' ').filter(w => w.length > 2)
  if (!aw.length || !bw.length) return 0
  const hits = aw.filter(w => bw.some(bwi => bwi.includes(w) || w.includes(bwi)))
  return hits.length / Math.max(aw.length, bw.length)
}

function brutto(r: Rechnung): number {
  const m10 = r.mwst_10 ?? ((r.betrag_10 ?? 0) * 0.1)
  const m20 = r.mwst_20 ?? ((r.betrag_20 ?? 0) * 0.2)
  const hasSplit = (r.betrag_10 ?? 0) + (r.betrag_20 ?? 0) + (r.betrag_0 ?? 0) > 0
  if (hasSplit) return Math.round((r.betrag + m10 + m20) * 100) / 100
  return Math.round(r.betrag * (1 + (r.ust_satz ?? 0) / 100) * 100) / 100
}

function amountScore(txAbs: number, target: number): number {
  if (target <= 0) return 0
  const diff = Math.abs(txAbs - target) / target
  if (diff < 0.001) return 0.55
  if (diff < 0.01)  return 0.40
  if (diff < 0.05)  return 0.20
  return 0
}

function dateScore(txDatum: string, refDatum: string | null | undefined): number {
  if (!refDatum) return 0
  const diff = Math.abs(
    (new Date(txDatum).getTime() - new Date(refDatum).getTime()) / 86400000
  )
  if (diff <= 3)  return 0.25
  if (diff <= 14) return 0.18
  if (diff <= 45) return 0.10
  if (diff <= 90) return 0.05
  return 0
}

export function matchTransaktion(
  tx: BankTransaktion,
  rechnungen: Rechnung[],
  lohnDienstnehmer: LohnDienstnehmer[],
): MatchCandidate[] {
  if (tx.betrag >= 0) return [] // nur Ausgaben matchen
  const abs = Math.abs(tx.betrag)
  const candidates: MatchCandidate[] = []

  // Match against rechnungen
  for (const r of rechnungen) {
    if (r.status === 'bezahlt') continue
    const aScore = amountScore(abs, brutto(r))
    if (aScore === 0) continue
    const dScore = dateScore(tx.datum, r.rechnungsdatum ?? r.faelligkeit)
    const name = r.lieferant?.name ?? (r.ocr_json as any)?.supplier_name ?? ''
    const nScore = nameSim(tx.empfaenger, name) * 0.20
    const refScore = tx.referenz && r.rechnungsnr &&
      (r.rechnungsnr.toLowerCase().includes(tx.referenz.toLowerCase()) ||
       tx.referenz.toLowerCase().includes(r.rechnungsnr.toLowerCase())) ? 0.15 : 0
    const score = Math.min(1, aScore + dScore + nScore + refScore)
    if (score >= 0.40) {
      candidates.push({ type: 'rechnung', id: r.id, score, label: name || r.rechnungsnr, betrag: brutto(r), datum: r.rechnungsdatum })
    }
  }

  // Match against lohn_dienstnehmer
  for (const l of lohnDienstnehmer) {
    if (l.bank_transaktion_id) continue
    const aScore = amountScore(abs, l.betrag)
    if (aScore === 0) continue
    const nScore = nameSim(tx.empfaenger, l.name) * 0.35
    const score = Math.min(1, aScore + nScore)
    if (score >= 0.40) {
      candidates.push({ type: 'lohn', id: l.id, score, label: l.name, betrag: l.betrag, datum: null })
    }
  }

  return candidates.sort((a, b) => b.score - a.score)
}

export const AUTO_MATCH_THRESHOLD = 0.72
