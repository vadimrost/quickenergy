import type { Rechnung, LohnDienstnehmer, BankTransaktion } from '@/types/database'

export interface MatchCandidate {
  type: 'rechnung' | 'lohn'
  id: string
  score: number
  label: string
  betrag: number
  datum: string | null
}

// Normalisiert Firmennamen für Vergleich:
// - Umlaute → ASCII (ä→ae etc.)
// - Rechtliche Suffixe entfernen (GmbH, AG, KG …)
// - Sonderzeichen + Leerzeichen normalisieren
function normName(s: string | null | undefined): string {
  if (!s) return ''
  return s
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/\boesterreich\b/g, 'osterreich')
    .replace(/\b(gmbh\s*&\s*co\.?\s*kg|gmbh\s*co\s*kg|gmbh|ag|og|kg|eg|keg|inc|ltd|bv|nv|sa|srl|sro|spol)\b/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function nameSim(a: string | null | undefined, b: string | null | undefined): number {
  if (!a || !b) return 0
  const an = normName(a)
  const bn = normName(b)
  if (!an || !bn) return 0
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

// Prüft txAbs gegen einen Zielbetrag und gibt Score zurück
function scoreForAmount(txAbs: number, target: number): number {
  if (target <= 0) return 0
  const diff = Math.abs(txAbs - target) / target
  if (diff < 0.001) return 0.55
  if (diff < 0.01)  return 0.45
  if (diff < 0.03)  return 0.30
  if (diff < 0.05)  return 0.15
  return 0
}

// Betrag-Score: prüft Brutto UND Skonto-reduzierten Betrag
function amountScore(txAbs: number, r: Rechnung): number {
  const b = brutto(r)
  let best = scoreForAmount(txAbs, b)

  // Auch Skonto-Zahlung prüfen
  if (r.skonto_prozent && r.skonto_prozent > 0) {
    const skontoAmt = Math.round(b * (1 - r.skonto_prozent / 100) * 100) / 100
    const sScore = scoreForAmount(txAbs, skontoAmt)
    if (sScore > best) best = sScore
  }

  return best
}

// Datum-Score: Zahlung kommt typischerweise NACH Rechnungsdatum
// Prüft Fälligkeit, Skontodatum und Rechnungsdatum
function dateScore(txDatum: string, r: Rechnung): number {
  const txMs = new Date(txDatum).getTime()
  let best = 0

  const check = (refDate: string | null | undefined, multiplier = 1) => {
    if (!refDate) return
    const refMs = new Date(refDate).getTime()
    const diffDays = (txMs - refMs) / 86400000 // positiv = Zahlung nach Datum

    let s = 0
    if (diffDays >= -1 && diffDays <= 2)  s = 0.28 // Zahltag ± 2 Tage
    else if (diffDays > 2 && diffDays <= 7)  s = 0.24
    else if (diffDays > 7 && diffDays <= 21) s = 0.18
    else if (diffDays > 21 && diffDays <= 45) s = 0.10
    else if (diffDays > 45 && diffDays <= 90) s = 0.05
    else if (diffDays < -1 && diffDays >= -5) s = 0.10 // leicht vor Datum möglich
    s *= multiplier
    if (s > best) best = s
  }

  check(r.skonto_datum, 1.1)  // Skontodatum ist präzisestes Signal
  check(r.faelligkeit, 1.0)
  check(r.rechnungsdatum, 0.9)

  return best
}

// Referenz-Score: Rechnungsnummer im Buchungstext ist starkes Signal
function refScore(tx: BankTransaktion, rechnungsnr: string | null | undefined): number {
  if (!rechnungsnr) return 0
  // Normalisiert: nur alphanumerisch
  const rn = rechnungsnr.toLowerCase().replace(/[^a-z0-9]/g, '')
  if (rn.length < 4) return 0

  const sources = [tx.referenz, tx.buchungstext, tx.empfaenger]
    .filter(Boolean)
    .map(s => s!.toLowerCase().replace(/[^a-z0-9]/g, ''))

  for (const src of sources) {
    if (src.includes(rn)) return 0.40  // exaktes Match → sehr starkes Signal
    // Teilmatch: mind. 6 Zeichen am Ende der Rechnungsnr.
    if (rn.length >= 6 && src.includes(rn.slice(-6))) return 0.22
    if (rn.length >= 4 && src.includes(rn.slice(-4))) return 0.10
  }
  return 0
}

export function matchTransaktion(
  tx: BankTransaktion,
  rechnungen: Rechnung[],
  lohnDienstnehmer: LohnDienstnehmer[],
): MatchCandidate[] {
  if (tx.betrag >= 0) return []
  const abs = Math.abs(tx.betrag)
  const candidates: MatchCandidate[] = []

  for (const r of rechnungen) {
    if (r.status === 'bezahlt') continue

    const aScore = amountScore(abs, r)
    if (aScore === 0) continue

    const dScore  = dateScore(tx.datum, r)
    const name    = r.lieferant?.name ?? (r.ocr_json as any)?.supplier_name ?? ''
    const nScore  = nameSim(tx.empfaenger, name) * 0.22
    const rScore  = refScore(tx, r.rechnungsnr)

    const score = Math.min(1, aScore + dScore + nScore + rScore)
    if (score >= 0.40) {
      candidates.push({
        type: 'rechnung',
        id: r.id,
        score,
        label: name || r.rechnungsnr,
        betrag: brutto(r),
        datum: r.rechnungsdatum,
      })
    }
  }

  for (const l of lohnDienstnehmer) {
    if (l.bank_transaktion_id) continue
    if (l.zahlungsart === 'barzahlung') continue

    const aScore = scoreForAmount(abs, l.betrag)
    if (aScore === 0) continue

    // Name gegen empfaenger UND buchungstext prüfen (Banken tragen Namen unterschiedlich ein)
    const nameVsEmpfaenger  = nameSim(tx.empfaenger,   l.name)
    const nameVsBuchungstext = nameSim(tx.buchungstext, l.name)
    const nScore = Math.max(nameVsEmpfaenger, nameVsBuchungstext) * 0.40

    // Bonus wenn buchungstext "Gehalt" oder "Lohn" enthält
    const lohnBonus = /gehalt|lohn|salary/i.test(tx.buchungstext ?? '') ? 0.05 : 0

    const score = Math.min(1, aScore + nScore + lohnBonus)
    if (score >= 0.40) {
      candidates.push({ type: 'lohn', id: l.id, score, label: l.name, betrag: l.betrag, datum: null })
    }
  }

  return candidates.sort((a, b) => b.score - a.score)
}

export const AUTO_MATCH_THRESHOLD = 0.72
