import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface LeadDatei {
  id: string
  lead_id: string
  name: string
  storage_path: string
  mime_type: string | null
  groesse: number | null
  erstellt_von: string | null
  created_at: string
}

const BUCKET = 'lead-dateien'
const Q = 'lead_dateien'

export function useLeadDateien(leadId: string | undefined) {
  return useQuery({
    queryKey: [Q, leadId],
    queryFn: async () => {
      if (!leadId) return []
      const { data, error } = await supabase
        .from('lead_dateien')
        .select('*')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as LeadDatei[]
    },
    enabled: !!leadId,
  })
}

export function useUploadLeadDatei(leadId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ file, erstellt_von }: { file: File; erstellt_von?: string | null }) => {
      // Ensure bucket exists (creates silently if already there)
      await supabase.storage.createBucket(BUCKET, { public: false }).catch(() => {})

      const ext = file.name.split('.').pop() ?? 'bin'
      const path = `${leadId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file)
      if (upErr) throw new Error(upErr.message)

      const { error: dbErr } = await supabase.from('lead_dateien').insert({
        lead_id: leadId,
        name: file.name,
        storage_path: path,
        mime_type: file.type || null,
        groesse: file.size,
        erstellt_von: erstellt_von ?? null,
      })
      if (dbErr) throw new Error(dbErr.message)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [Q, leadId] }),
  })
}

export function useDeleteLeadDatei(leadId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, storage_path }: { id: string; storage_path: string }) => {
      await supabase.storage.from(BUCKET).remove([storage_path])
      const { error } = await supabase.from('lead_dateien').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [Q, leadId] }),
  })
}

export function getDateiUrl(storage_path: string): string {
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(storage_path)
  return data.publicUrl
}

export function useDownloadDatei() {
  return useMutation({
    mutationFn: async ({ storage_path, name }: { storage_path: string; name: string }) => {
      const { data, error } = await supabase.storage.from(BUCKET).download(storage_path)
      if (error) throw error
      const url = URL.createObjectURL(data)
      const a = document.createElement('a')
      a.href = url
      a.download = name
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    },
  })
}
