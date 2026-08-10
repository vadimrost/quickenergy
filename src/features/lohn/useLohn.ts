import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { pdfUrlToBase64 } from '@/lib/gemini-ocr'
import { lohnOcr } from '@/lib/lohn-ocr'
import type { Lohnabrechnung } from '@/types/database'

export function useLohnabrechnungen() {
  return useQuery<Lohnabrechnung[]>({
    queryKey: ['lohnabrechnungen'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lohnabrechnungen')
        .select('*, lohn_dienstnehmer(*), lohn_koerperschaften(*)')
        .order('jahr', { ascending: false })
        .order('monat', { ascending: false })
      if (error) throw error
      return (data ?? []) as Lohnabrechnung[]
    },
  })
}

// Liest das gespeicherte Journal erneut ein und ergänzt fehlende Dienstnehmer-/
// Körperschaften-Zeilen (füllt nur leere Abschnitte — überschreibt nichts Bezahltes).
export function useReOcrLohnabrechnung() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ abrechnung, apiKey }: { abrechnung: Lohnabrechnung; apiKey: string }) => {
      if (!abrechnung.pdf_url) throw new Error('Keine PDF hinterlegt')
      const base64 = await pdfUrlToBase64(abrechnung.pdf_url)
      const ocr = await lohnOcr(base64, apiKey)

      const hasDn  = (abrechnung.lohn_dienstnehmer ?? []).length > 0
      const hasKoe = (abrechnung.lohn_koerperschaften ?? []).length > 0

      if (!hasDn && ocr.dienstnehmer.length > 0) {
        const { error } = await supabase.from('lohn_dienstnehmer').insert(
          ocr.dienstnehmer.map(d => ({ ...d, abrechnung_id: abrechnung.id })),
        )
        if (error) throw new Error(error.message)
      }
      if (!hasKoe && ocr.koerperschaften.length > 0) {
        const { error } = await supabase.from('lohn_koerperschaften').insert(
          ocr.koerperschaften.map(k => ({ ...k, abrechnung_id: abrechnung.id })),
        )
        if (error) throw new Error(error.message)
      }

      // Summen aus den Einzelzeilen aktualisieren
      const gesamtDn  = ocr.dienstnehmer.reduce((s, d) => s + (d.betrag ?? 0), 0) || abrechnung.gesamt_dienstnehmer
      const gesamtKoe = ocr.koerperschaften.reduce((s, k) => s + (k.betrag ?? 0), 0) || abrechnung.gesamt_koerperschaften
      await supabase.from('lohnabrechnungen').update({
        gesamt_dienstnehmer:    gesamtDn,
        gesamt_koerperschaften: gesamtKoe,
        gesamt_total:           gesamtDn + gesamtKoe,
      }).eq('id', abrechnung.id)

      return ocr.dienstnehmer.length
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['lohnabrechnungen'] }),
  })
}

export function useSetDienstnehmerBezahlt() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ ids, bezahlt }: { ids: string[]; bezahlt: boolean }) => {
      const bezahlt_am = bezahlt ? new Date().toISOString().split('T')[0] : null
      const { error } = await supabase
        .from('lohn_dienstnehmer')
        .update({ bezahlt, bezahlt_am })
        .in('id', ids)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['lohnabrechnungen'] }),
  })
}

export function useDeleteLohnabrechnung() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('lohnabrechnungen').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['lohnabrechnungen'] }),
  })
}
