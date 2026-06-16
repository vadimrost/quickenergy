import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Angebot, Auftragsbestaetigung, AuftragsbestaetigungStatus } from '@/types/database'
import type { PositionDraft } from '@/features/auftraege/shared/positionenUtils'

const Q = 'auftragsbestatigungen'

export function useAuftragsbestatigungen() {
  return useQuery({
    queryKey: [Q],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('auftragsbestatigungen')
        .select('*, kunde:kunden(*)')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as Auftragsbestaetigung[]
    },
  })
}

export function useAuftragsbestaetigung(id: string | undefined) {
  return useQuery({
    queryKey: [Q, id],
    enabled: !!id,
    queryFn: async () => {
      const [{ data, error }, { data: pos, error: posErr }] = await Promise.all([
        supabase.from('auftragsbestatigungen').select('*, kunde:kunden(*)').eq('id', id!).single(),
        supabase.from('dokument_positionen').select('*').eq('dokument_id', id!).eq('dokument_typ', 'auftragsbestaetigung').order('reihenfolge'),
      ])
      if (error) throw error
      if (posErr) throw posErr
      return { ...data, positionen: pos ?? [] } as Auftragsbestaetigung
    },
  })
}

export function useUpsertAuftragsbestaetigung() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      ab,
      positionen,
    }: {
      ab: Partial<Auftragsbestaetigung> & { id?: string }
      positionen: PositionDraft[]
    }) => {
      let id = ab.id
      const { positionen: _p, kunde: _k, ...fields } = ab as Auftragsbestaetigung & { positionen?: unknown; kunde?: unknown }

      if (id) {
        const { error } = await supabase.from('auftragsbestatigungen').update(fields).eq('id', id)
        if (error) throw error
      } else {
        const { data, error } = await supabase.from('auftragsbestatigungen').insert(fields).select('id').single()
        if (error) throw error
        id = data.id
      }

      await supabase.from('dokument_positionen').delete().eq('dokument_id', id).eq('dokument_typ', 'auftragsbestaetigung')
      if (positionen.length > 0) {
        const { error } = await supabase.from('dokument_positionen').insert(
          positionen.map((p, i) => {
            const { id: _id, created_at: _ca, ...rest } = p as any
            return { ...rest, dokument_id: id, dokument_typ: 'auftragsbestaetigung', reihenfolge: i }
          })
        )
        if (error) throw error
      }
      return id
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [Q] }),
  })
}

export function useUpdateAuftragsbestaetigungStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: AuftragsbestaetigungStatus }) => {
      const { error } = await supabase.from('auftragsbestatigungen').update({ status }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [Q] }),
  })
}

export function useConvertAngebotToAb() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (angebot: Angebot) => {
      const { data: ab, error } = await supabase
        .from('auftragsbestatigungen')
        .insert({
          kunde_id: angebot.kunde_id,
          angebot_id: angebot.id,
          betreff: angebot.betreff,
          ab_datum: new Date().toISOString().split('T')[0],
          zahlungsziel_tage: 14,
          kopftext: angebot.kopftext,
          fusstext: angebot.fusstext,
          rabatt_gesamt_prozent: angebot.rabatt_gesamt_prozent,
          summe_netto_20: angebot.summe_netto_20,
          summe_netto_10: angebot.summe_netto_10,
          summe_netto_0: angebot.summe_netto_0,
          ust_20: angebot.ust_20,
          ust_10: angebot.ust_10,
          summe_brutto: angebot.summe_brutto,
          status: 'erhalten',
        })
        .select('id')
        .single()
      if (error) throw error

      const positionen = angebot.positionen ?? []
      if (positionen.length > 0) {
        const { error: posErr } = await supabase.from('dokument_positionen').insert(
          positionen.map(p => ({
            dokument_id: ab.id,
            dokument_typ: 'auftragsbestaetigung' as const,
            reihenfolge: p.reihenfolge,
            bezeichnung: p.bezeichnung,
            beschreibung: p.beschreibung,
            menge: p.menge,
            einheit: p.einheit,
            einzelpreis_netto: p.einzelpreis_netto,
            ust_satz: p.ust_satz,
            rabatt_prozent: p.rabatt_prozent,
            zeilenbetrag_netto: p.zeilenbetrag_netto,
          }))
        )
        if (posErr) throw posErr
      }

      const { error: aErr } = await supabase
        .from('angebote')
        .update({ auftragsbestaetigung_id: ab.id, status: 'berechnet' })
        .eq('id', angebot.id)
      if (aErr) throw aErr

      return ab.id
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [Q] })
      qc.invalidateQueries({ queryKey: ['angebote'] })
    },
  })
}

export function useDeleteAuftragsbestaetigung() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      await supabase.from('dokument_positionen').delete().eq('dokument_id', id).eq('dokument_typ', 'auftragsbestaetigung')
      const { error } = await supabase.from('auftragsbestatigungen').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [Q] }),
  })
}
