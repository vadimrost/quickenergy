import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { FirmaStammdaten } from '@/types/database'

export function useFirmaStammdaten() {
  return useQuery({
    queryKey: ['firma_einstellungen'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('firma_einstellungen')
        .select('*')
        .limit(1)
        .maybeSingle()
      if (error) return null
      return data as FirmaStammdaten | null
    },
    staleTime: 1000 * 60 * 10,
  })
}

export function useUpsertFirma() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (values: Omit<FirmaStammdaten, 'id' | 'updated_at'> & { id?: string }) => {
      if (values.id) {
        const { error } = await supabase
          .from('firma_einstellungen')
          .update({ ...values, updated_at: new Date().toISOString() })
          .eq('id', values.id)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('firma_einstellungen')
          .insert(values)
        if (error) throw error
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['firma_einstellungen'] }),
  })
}
