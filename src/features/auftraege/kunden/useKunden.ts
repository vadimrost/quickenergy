import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Kunde } from '@/types/database'

const Q = 'kunden'

export function useKunden() {
  return useQuery({
    queryKey: [Q],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('kunden')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as Kunde[]
    },
  })
}

export function useKunde(id: string | undefined) {
  return useQuery({
    queryKey: [Q, id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('kunden')
        .select('*')
        .eq('id', id!)
        .single()
      if (error) throw error
      return data as Kunde
    },
  })
}

export function useUpsertKunde() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (values: Partial<Kunde> & { id?: string }) => {
      if (values.id) {
        const { id, ...rest } = values
        const { data, error } = await supabase.from('kunden').update(rest).eq('id', id).select().single()
        if (error) throw error
        return data as Kunde
      }
      const { id: _id, ...rest } = values
      const { data, error } = await supabase.from('kunden').insert(rest).select().single()
      if (error) throw error
      return data as Kunde
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [Q] }),
  })
}

export function useDeleteKunde() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('kunden').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [Q] }),
  })
}
