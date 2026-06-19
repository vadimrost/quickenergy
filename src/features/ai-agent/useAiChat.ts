import { useState } from 'react'

export interface ChartData {
  type: 'bar' | 'horizontal-bar'
  title: string
  data: Array<{ label: string; value: number }>
}

export interface EntityRef {
  type: 'kunde' | 'angebot' | 'rechnung' | 'eingangsrechnung' | 'auftragsbestaetigung' | 'lieferant' | 'mitarbeiter' | 'pdf'
  id: string
  label: string
  sublabel?: string
}

export interface CrmLeadData {
  id: string
  name: string
  status: string
  zugewiesen_an: string | null
  deal_wert: number | null
  created_at: string
  termin_datum?: string | null
  email?: string | null
  plz?: string | null
  ort?: string | null
}

export interface CrmFunnelStage {
  stage: string
  count: number
}

export interface CrmSetterStat {
  setter: string
  gesamt: number
  neu: number
  kontaktiert: number
  termin: number
  angebot: number
  auftrag: number
  abgeschlossen: number
  verloren: number
  deal_wert_gesamt: number
  conversion_rate: string
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  chart?: ChartData
  entities?: EntityRef[]
  crm_leads?: CrmLeadData[]
  crm_funnel?: CrmFunnelStage[]
  crm_setter_stats?: CrmSetterStat[]
}

const FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-agent`
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export function useAiChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(false)
  const [angebotLink, setAngebotLink] = useState<{ id: string; nr: string } | null>(null)
  const [latestFunnel, setLatestFunnel] = useState<CrmFunnelStage[] | null>(null)
  const [latestSetterStats, setLatestSetterStats] = useState<CrmSetterStat[] | null>(null)
  const [latestLeads, setLatestLeads] = useState<CrmLeadData[] | null>(null)

  async function sendMessage(text: string, currentMessages?: ChatMessage[]) {
    const base = currentMessages ?? messages
    if (!text.trim() || loading) return

    const userMsg: ChatMessage = { role: 'user', content: text }
    const next = [...base, userMsg]
    setMessages(next)
    setLoading(true)
    setAngebotLink(null)

    try {
      // Use fetch() directly instead of supabase.functions.invoke() to avoid
      // HTTP/2 framing errors that occur with the SDK wrapper in some browsers
      const res = await fetch(FUNCTION_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: next.map(m => ({ role: m.role, content: m.content })),
        }),
      })

      if (!res.ok) {
        const errBody = await res.text().catch(() => `HTTP ${res.status}`)
        throw new Error(errBody || `HTTP ${res.status}`)
      }

      const data = await res.json()

      if (data?.error) throw new Error(data.error)

      const reply: string = data?.reply ?? 'Keine Antwort erhalten.'
      const chart: ChartData | undefined = data?.chart ?? undefined
      const rawEntities: EntityRef[] | undefined = data?.entities ?? undefined
      const mentioned = rawEntities?.filter(e => reply.includes(e.label))
      const entities: EntityRef[] | undefined = (mentioned?.length ? mentioned : rawEntities?.slice(0, 5)) ?? undefined
      const crm_leads: CrmLeadData[] | undefined = data?.crm_leads ?? undefined
      const crm_funnel: CrmFunnelStage[] | undefined = data?.crm_funnel ?? undefined
      const crm_setter_stats: CrmSetterStat[] | undefined = data?.crm_setter_stats ?? undefined

      if (crm_funnel && crm_funnel.length > 0) setLatestFunnel(crm_funnel)
      if (crm_setter_stats && crm_setter_stats.length > 0) setLatestSetterStats(crm_setter_stats)
      if (crm_leads && crm_leads.length > 0) setLatestLeads(crm_leads)

      const idMatch = reply.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)
      const nrMatch = reply.match(/\b(AN-\d+)\b/)
      if (idMatch && nrMatch) setAngebotLink({ id: idMatch[0], nr: nrMatch[0] })

      setMessages([...next, { role: 'assistant', content: reply, chart, entities, crm_leads, crm_funnel, crm_setter_stats }])
    } catch (err: any) {
      setMessages([...next, { role: 'assistant', content: `Fehler: ${err?.message ?? String(err)}` }])
    } finally {
      setLoading(false)
    }
  }

  return { messages, loading, angebotLink, sendMessage, latestFunnel, latestSetterStats, latestLeads }
}
