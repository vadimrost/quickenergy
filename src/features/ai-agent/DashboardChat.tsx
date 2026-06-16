import { useState, useRef, useEffect } from 'react'
import { Send, Loader2, Bot, ExternalLink, MessageSquare } from 'lucide-react'
import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

const SUGGESTIONS = [
  'Erstelle ein Angebot für einen Kunden',
  'Welche Rechnungen sind noch offen?',
  'Zeig mir die letzten Angebote',
]

export function DashboardChat() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [angebotLink, setAngebotLink] = useState<{ id: string; nr: string } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (expanded) bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading, expanded])

  async function send(text?: string) {
    const msg = (text ?? input).trim()
    if (!msg || loading) return

    const newMessages: Message[] = [...messages, { role: 'user', content: msg }]
    setMessages(newMessages)
    setInput('')
    setLoading(true)
    setExpanded(true)
    setAngebotLink(null)

    try {
      const { data, error } = await supabase.functions.invoke('ai-agent', {
        body: { messages: newMessages.map(m => ({ role: m.role, content: m.content })) },
      })

      if (error) throw error

      const reply = data?.reply ?? 'Keine Antwort erhalten.'
      const idMatch = reply.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)
      const nrMatch = reply.match(/\b(AN-\d+)\b/)
      if (idMatch && nrMatch) setAngebotLink({ id: idMatch[0], nr: nrMatch[0] })

      setMessages([...newMessages, { role: 'assistant', content: reply }])
    } catch (err: any) {
      setMessages([
        ...newMessages,
        { role: 'assistant', content: `Fehler: ${err?.message ?? String(err)}` },
      ])
    } finally {
      setLoading(false)
    }
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  return (
    <div className="card-base overflow-hidden">
      {/* Conversation — shows after first message */}
      {expanded && (
        <div className="border-b border-border max-h-72 overflow-y-auto p-4 space-y-3 bg-bg-base">
          {messages.map((m, i) => (
            <div key={i} className={cn('flex items-start gap-2', m.role === 'user' ? 'justify-end' : 'justify-start')}>
              {m.role === 'assistant' && (
                <div className="w-6 h-6 rounded-full bg-accent-100 flex items-center justify-center shrink-0 mt-0.5">
                  <Bot size={11} className="text-accent-600" />
                </div>
              )}
              <div className={cn(
                'max-w-[82%] rounded-2xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap',
                m.role === 'user'
                  ? 'bg-accent-600 text-white rounded-br-sm'
                  : 'bg-bg-muted text-ink rounded-bl-sm'
              )}>
                {m.content}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex items-start gap-2">
              <div className="w-6 h-6 rounded-full bg-accent-100 flex items-center justify-center shrink-0">
                <Bot size={11} className="text-accent-600" />
              </div>
              <div className="bg-bg-muted rounded-2xl rounded-bl-sm px-3 py-2.5">
                <Loader2 size={13} className="animate-spin text-ink-muted" />
              </div>
            </div>
          )}

          {angebotLink && !loading && (
            <div className="flex pl-8">
              <Link
                to={`/angebote/${angebotLink.id}`}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-accent-600 bg-accent-50 border border-accent-200 rounded-lg px-3 py-1.5 hover:bg-accent-100 transition-colors"
              >
                <ExternalLink size={11} />
                {angebotLink.nr} öffnen
              </Link>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      )}

      {/* Suggestions — only before first message */}
      {!expanded && (
        <div className="flex flex-wrap gap-2 px-4 pt-3 pb-1">
          {SUGGESTIONS.map(s => (
            <button
              key={s}
              onClick={() => send(s)}
              className="text-xs px-3 py-1.5 rounded-full border border-border bg-bg-muted text-ink-muted hover:text-ink hover:bg-bg-hover hover:border-accent-200 transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Input bar */}
      <div className="flex items-center gap-3 px-4 py-3">
        <MessageSquare size={15} className="text-ink-muted shrink-0" />
        <input
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Stell eine Frage…"
          disabled={loading}
          className="flex-1 text-sm bg-transparent outline-none placeholder:text-ink-subtle text-ink"
        />
        <button
          onClick={() => send()}
          disabled={!input.trim() || loading}
          className="shrink-0 h-8 px-4 rounded-lg bg-accent-600 text-white text-sm font-medium hover:bg-accent-700 disabled:opacity-30 transition-colors flex items-center gap-1.5"
        >
          {loading ? <Loader2 size={13} className="animate-spin" /> : <><Send size={12} /> Senden</>}
        </button>
      </div>
    </div>
  )
}
