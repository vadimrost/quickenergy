import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import type { ExportLog, ExportZiel } from '@/types/database'

const WEBHOOK_URL = import.meta.env.VITE_N8N_WEBHOOK_URL as string | undefined

export function useExportLog() {
  return useQuery<ExportLog[]>({
    queryKey: ['export_log'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('export_log')
        .select('*')
        .order('exported_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as ExportLog[]
    },
  })
}

export function useTriggerExport() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ rechnungIds, ziel }: { rechnungIds: string[]; ziel: ExportZiel }) => {
      if (!WEBHOOK_URL) {
        toast.info('Kein Webhook konfiguriert.')
        return
      }
      const res = await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rechnung_ids: rechnungIds, ziel }),
      })
      if (!res.ok) throw new Error(`Webhook-Fehler: ${res.status}`)
    },
    onSuccess: (_data, variables) => {
      toast.success(`${variables.ziel === 'lexoffice' ? 'Lexoffice' : 'DATEV'}-Export gestartet`)
      void qc.invalidateQueries({ queryKey: ['export_log'] })
    },
    onError: (err: Error) => {
      toast.error(`Export fehlgeschlagen: ${err.message}`)
    },
  })
}
