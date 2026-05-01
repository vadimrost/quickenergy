import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Rechnung, RechnungStatus } from '@/types/database'

export function useRechnungen(statusFilter?: RechnungStatus | 'alle') {
  return useQuery<Rechnung[]>({
    queryKey: ['rechnungen', statusFilter],
    queryFn: async () => {
      let query = supabase
        .from('rechnungen')
        .select('*, lieferant:lieferanten(*)')
        .order('created_at', { ascending: false })

      if (statusFilter && statusFilter !== 'alle') {
        query = query.eq('status', statusFilter)
      }
      const { data, error } = await query
      if (error) throw error
      return (data ?? []) as Rechnung[]
    },
  })
}

export function useRechnung(id: string) {
  return useQuery<Rechnung>({
    queryKey: ['rechnung', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rechnungen')
        .select('*, lieferant:lieferanten(*)')
        .eq('id', id)
        .single()
      if (error) throw error
      return data as Rechnung
    },
    enabled: !!id,
  })
}

export function useUpdateRechnung() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Rechnung> }) => {
      const { error } = await supabase.from('rechnungen').update(updates).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['rechnungen'] })
    },
  })
}
