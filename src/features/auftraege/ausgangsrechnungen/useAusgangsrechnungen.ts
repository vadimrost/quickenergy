import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Ausgangsrechnung } from '@/types/database'
import type { PositionDraft } from '@/features/auftraege/shared/positionenUtils'

const Q = 'ausgangsrechnungen'

export function useAusgangsrechnungen() {
  return useQuery({
    queryKey: [Q],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ausgangsrechnungen')
        .select('*, kunde:kunden(*), storno_zu_rechnung:ausgangsrechnungen!storno_zu_rechnung_id(id, rechnungsnummer)')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as Ausgangsrechnung[]
    },
  })
}

export function useAusgangsrechnung(id: string | undefined) {
  return useQuery({
    queryKey: [Q, id],
    enabled: !!id,
    queryFn: async () => {
      const [{ data, error }, { data: pos, error: posErr }] = await Promise.all([
        supabase.from('ausgangsrechnungen').select('*, kunde:kunden(*), storno_zu_rechnung:ausgangsrechnungen!storno_zu_rechnung_id(id, rechnungsnummer)').eq('id', id!).single(),
        supabase.from('dokument_positionen').select('*').eq('dokument_id', id!).eq('dokument_typ', 'rechnung').order('reihenfolge'),
      ])
      if (error) throw error
      if (posErr) throw posErr
      return { ...data, positionen: pos ?? [] } as Ausgangsrechnung
    },
  })
}

export function useUpsertAusgangsrechnung() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      rechnung,
      positionen,
    }: {
      rechnung: Partial<Ausgangsrechnung> & { id?: string }
      positionen: PositionDraft[]
    }) => {
      let id = rechnung.id
      const { positionen: _p, kunde: _k, storno_zu_rechnung: _s, ...fields } = rechnung as Ausgangsrechnung & {
        positionen?: unknown; kunde?: unknown; storno_zu_rechnung?: unknown
      }

      // For inserts: create the rechnung first to get the id
      if (!id) {
        const { data, error } = await supabase.from('ausgangsrechnungen').insert(fields).select('id').single()
        if (error) throw error
        id = data.id
      }

      // Positions first — if this fails, rechnung header stays unchanged
      await supabase.from('dokument_positionen').delete().eq('dokument_id', id).eq('dokument_typ', 'rechnung')
      if (positionen.length > 0) {
        const { error } = await supabase.from('dokument_positionen').insert(
          positionen.map((p, i) => ({ ...p, dokument_id: id, dokument_typ: 'rechnung', reihenfolge: i }))
        )
        if (error) throw error
      }

      // Header update last — only runs if positions succeeded
      if (rechnung.id) {
        const { error } = await supabase.from('ausgangsrechnungen').update(fields).eq('id', id)
        if (error) throw error
      }

      return id
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [Q] }),
  })
}

export function useDeleteAusgangsrechnung() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      await supabase.from('dokument_positionen').delete().eq('dokument_id', id).eq('dokument_typ', 'rechnung')
      const { error } = await supabase.from('ausgangsrechnungen').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [Q] }),
  })
}

export function useBezahltMarkieren() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, bezahlt_am, bezahlt_betrag }: {
      id: string; bezahlt_am: string; bezahlt_betrag: number
    }) => {
      const { error } = await supabase
        .from('ausgangsrechnungen')
        .update({ status: 'bezahlt', bezahlt_am, bezahlt_betrag })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [Q] }),
  })
}

export function useUpdateAusgangsrechnungStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: Ausgangsrechnung['status'] }) => {
      const { error } = await supabase.from('ausgangsrechnungen').update({ status }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [Q] }),
  })
}
