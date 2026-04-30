import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { MOCK_LIEFERANTEN } from '@/lib/mock-data'
import type { Lieferant } from '@/types/database'

const DEMO = import.meta.env.VITE_SUPABASE_URL === 'https://placeholder.supabase.co'

export function useLieferanten() {
  return useQuery<Lieferant[]>({
    queryKey: ['lieferanten'],
    queryFn: async () => {
      if (DEMO) return MOCK_LIEFERANTEN
      const { data, error } = await supabase
        .from('lieferanten')
        .select('*')
        .order('name')
      if (error || !data?.length) return MOCK_LIEFERANTEN
      return data as Lieferant[]
    },
  })
}

export function useUpdateLieferant() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Lieferant> }) => {
      if (DEMO) return
      const { error } = await supabase.from('lieferanten').update(updates).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['lieferanten'] })
    },
  })
}
