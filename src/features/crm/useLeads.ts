import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Lead, LeadStatus } from '@/types/database'

const Q = 'leads'

export function useLeads() {
  return useQuery({
    queryKey: [Q],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('leads')
        .select('*, kunde:kunden(*)')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as Lead[]
    },
  })
}

export function useLead(id: string | undefined) {
  return useQuery({
    queryKey: [Q, id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('leads')
        .select('*, kunde:kunden(*)')
        .eq('id', id!)
        .single()
      if (error) throw error
      return data as Lead
    },
  })
}

export function useUpdateLead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...values }: Partial<Lead> & { id: string }) => {
      const { data, error } = await supabase
        .from('leads')
        .update(values)
        .eq('id', id)
        .select('*, kunde:kunden(*)')
        .single()
      if (error) throw error
      return data as Lead
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: [Q] })
      qc.setQueryData([Q, data.id], data)
    },
  })
}

export function useCreateLead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (values: Omit<Lead, 'id' | 'created_at' | 'kunde'>) => {
      const { data, error } = await supabase
        .from('leads')
        .insert(values)
        .select('*, kunde:kunden(*)')
        .single()
      if (error) throw error
      return data as Lead
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [Q] }),
  })
}

export function useDeleteLead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('leads').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [Q] }),
  })
}

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  neu:           'Neu',
  kontaktiert:   'Kontaktiert',
  termin:        'Termin',
  angebot:       'Angebot',
  auftrag:       'Auftrag',
  abgeschlossen: 'Abgeschlossen',
  verloren:      'Verloren',
}

export const LEAD_STATUS_COLORS: Record<LeadStatus, string> = {
  neu:           'bg-slate-100 text-slate-700',
  kontaktiert:   'bg-blue-50 text-blue-700',
  termin:        'bg-purple-50 text-purple-700',
  angebot:       'bg-amber-50 text-amber-700',
  auftrag:       'bg-green-50 text-green-700',
  abgeschlossen: 'bg-emerald-50 text-emerald-700',
  verloren:      'bg-red-50 text-red-600',
}

export const PIPELINE_STAGES: LeadStatus[] = [
  'neu', 'kontaktiert', 'termin', 'angebot', 'auftrag', 'abgeschlossen', 'verloren',
]
