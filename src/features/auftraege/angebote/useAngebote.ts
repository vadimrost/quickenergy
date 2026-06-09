import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Angebot, AngebotStatus } from '@/types/database'
import type { PositionDraft } from '@/features/auftraege/shared/positionenUtils'

const Q = 'angebote'

export function useAngebote() {
  return useQuery({
    queryKey: [Q],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('angebote')
        .select('*, kunde:kunden(*)')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as Angebot[]
    },
  })
}

export function useAngebot(id: string | undefined) {
  return useQuery({
    queryKey: [Q, id],
    enabled: !!id,
    queryFn: async () => {
      const [{ data, error }, { data: pos, error: posErr }] = await Promise.all([
        supabase.from('angebote').select('*, kunde:kunden(*)').eq('id', id!).single(),
        supabase.from('dokument_positionen').select('*').eq('dokument_id', id!).eq('dokument_typ', 'angebot').order('reihenfolge'),
      ])
      if (error) throw error
      if (posErr) throw posErr
      return { ...data, positionen: pos ?? [] } as Angebot
    },
  })
}

export function useUpsertAngebot() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      angebot,
      positionen,
    }: {
      angebot: Partial<Angebot> & { id?: string }
      positionen: PositionDraft[]
    }) => {
      let id = angebot.id
      const { positionen: _p, kunde: _k, ...fields } = angebot as Angebot & { positionen?: unknown; kunde?: unknown }

      if (id) {
        const { error } = await supabase.from('angebote').update(fields).eq('id', id)
        if (error) throw error
      } else {
        const { data, error } = await supabase.from('angebote').insert(fields).select('id').single()
        if (error) throw error
        id = data.id
      }

      // Replace all positions
      await supabase.from('dokument_positionen').delete().eq('dokument_id', id).eq('dokument_typ', 'angebot')
      if (positionen.length > 0) {
        const { error } = await supabase.from('dokument_positionen').insert(
          positionen.map((p, i) => ({ ...p, dokument_id: id, dokument_typ: 'angebot', reihenfolge: i }))
        )
        if (error) throw error
      }
      return id
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [Q] }),
  })
}

export function useUpdateAngebotStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, status, auftragsbestaetigung_id }: {
      id: string
      status: AngebotStatus
      auftragsbestaetigung_id?: string
    }) => {
      const fields: Partial<Angebot> = { status }
      if (auftragsbestaetigung_id !== undefined) fields.auftragsbestaetigung_id = auftragsbestaetigung_id
      const { error } = await supabase.from('angebote').update(fields).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [Q] }),
  })
}

export function useDeleteAngebot() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      await supabase.from('dokument_positionen').delete().eq('dokument_id', id).eq('dokument_typ', 'angebot')
      const { error } = await supabase.from('angebote').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [Q] }),
  })
}
