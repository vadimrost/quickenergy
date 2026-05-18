import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Mitarbeiter } from '@/types/database'

export function useMitarbeiterAll() {
  return useQuery<Mitarbeiter[]>({
    queryKey: ['mitarbeiter-all'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('mitarbeiter')
        .select('*')
        .order('name')
      if (error) throw error
      return (data ?? []) as Mitarbeiter[]
    },
  })
}

export function useCreateMitarbeiter() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ name, email }: { name: string; email: string | null }) => {
      const { error } = await supabase
        .from('mitarbeiter')
        .insert({ name, email: email || null, aktiv: true })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mitarbeiter-all'] })
      qc.invalidateQueries({ queryKey: ['mitarbeiter'] })
    },
  })
}

export function useDeleteMitarbeiter() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('mitarbeiter').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mitarbeiter-all'] })
      qc.invalidateQueries({ queryKey: ['mitarbeiter'] })
    },
  })
}
