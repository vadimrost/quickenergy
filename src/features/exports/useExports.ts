import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import type { ExportLog, ExportZiel } from '@/types/database'

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
      await triggerSevdesk(rechnungIds)
      await Promise.all([
        supabase.from('export_log').insert({
          rechnung_ids_json: rechnungIds,
          ziel,
          exported_at: new Date().toISOString(),
          success: true,
        }),
        supabase.from('rechnungen').update({ status: 'gebucht' }).in('id', rechnungIds),
      ])
    },
    onSuccess: () => {
      toast.success('sevDesk-Export erfolgreich')
      void qc.invalidateQueries({ queryKey: ['export_log'] })
      void qc.invalidateQueries({ queryKey: ['rechnungen'] })
    },
    onError: (err: Error) => {
      toast.error(`Export fehlgeschlagen: ${err.message}`)
    },
  })
}
