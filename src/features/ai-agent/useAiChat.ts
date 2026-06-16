import { useState } from 'react'
import { supabase } from '@/lib/supabase'

export interface ChartData {
  type: 'bar' | 'horizontal-bar'
  title: string
  data: Array<{ label: string; value: number }>
}

export interface EntityRef {
  type: 'kunde' | 'angebot' | 'rechnung' | 'eingangsrechnung' | 'auftragsbestaetigung' | 'lieferant' | 'mitarbeiter' | 'pdf'
  id: string   // UUID for entities, direct URL for type='pdf'
  label: string
  sublabel?: string
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  chart?: ChartData
  entities?: EntityRef[]
}

export function useAiChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(false)
  const [angebotLink, setAngebotLink] = useState<{ id: string; nr: string } | null>(null)

  async function sendMessage(text: string, currentMessages?: ChatMessage[]) {
    const base = currentMessages ?? messages
    if (!text.trim() || loading) return

    const userMsg: ChatMessage = { role: 'user', content: text }
    const next = [...base, userMsg]
    setMessages(next)
    setLoading(true)
    setAngebotLink(null)

    try {
      const { data, error } = await supabase.functions.invoke('ai-agent', {
        body: { messages: next.map(m => ({ role: m.role, content: m.content })) },
      })
      if (error) throw error

      const reply: string = data?.reply ?? 'Keine Antwort erhalten.'
      const chart: ChartData | undefined = data?.chart ?? undefined
      const rawEntities: EntityRef[] | undefined = data?.entities ?? undefined
      // Only show chips for entities the assistant actually mentioned in its reply
      const mentioned = rawEntities?.filter(e => reply.includes(e.label))
      const entities: EntityRef[] | undefined = (mentioned?.length ? mentioned : rawEntities?.slice(0, 5)) ?? undefined

      const idMatch = reply.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)
      const nrMatch = reply.match(/\b(AN-\d+)\b/)
      if (idMatch && nrMatch) setAngebotLink({ id: idMatch[0], nr: nrMatch[0] })

      setMessages([...next, { role: 'assistant', content: reply, chart, entities }])
    } catch (err: any) {
      setMessages([...next, { role: 'assistant', content: `Fehler: ${err?.message ?? String(err)}` }])
    } finally {
      setLoading(false)
    }
  }

  return { messages, loading, angebotLink, sendMessage }
}
