import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { kontoauszugOcr } from '@/lib/kontoauszug-ocr'
import { matchTransaktion, AUTO_MATCH_THRESHOLD } from '@/lib/kontoauszug-matching'
import { fileToBase64 } from '@/lib/gemini-ocr'
import type { Kontoauszug, BankTransaktion, Rechnung, LohnDienstnehmer } from '@/types/database'

// Shared auto-match logic — runs against all open transactions of a given kontoauszug
// Can be called on upload OR later (e.g. after new lohn import)
export async function runAutoMatch(
  transactions: BankTransaktion[],
  kontoIban: string | null,
): Promise<number> {
  const openTx = transactions.filter(t => t.betrag < 0 && t.status !== 'zugewiesen')
  if (openTx.length === 0) return 0

  const [{ data: rechnungen }, { data: lohnDienstnehmer }] = await Promise.all([
    supabase.from('rechnungen').select('*, lieferant:lieferanten(*)').neq('status', 'bezahlt'),
    supabase.from('lohn_dienstnehmer').select('*').is('bank_transaktion_id', null),
  ])

  let matched = 0
  const usedLohnIds = new Set<string>()

  for (const tx of openTx) {
    const candidates = matchTransaktion(
      tx,
      (rechnungen ?? []) as Rechnung[],
      ((lohnDienstnehmer ?? []) as LohnDienstnehmer[]).filter(l => !usedLohnIds.has(l.id)),
    )
    const best = candidates[0]
    if (!best || best.score < AUTO_MATCH_THRESHOLD) continue

    if (best.type === 'rechnung') {
      await supabase.from('rechnungen').update({
        status: 'bezahlt',
        bank_transaktion_id: tx.id,
        bezahlt_am: tx.datum,
        bezahlt_konto: kontoIban,
      }).eq('id', best.id)
      await supabase.from('bank_transaktionen').update({
        status: 'zugewiesen',
        rechnung_id: best.id,
        match_score: best.score,
      }).eq('id', tx.id)
    } else {
      usedLohnIds.add(best.id)
      await supabase.from('lohn_dienstnehmer').update({
        bank_transaktion_id: tx.id,
      }).eq('id', best.id)
      await supabase.from('bank_transaktionen').update({
        status: 'zugewiesen',
        lohn_id: best.id,
        match_score: best.score,
      }).eq('id', tx.id)
    }
    matched++
  }
  return matched
}

// Re-runs auto-match on ALL open transactions across all kontoauszuege
// Used after a new lohnabrechnung is imported
export async function runAutoMatchAllOpen(): Promise<number> {
  const { data: kontoauszuege } = await supabase
    .from('kontoauszuege')
    .select('id, konto_iban, bank_transaktionen!auszug_id(*)')

  let total = 0
  for (const k of kontoauszuege ?? []) {
    const n = await runAutoMatch(
      (k.bank_transaktionen ?? []) as BankTransaktion[],
      k.konto_iban,
    )
    total += n
  }
  return total
}

export function useDeleteKontoauszug() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (konto: Kontoauszug) => {
      const txAll = konto.bank_transaktionen ?? []

      // Reset rechnungen that were paid via this statement
      const rechnungIds = txAll.map(t => t.rechnung_id).filter(Boolean) as string[]
      if (rechnungIds.length > 0) {
        await supabase.from('rechnungen').update({
          status: 'gebucht',
          bank_transaktion_id: null,
          bezahlt_am: null,
          bezahlt_konto: null,
        }).in('id', rechnungIds)
      }

      // Reset lohn_dienstnehmer links
      const lohnIds = txAll.map(t => t.lohn_id).filter(Boolean) as string[]
      if (lohnIds.length > 0) {
        await supabase.from('lohn_dienstnehmer').update({
          bank_transaktion_id: null,
        }).in('id', lohnIds)
      }

      // Delete kontoauszug (cascades to bank_transaktionen)
      const { error } = await supabase.from('kontoauszuege').delete().eq('id', konto.id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['kontoauszuege'] })
      qc.invalidateQueries({ queryKey: ['rechnungen'] })
      qc.invalidateQueries({ queryKey: ['lohnabrechnungen'] })
      qc.invalidateQueries({ queryKey: ['lohn_dienstnehmer', 'offen'] })
    },
  })
}

export function useKontoauszuege() {
  return useQuery({
    queryKey: ['kontoauszuege'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('kontoauszuege')
        .select(`
          *,
          bank_transaktionen!auszug_id (
            *,
            rechnungen!rechnung_id (
              id, rechnungsnr, lieferant:lieferanten(name)
            ),
            lohn_dienstnehmer!lohn_id (
              id, name
            )
          )
        `)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as Kontoauszug[]
    },
  })
}

export function useOffeneLohnDienstnehmer() {
  return useQuery({
    queryKey: ['lohn_dienstnehmer', 'offen'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lohn_dienstnehmer')
        .select('*')
        .is('bank_transaktion_id', null)
      if (error) throw error
      return (data ?? []) as LohnDienstnehmer[]
    },
  })
}

export type UploadStep = 'uploading' | 'ocr' | 'saving' | 'matching' | 'done' | 'error'

