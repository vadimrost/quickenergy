import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { MOCK_RECHNUNGEN } from '@/lib/mock-data'
import { generateInvoicePdf } from '@/lib/invoice-pdf-generator'
import type { Rechnung, RechnungStatus } from '@/types/database'

const DEMO = import.meta.env.VITE_SUPABASE_URL === 'https://placeholder.supabase.co'

// Replace 'demo' sentinel with a lazily generated PDF data URI
function withPdf(r: Rechnung): Rechnung {
  if (r.pdf_url !== 'demo') return r
  return { ...r, pdf_url: generateInvoicePdf(r) }
}

export function useRechnungen(statusFilter?: RechnungStatus | 'alle') {
  return useQuery<Rechnung[]>({
    queryKey: ['rechnungen', statusFilter],
    queryFn: async () => {
      if (DEMO) {
        const data = statusFilter && statusFilter !== 'alle'
          ? MOCK_RECHNUNGEN.filter(r => r.status === statusFilter)
          : MOCK_RECHNUNGEN
        return data
      }
      let query = supabase
        .from('rechnungen')
        .select('*, lieferant:lieferanten(*)')
        .order('created_at', { ascending: false })

      if (statusFilter && statusFilter !== 'alle') {
        query = query.eq('status', statusFilter)
      }
      const { data, error } = await query
      if (error || !data?.length) return MOCK_RECHNUNGEN
      return data as Rechnung[]
    },
  })
}

export function useRechnung(id: string) {
  return useQuery<Rechnung>({
    queryKey: ['rechnung', id],
    queryFn: async () => {
      if (DEMO) {
        const r = MOCK_RECHNUNGEN.find(r => r.id === id) ?? MOCK_RECHNUNGEN[0]
        return withPdf(r)
      }
      const { data, error } = await supabase
        .from('rechnungen')
        .select('*, lieferant:lieferanten(*)')
        .eq('id', id)
        .single()
      if (error || !data) return MOCK_RECHNUNGEN[0]
      return data as Rechnung
    },
    enabled: !!id,
  })
}

export function useUpdateRechnung() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Rechnung> }) => {
      if (DEMO) return
      const { error } = await supabase.from('rechnungen').update(updates).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['rechnungen'] })
    },
  })
}
