import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Kategorie } from '@/types/database'

export function useKategorien() {
  return useQuery<Kategorie[]>({
    queryKey: ['kategorien'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('kategorien')
        .select('*')
        .eq('aktiv', true)
        .order('reihenfolge')
      if (error) throw error
      return (data ?? []) as Kategorie[]
    },
    staleTime: 5 * 60 * 1000,
  })
}

export function useCreateKategorie() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { wert: string; name: string; beschreibung: string }) => {
      const { data: max } = await supabase
        .from('kategorien')
        .select('reihenfolge')
        .order('reihenfolge', { ascending: false })
        .limit(1)
        .single()
      const reihenfolge = ((max as any)?.reihenfolge ?? 0) + 1
      const { error } = await supabase.from('kategorien').insert({ ...input, aktiv: true, reihenfolge })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['kategorien'] }),
  })
}

export function useUpdateKategorie() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Kategorie> }) => {
      const { error } = await supabase.from('kategorien').update(updates).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['kategorien'] }),
  })
}

export function useDeleteKategorie() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('kategorien').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['kategorien'] }),
  })
}
