import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Ausgangsrechnung } from '@/types/database'

export function useOffeneForderungen() {
  return useQuery({
    queryKey: ['ausgangsrechnungen', 'mahnwesen'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ausgangsrechnungen')
        .select('*, kunde:kunden(*)')
        .in('status', ['offen', 'teilbezahlt'])
        .neq('typ', 'stornorechnung')
        .order('faelligkeitsdatum', { ascending: true, nullsFirst: false })
      if (error) throw error
      return (data ?? []) as Ausgangsrechnung[]
    },
  })
}

export function useAdvanceMahnstufe() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      neueStufe,
      mahngebuehr,
    }: {
      id: string
      neueStufe: 1 | 2 | 3
      mahngebuehr: number
    }) => {
      const today = new Date().toISOString().split('T')[0]
      const dateField = neueStufe === 1 ? 'gemahnt_am_1' : neueStufe === 2 ? 'gemahnt_am_2' : 'gemahnt_am_3'
      const { error } = await supabase
        .from('ausgangsrechnungen')
        .update({ mahnstufe: neueStufe, [dateField]: today, mahngebuehr })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ausgangsrechnungen'] })
    },
  })
}

export function useMarkiereAusgangsrechnungBezahlt() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, betrag }: { id: string; betrag: number }) => {
      const { error } = await supabase
        .from('ausgangsrechnungen')
        .update({
          status: 'bezahlt',
          bezahlt_am: new Date().toISOString().split('T')[0],
          bezahlt_betrag: betrag,
        })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ausgangsrechnungen'] }),
  })
}
