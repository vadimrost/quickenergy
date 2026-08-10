import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Artikel } from '@/types/database'

export type ArtikelInput = {
  bezeichnung: string
  gruppe: string | null
  einheit: string
  vk_netto: number
  ek_netto: number | null
  bestand: number | null
}

export function useArtikel() {
  return useQuery<Artikel[]>({
    queryKey: ['artikel'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('artikel')
        .select('*')
        .order('nummer', { ascending: true })
      if (error) throw error
      return (data ?? []) as Artikel[]
    },
    staleTime: 5 * 60 * 1000,
  })
}

export function useCreateArtikel() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: ArtikelInput) => {
      const { error } = await supabase.from('artikel').insert(input)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['artikel'] }),
  })
}

export function useCreateArtikelBulk() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (items: ArtikelInput[]) => {
      if (items.length === 0) return
      const { error } = await supabase.from('artikel').insert(items)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['artikel'] }),
  })
}

export function useUpdateArtikel() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Artikel> }) => {
      const { error } = await supabase.from('artikel').update(updates).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['artikel'] }),
  })
}

export function useDeleteArtikel() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('artikel').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['artikel'] }),
  })
}
