import { useState, useRef, useEffect } from 'react'
import { Bot, X, Send, Loader2, ExternalLink } from 'lucide-react'
import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

// Extract /angebote/:id links from assistant replies
function parseReply(text: string): Array<{ type: 'text' | 'link'; value: string; label?: string }> {
  const parts: Array<{ type: 'text' | 'link'; value: string; label?: string }> = []
  // Match AN-\d+ followed by optional text, find matching angebot_id in text
  const angebotNrRegex = /\b(AN-\d+)\b/g
  const angebotIdRegex = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i

  // Check for angebot_id in the text (sometimes embedded in response)
  const idMatch = text.match(angebotIdRegex)
  const nrMatch = text.match(angebotNrRegex)

  if (idMatch && nrMatch) {
    const beforeId = text.replace(idMatch[0], '').trim()
    parts.push({ type: 'text', value: beforeId })
    parts.push({ type: 'link', value: `/angebote/${idMatch[0]}`, label: `${nrMatch[0]} öffnen` })
    return parts
  }

  parts.push({ type: 'text', value: text })
  return parts
}

export function AiAgentChat() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [angebotLink, setAngebotLink] = useState<{ id: string; nr: string } | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [open])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  async function send() {
    const text = input.trim()
    if (!text || loading) return

    const newMessages: Message[] = [...messages, { role: 'user', content: text }]
    setMessages(newMessages)
    setInput('')
    setLoading(true)
    setAngebotLink(null)

    try {
      const { data, error } = await supabase.functions.invoke('ai-agent', {
        body: {
          messages: newMessages.map(m => ({ role: m.role, content: m.content })),
        },
      })

      if (error) throw error

      const reply = data?.reply ?? 'Keine Antwort erhalten.'

      // Detect if an Angebot was created — look for UUID + AN- pattern in reply
      const idMatch = reply.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)
      const nrMatch = reply.match(/\b(AN-\d+)\b/)
      if (idMatch && nrMatch) {
        setAngebotLink({ id: idMatch[0], nr: nrMatch[0] })
      }

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
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(v => !v)}
        className={cn(
          'fixed bottom-6 right-6 md:bottom-6 md:right-6 z-[70]',
          'w-12 h-12 rounded-full shadow-lg flex items-center justify-center transition-colors',
          open
            ? 'bg-ink text-bg-base'
            : 'bg-accent-600 text-white hover:bg-accent-700'
        )}
        // On mobile, stay above the bottom nav (h-16)
        style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 72px)' }}
        aria-label="KI-Assistent"
      >
        {open ? <X size={20} /> : <Bot size={20} />}
      </button>

      {/* Chat panel */}
      {open && (
        <div
          className="fixed z-[65] flex flex-col bg-bg-surface border border-border shadow-2xl rounded-2xl overflow-hidden"
          style={{
            bottom: 'calc(env(safe-area-inset-bottom, 0px) + 96px)',
            right: '1.5rem',
            width: 'min(96vw, 22rem)',
            height: 'min(70vh, 520px)',
          }}
        >
          {/* Header */}
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-bg-muted shrink-0">
            <Bot size={16} className="text-accent-600" />
            <span className="text-sm font-semibold text-ink">KI-Assistent</span>
            <span className="ml-auto text-xs text-ink-muted">Angebote · Kunden · Rechnungen</span>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
            {messages.length === 0 && (
              <div className="text-center text-xs text-ink-muted pt-6 space-y-2">
                <Bot size={28} className="mx-auto text-accent-200" />
                <p>Stell mir eine Frage oder sag mir was ich tun soll.</p>
                <div className="space-y-1 mt-3">
                  {[
                    'Erstelle ein Angebot für Muster GmbH',
                    'Zeig mir offene Rechnungen',
                    'Welche Angebote sind noch offen?',
                  ].map(s => (
                    <button
                      key={s}
                      onClick={() => { setInput(s); inputRef.current?.focus() }}
                      className="block w-full text-left text-xs px-3 py-1.5 rounded-lg bg-bg-muted hover:bg-accent-50 text-ink-muted hover:text-accent-700 transition-colors"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m, i) => (
              <div
                key={i}
                className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}
              >
                <div
                  className={cn(
                    'max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap',
                    m.role === 'user'
                      ? 'bg-accent-600 text-white rounded-br-sm'
                      : 'bg-bg-muted text-ink rounded-bl-sm'
                  )}
                >
                  {m.content}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="bg-bg-muted rounded-2xl rounded-bl-sm px-3 py-2">
                  <Loader2 size={14} className="animate-spin text-ink-muted" />
                </div>
              </div>
            )}

            {angebotLink && (
              <div className="flex justify-start">
                <Link
                  to={`/angebote/${angebotLink.id}`}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-1.5 text-xs font-medium text-accent-600 bg-accent-50 border border-accent-200 rounded-lg px-3 py-2 hover:bg-accent-100 transition-colors"
                >
                  <ExternalLink size={12} />
                  {angebotLink.nr} öffnen
                </Link>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="shrink-0 border-t border-border px-3 py-2 flex items-center gap-2">
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Nachricht schreiben…"
              disabled={loading}
              className="flex-1 text-sm bg-transparent outline-none placeholder:text-ink-subtle text-ink"
            />
            <button
              onClick={send}
              disabled={!input.trim() || loading}
              className="w-7 h-7 rounded-full bg-accent-600 text-white flex items-center justify-center hover:bg-accent-700 disabled:opacity-30 transition-colors shrink-0"
            >
              <Send size={12} />
            </button>
          </div>
        </div>
      )}
    </>
  )
}
