import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import type { ExportLog, ExportZiel } from '@/types/database'

const SEVDESK_WEBHOOK_URL = import.meta.env.VITE_N8N_SEVDESK_WEBHOOK_URL as string | undefined
const DATEV_WEBHOOK_URL = import.meta.env.VITE_N8N_DATEV_WEBHOOK_URL as string | undefined

function getWebhookUrl(ziel: ExportZiel): string | undefined {
  return ziel === 'lexoffice' ? SEVDESK_WEBHOOK_URL : DATEV_WEBHOOK_URL
}

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
      const url = getWebhookUrl(ziel)
      if (!url) {
        toast.info(`Kein ${ziel === 'lexoffice' ? 'sevDesk' : 'DATEV'}-Webhook konfiguriert.`)
        return
      }
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rechnung_ids: rechnungIds, ziel }),
      })
      if (!res.ok) throw new Error(`Webhook-Fehler: ${res.status}`)
    },
    onSuccess: (_data, variables) => {
      toast.success(`${variables.ziel === 'lexoffice' ? 'sevDesk' : 'DATEV'}-Export gestartet`)
      void qc.invalidateQueries({ queryKey: ['export_log'] })
      void qc.invalidateQueries({ queryKey: ['rechnungen'] })
    },
    onError: (err: Error) => {
      toast.error(`Export fehlgeschlagen: ${err.message}`)
    },
  })
}
