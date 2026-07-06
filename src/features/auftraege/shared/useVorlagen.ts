import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { DokumentVorlage, DokumentTyp } from '@/types/database'
import type { PositionDraft } from './positionenUtils'

const Q = 'dokument_vorlagen'

export function useVorlagen(typ: DokumentTyp = 'angebot') {
  return useQuery({
    queryKey: [Q, typ],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('dokument_vorlagen')
        .select('*')
        .eq('typ', typ)
        .order('name')
      if (error) throw error
      return (data ?? []) as DokumentVorlage[]
    },
  })
}

export function useCreateVorlage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (vorlage: {
      name: string
      typ?: DokumentTyp
      betreff: string | null
      kopftext: string | null
      fusstext: string | null
      rabatt_gesamt_prozent: number
      positionen: PositionDraft[]
    }) => {
      const { data, error } = await supabase
        .from('dokument_vorlagen')
        .insert({ typ: 'angebot', ...vorlage })
        .select('id')
        .single()
      if (error) throw error
      return data.id as string
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [Q] }),
  })
}

export function useDeleteVorlage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('dokument_vorlagen').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [Q] }),
  })
}