export function useUploadKontoauszug() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({
      file,
      onStep,
    }: {
      file: File
      onStep: (step: UploadStep) => void
    }) => {
      const apiKey = import.meta.env.VITE_OPENROUTER_API_KEY as string | undefined
      if (!apiKey) throw new Error('Kein OpenRouter API Key konfiguriert')

      // Step 1: Upload to storage
      onStep('uploading')
      const storagePath = `kontoauszug_${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
      const { error: uploadError } = await supabase.storage
        .from('rechnungen')
        .upload(storagePath, file, { contentType: 'application/pdf', upsert: false })
      if (uploadError) throw new Error(`Upload fehlgeschlagen: ${uploadError.message}`)
      const { data: { publicUrl } } = supabase.storage.from('rechnungen').getPublicUrl(storagePath)

      // Step 2: OpenRouter OCR
      onStep('ocr')
      const base64 = await fileToBase64(file)
      const ocr = await kontoauszugOcr(base64, apiKey)

      if (ocr.transaktionen.length === 0) {
        throw new Error('Keine Transaktionen erkannt. Bitte prüfe ob das PDF ein lesbarer Kontoauszug ist und versuche es erneut.')
      }

      // Step 3: Save to DB
      onStep('saving')
      const { data: konto, error: kontoError } = await supabase
        .from('kontoauszuege')
        .insert({
          pdf_url: publicUrl,
          konto_iban: ocr.konto_iban,
          konto_name: ocr.konto_name,
          auszug_nr: ocr.auszug_nr,
          von_datum: ocr.von_datum,
          bis_datum: ocr.bis_datum,
          alter_kontostand: ocr.alter_kontostand,
          neuer_kontostand: ocr.neuer_kontostand,
        })
        .select()
        .single()
      if (kontoError) throw new Error(`Speichern fehlgeschlagen: ${kontoError.message}`)

      const { data: insertedTx, error: txError } = await supabase
        .from('bank_transaktionen')
        .insert(
          ocr.transaktionen.map(t => ({
            auszug_id: konto.id,
            datum: t.datum,
            betrag: t.betrag,
            buchungstext: t.buchungstext,
            empfaenger: t.empfaenger,
            referenz: t.referenz,
            typ: t.typ,
            status: 'offen',
            rechnung_id: null,
            lohn_id: null,
            match_score: null,
          }))
        )
        .select()
      if (txError) throw new Error(`Transaktionen: ${txError.message}`)

      // Step 4: Auto-match
      onStep('matching')
      const autoMatched = await runAutoMatch(
        (insertedTx ?? []) as BankTransaktion[],
        ocr.konto_iban,
      )

      onStep('done')
      return { konto, autoMatched, total: insertedTx?.length ?? 0 }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['kontoauszuege'] })
      qc.invalidateQueries({ queryKey: ['rechnungen'] })
      qc.invalidateQueries({ queryKey: ['lohnabrechnungen'] })
      qc.invalidateQueries({ queryKey: ['lohn_dienstnehmer', 'offen'] })
    },
  })
}

export function useAssignTransaktion() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({
      tx,
      type,
      targetId,
      kontoIban,
    }: {
      tx: BankTransaktion
      type: 'rechnung' | 'lohn'
      targetId: string
      kontoIban: string | null
    }) => {
      if (type === 'rechnung') {
        const { error: rErr } = await supabase.from('rechnungen').update({
          status: 'bezahlt',
          bank_transaktion_id: tx.id,
          bezahlt_am: tx.datum,
          bezahlt_konto: kontoIban,
        }).eq('id', targetId)
        if (rErr) throw rErr

        const { error: tErr } = await supabase.from('bank_transaktionen').update({
          status: 'zugewiesen',
          rechnung_id: targetId,
          lohn_id: null,
        }).eq('id', tx.id)
        if (tErr) throw tErr
      } else {
        const { error: lErr } = await supabase.from('lohn_dienstnehmer').update({
          bank_transaktion_id: tx.id,
        }).eq('id', targetId)
        if (lErr) throw lErr

        const { error: tErr } = await supabase.from('bank_transaktionen').update({
          status: 'zugewiesen',
          lohn_id: targetId,
          rechnung_id: null,
        }).eq('id', tx.id)
        if (tErr) throw tErr
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['kontoauszuege'] })
      qc.invalidateQueries({ queryKey: ['rechnungen'] })
      qc.invalidateQueries({ queryKey: ['lohnabrechnungen'] })
      qc.invalidateQueries({ queryKey: ['lohn_dienstnehmer', 'offen'] })
    },
  })
}

export function useRejectMatch() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (tx: BankTransaktion) => {
      if (tx.rechnung_id) {
        await supabase.from('rechnungen').update({
          status: 'gebucht',
          bank_transaktion_id: null,
          bezahlt_am: null,
          bezahlt_konto: null,
        }).eq('id', tx.rechnung_id)
      }
      if (tx.lohn_id) {
        await supabase.from('lohn_dienstnehmer').update({
          bank_transaktion_id: null,
        }).eq('id', tx.lohn_id)
      }

      const { error } = await supabase.from('bank_transaktionen').update({
        status: 'offen',
        rechnung_id: null,
        lohn_id: null,
        match_score: null,
      }).eq('id', tx.id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['kontoauszuege'] })
      qc.invalidateQueries({ queryKey: ['rechnungen'] })
      qc.invalidateQueries({ queryKey: ['lohnabrechnungen'] })
      qc.invalidateQueries({ queryKey: ['lohn_dienstnehmer', 'offen'] })
    },
  })
}

// Re-runs auto-match for a single kontoauszug (e.g. after new lohn was imported)
export function useRerunAutoMatch() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (konto: Kontoauszug) => {
      const txAll = (konto.bank_transaktionen ?? []) as BankTransaktion[]
      return runAutoMatch(txAll, konto.konto_iban)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['kontoauszuege'] })
      qc.invalidateQueries({ queryKey: ['rechnungen'] })
      qc.invalidateQueries({ queryKey: ['lohnabrechnungen'] })
      qc.invalidateQueries({ queryKey: ['lohn_dienstnehmer', 'offen'] })
    },
  })
}
