import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Bild } from '@/types/database'

const BUCKET = 'rechnungen'

export function useBilder() {
  return useQuery<Bild[]>({
    queryKey: ['bilder'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bilder')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as Bild[]
    },
  })
}

export function useUploadBild() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (file: File) => {
      if (!file.type.startsWith('image/')) throw new Error('Nur Bilddateien erlaubt')
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const path = `bilder/${Date.now()}_${safeName}`
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { contentType: file.type, upsert: false })
      if (upErr) throw new Error(upErr.message)
      const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(path)
      const { error: insErr } = await supabase
        .from('bilder')
        .insert({ name: file.name, url: publicUrl })
      if (insErr) throw new Error(insErr.message)
      return publicUrl
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bilder'] }),
  })
}

export function useDeleteBild() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (bild: Bild) => {
      // Storage-Pfad aus der public-URL nach "/rechnungen/" ableiten
      const marker = `/${BUCKET}/`
      const idx = bild.url.indexOf(marker)
      if (idx !== -1) {
        const path = decodeURIComponent(bild.url.slice(idx + marker.length))
        await supabase.storage.from(BUCKET).remove([path])
      }
      const { error } = await supabase.from('bilder').delete().eq('id', bild.id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bilder'] }),
  })
}
