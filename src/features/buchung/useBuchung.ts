import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { MOCK_RECHNUNGEN } from '@/lib/mock-data'
import type { Duplikat, Rechnung } from '@/types/database'

const DEMO = import.meta.env.VITE_SUPABASE_URL === 'https://placeholder.supabase.co'

function computeDuplikate(all: Rechnung[], id: string): Duplikat[] {
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
    .filter(d => d.match_score >= 0.5)
    .sort((a, b) => b.match_score - a.match_score)
    .slice(0, 3)
}

export function useDuplikate(rechnungId: string) {
  return useQuery<Duplikat[]>({
    queryKey: ['duplikate', rechnungId],
    queryFn: async () => {
      if (DEMO) {
        return computeDuplikate(MOCK_RECHNUNGEN, rechnungId)
      }
      const { data, error } = await supabase
        .from('rechnungen')
        .select('id, rechnungsnr, betrag, ust_satz, lieferant_id')
      if (error || !data) return []
      return computeDuplikate(data as Rechnung[], rechnungId)
    },
    enabled: !!rechnungId,
  })
}
