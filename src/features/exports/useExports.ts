import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import type { ExportLog, ExportZiel } from '@/types/database'

const DATEV_WEBHOOK_URL = import.meta.env.VITE_N8N_DATEV_WEBHOOK_URL as string | undefined

async function triggerSevdesk(rechnungIds: string[]): Promise<void> {
  const { data, error } = await supabase.functions.invoke('sevdesk-export', {
    body: { rechnung_ids: rechnungIds },
  })
  if (error) throw new Error(error.message)
  const failed = (data?.results ?? []).filter((r: any) => r.error)
  if (failed.length > 0) {
    throw new Error(failed.map((r: any) => `${r.id}: ${r.error}`).join(', '))
  }
}

async function triggerDatev(rechnungIds: string[]): Promise<void> {
  if (!DATEV_WEBHOOK_URL) {
    toast.info('Kein DATEV-Webhook konfiguriert.')
    return
  }
  const res = await fetch(DATEV_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rechnung_ids: rechnungIds, ziel: 'datev' }),
  })
  if (!res.ok) throw new Error(`Webhook-Fehler: ${res.status}`)
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
      if (ziel === 'lexoffice') {
        await triggerSevdesk(rechnungIds)
      } else {
        await triggerDatev(rechnungIds)
      }
    },
    onSuccess: (_data, variables) => {
      const label = variables.ziel === 'lexoffice' ? 'sevDesk' : 'DATEV'
      toast.success(`${label}-Export erfolgreich`)
      void qc.invalidateQueries({ queryKey: ['export_log'] })
      void qc.invalidateQueries({ queryKey: ['rechnungen'] })
    },
    onError: (err: Error) => {
      toast.error(`Export fehlgeschlagen: ${err.message}`)
    },
  })
}
