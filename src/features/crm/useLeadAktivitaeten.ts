import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export type AktivitaetTyp = 'erstellt' | 'status' | 'notiz' | 'termin' | 'zuweisung' | 'deal' | 'kommentar'

export interface Aktivitaet {
  id: string
  lead_id: string
  typ: AktivitaetTyp
  inhalt: string | null
  meta: Record<string, string> | null
  erstellt_von: string | null
  created_at: string
}

const Q = (id: string) => ['lead_aktivitaeten', id]

export function useLeadAktivitaeten(leadId: string | undefined) {
  return useQuery({
    queryKey: Q(leadId ?? ''),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lead_aktivitaeten')
        .select('*')
        .eq('lead_id', leadId!)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as Aktivitaet[]
    },
    enabled: !!leadId,
  })
}

export function useAddAktivitaet() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (vars: {
      lead_id: string
      typ: AktivitaetTyp
      inhalt?: string | null
      meta?: Record<string, string> | null
      erstellt_von?: string | null
    }) => {
      const { error } = await supabase.from('lead_aktivitaeten').insert(vars)
      if (error) throw error
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: Q(vars.lead_id) })
    },
  })
}
