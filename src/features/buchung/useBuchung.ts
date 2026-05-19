import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { MOCK_RECHNUNGEN } from '@/lib/mock-data'
import { pairKey, dismissPair } from '@/lib/dismissed-duplikate'
import type { Duplikat, Rechnung } from '@/types/database'

const DEMO = import.meta.env.VITE_SUPABASE_URL === 'https://placeholder.supabase.co'

function computeDuplikate(all: Rechnung[], id: string, dismissedKeys: Set<string>): Duplikat[] {
  const current = all.find(r => r.id === id)
  if (!current) return []

  return all
    .filter(r => r.id !== id)
    .map(r => {
      let score = 0
      if (r.rechnungsnr === current.rechnungsnr) {
        score += 0.60
      } else {
        const aPrefix = current.rechnungsnr.replace(/\d+$/, '')
        const bPrefix = r.rechnungsnr.replace(/\d+$/, '')
        if (aPrefix.length > 2 && aPrefix === bPrefix) score += 0.10
      }
      if (r.betrag === current.betrag) score += 0.30
      if (r.ust_satz === current.ust_satz) score += 0.10
      return { id: `dup-${id}-${r.id}`, rechnung_a_id: id, rechnung_b_id: r.id, match_score: score }
    })
    .filter(d => d.match_score >= 0.5 && !dismissedKeys.has(pairKey(d.rechnung_a_id, d.rechnung_b_id)))
    .sort((a, b) => b.match_score - a.match_score)
    .slice(0, 3)
}

export function useDuplikate(rechnungId: string) {
  return useQuery<Duplikat[]>({
    queryKey: ['duplikate', rechnungId],
    queryFn: async () => {
      if (DEMO) {
        return computeDuplikate(MOCK_RECHNUNGEN, rechnungId, new Set())
      }
      const [rechnungenRes, dismissedRes] = await Promise.all([
        supabase.from('rechnungen').select('id, rechnungsnr, betrag, ust_satz, lieferant_id'),
        supabase.from('dismissed_duplikate').select('pair_key'),
      ])
      const dismissedKeys = new Set((dismissedRes.data ?? []).map((r: any) => r.pair_key as string))
      return computeDuplikate((rechnungenRes.data ?? []) as Rechnung[], rechnungId, dismissedKeys)
    },
    enabled: !!rechnungId,
  })
}

export function useDismissDuplikat(rechnungId: string) {
  const qc = useQueryClient()
  return async (otherId: string) => {
    await dismissPair(rechnungId, otherId)
    void qc.invalidateQueries({ queryKey: ['duplikate', rechnungId] })
  }
}
