import { useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useRole } from '@/contexts/RoleContext'

export type BenachrichtigungTyp = 'neuer_lead' | 'status' | 'zuweisung' | 'termin'

export interface Benachrichtigung {
  id: string
  empfaenger: string
  typ: BenachrichtigungTyp
  titel: string
  nachricht: string | null
  lead_id: string | null
  gelesen: boolean
  created_at: string
}

export const BENACHRICHTIGUNGEN_KEY = 'benachrichtigungen'

// ─── Plain query hook (no side effects) ──────────────────────────────────────

export function useBenachrichtigungen() {
  const { isAdmin, setterName, isSetter } = useRole()

  return useQuery({
    queryKey: [BENACHRICHTIGUNGEN_KEY],
    queryFn: async () => {
      let q = supabase
        .from('benachrichtigungen')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50)

      if (isAdmin) {
        q = q.eq('empfaenger', 'admin')
      } else if (isSetter && setterName) {
        q = q.eq('empfaenger', setterName)
      } else {
        return [] as Benachrichtigung[]
      }

      const { data, error } = await q
      if (error) throw error
      return data as Benachrichtigung[]
    },
    enabled: isAdmin || (isSetter && !!setterName),
    staleTime: 1000 * 30,
  })
}

export function useUnreadCount() {
  const { data = [] } = useBenachrichtigungen()
  return data.filter(b => !b.gelesen).length
}

// ─── Realtime subscription — call ONCE per app (in BenachrichtigungenPanel) ─

export function useBenachrichtigungenRealtime() {
  const qc = useQueryClient()

  useEffect(() => {
    const channel = supabase
      .channel('bnfg_' + Date.now())
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'benachrichtigungen' },
        () => { qc.invalidateQueries({ queryKey: [BENACHRICHTIGUNGEN_KEY] }) },
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [qc])
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export function useMarkAsRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase
        .from('benachrichtigungen')
        .update({ gelesen: true })
        .in('id', ids)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [BENACHRICHTIGUNGEN_KEY] }),
  })
}

export function useCreateBenachrichtigung() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (vars: {
      empfaenger: string
      typ: BenachrichtigungTyp
      titel: string
      nachricht?: string | null
      lead_id?: string | null
    }) => {
      const { error } = await supabase.from('benachrichtigungen').insert(vars)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [BENACHRICHTIGUNGEN_KEY] }),
  })
}
