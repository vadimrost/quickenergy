import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Lieferschein, Angebot, DokumentPosition } from '@/types/database'

const Q = 'lieferscheine'

export function useLieferscheine() {
  return useQuery<Lieferschein[]>({
    queryKey: [Q],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lieferscheine')
        .select('*, kunde:kunden(*)')
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as Lieferschein[]
    },
  })
}

export function useLieferschein(id: string | undefined) {
  return useQuery<Lieferschein | null>({
    queryKey: [Q, id],
    enabled: !!id,
    queryFn: async () => {
      const [{ data: ls, error }, { data: pos }] = await Promise.all([
        supabase.from('lieferscheine').select('*, kunde:kunden(*)').eq('id', id!).single(),
        supabase.from('dokument_positionen').select('*')
          .eq('dokument_id', id!).eq('dokument_typ', 'lieferschein').order('reihenfolge'),
      ])
      if (error) throw error
      return { ...(ls as Lieferschein), positionen: (pos ?? []) as DokumentPosition[] }
    },
  })
}

/** Lieferschein aus einem Angebot erzeugen — Positionen werden ohne Preise übernommen */
export function useCreateLieferscheinAusAngebot() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (angebot: Angebot) => {
      const kunde = angebot.kunde
      const lieferadresse = kunde
        ? [
            kunde.firmenname || [kunde.vorname, kunde.nachname].filter(Boolean).join(' '),
            kunde.adresse,
            [kunde.plz, kunde.ort].filter(Boolean).join(' '),
          ].filter(Boolean).join('\n')
        : null

      const { data: ls, error } = await supabase
        .from('lieferscheine')
        .insert({
          kunde_id:      angebot.kunde_id,
          angebot_id:    angebot.id,
          ab_id:         null,
          betreff:       angebot.betreff,
          lieferdatum:   new Date().toISOString().split('T')[0],
          lieferadresse,
          status:        'entwurf',
        })
        .select('id')
        .single()
      if (error) throw error

      const positionen = angebot.positionen ?? []
      if (positionen.length > 0) {
        const { error: posErr } = await supabase.from('dokument_positionen').insert(
          positionen.map((p, i) => ({
            dokument_id:        ls.id,
            dokument_typ:       'lieferschein' as const,
            reihenfolge:        i,
            bezeichnung:        p.bezeichnung,
            beschreibung:       p.beschreibung,
            menge:              p.menge,
            einheit:            p.einheit,
            // Preise bewusst auf 0: der Lieferschein weist nur Mengen aus
            einzelpreis_netto:  0,
            ust_satz:           0 as const,
            rabatt_prozent:     0,
            zeilenbetrag_netto: 0,
            bild_url:           p.bild_url,
            ek_netto:           null,
          })),
        )
        if (posErr) throw posErr
      }
      return ls.id as string
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [Q] }),
  })
}

export function useUpdateLieferschein() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Lieferschein> }) => {
      const { error } = await supabase.from('lieferscheine').update(updates).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [Q] }),
  })
}

export function useDeleteLieferschein() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      await supabase.from('dokument_positionen').delete()
        .eq('dokument_id', id).eq('dokument_typ', 'lieferschein')
      const { error } = await supabase.from('lieferscheine').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [Q] }),
  })
}
