import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Lohnabrechnung } from '@/types/database'

export function useLohnabrechnungen() {
  return useQuery<Lohnabrechnung[]>({
    queryKey: ['lohnabrechnungen'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lohnabrechnungen')
        .select('*, lohn_dienstnehmer(*), lohn_koerperschaften(*)')
        .order('jahr', { ascending: false })
        .order('monat', { ascending: false })
      if (error) throw error
      return (data ?? []) as Lohnabrechnung[]
    },
  })
}

export function useSetDienstnehmerBezahlt() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ ids, bezahlt }: { ids: string[]; bezahlt: boolean }) => {
      const bezahlt_am = bezahlt ? new Date().toISOString().split('T')[0] : null
      const { error } = await supabase
        .from('lohn_dienstnehmer')
        .update({ bezahlt, bezahlt_am })
        .in('id', ids)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['lohnabrechnungen'] }),
  })
}

export function useDeleteLohnabrechnung() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('lohnabrechnungen').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['lohnabrechnungen'] }),
  })
}
