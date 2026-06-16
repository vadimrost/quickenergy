import { useState } from 'react'
import { supabase } from '@/lib/supabase'

export interface ChartData {
  type: 'bar' | 'horizontal-bar'
  title: string
  data: Array<{ label: string; value: number }>
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  chart?: ChartData
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

      const idMatch = reply.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)
      const nrMatch = reply.match(/\b(AN-\d+)\b/)
      if (idMatch && nrMatch) setAngebotLink({ id: idMatch[0], nr: nrMatch[0] })

      const final = [...next, { role: 'assistant' as const, content: reply, chart }]
      setMessages(final)
    } catch (err: any) {
      setMessages([...next, { role: 'assistant', content: `Fehler: ${err?.message ?? String(err)}` }])
    } finally {
      setLoading(false)
    }
  }

  return { messages, loading, angebotLink, sendMessage }
}
