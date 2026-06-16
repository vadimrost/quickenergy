import { useState, useRef, useEffect } from 'react'
import { Bot, X, Send, Loader2, ExternalLink, Sparkles } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { cn, formatEuro } from '@/lib/utils'
import { useAiChat, type ChartData } from './useAiChat'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'

const SUGGESTIONS = [
  { label: 'Umsatz-Entwicklung', prompt: 'Zeig mir meine Umsatz-Entwicklung der letzten 6 Monate' },
  { label: 'Ausgaben', prompt: 'Wie sind meine Ausgaben diesen Monat aufgeteilt?' },
  { label: 'Offene Rechnungen', prompt: 'Welche Rechnungen sind noch offen?' },
  { label: 'Angebot erstellen', prompt: 'Erstelle ein Angebot für einen Kunden' },
]

function MiniChart({ chart }: { chart: ChartData }) {
  if (chart.type === 'horizontal-bar') {
    return (
      <div className="mt-3 bg-white/60 rounded-xl p-3">
        <p className="text-[11px] font-medium text-slate-500 mb-2">{chart.title}</p>
        <ResponsiveContainer width="100%" height={Math.max(chart.data.length * 30, 60)}>
          <BarChart layout="vertical" data={chart.data} margin={{ left: 0, right: 8 }}>
            <XAxis type="number" hide />
            <YAxis type="category" dataKey="label" width={100} tick={{ fontSize: 10, fill: '#64748B' }} axisLine={false} tickLine={false} />
            <Tooltip formatter={(v) => [formatEuro(Number(v)), 'Betrag']} contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #E2E8F0', padding: '5px 10px' }} cursor={{ fill: '#F8FAFC' }} />
            <Bar dataKey="value" fill="#FB923C" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    )
  }
  return (
    <div className="mt-3 bg-white/60 rounded-xl p-3">
      <p className="text-[11px] font-medium text-slate-500 mb-2">{chart.title}</p>
      <ResponsiveContainer width="100%" height={120}>
        <BarChart data={chart.data} barCategoryGap="40%">
          <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 10, fill: '#94A3B8' }} axisLine={false} tickLine={false} width={30} tickFormatter={v => v >= 1000 ? `${Math.round(v / 1000)}k` : String(v)} />
          <Tooltip formatter={(v) => [formatEuro(Number(v)), 'Umsatz']} contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #E2E8F0', padding: '5px 10px' }} cursor={{ fill: '#F8FAFC' }} />
          <Bar dataKey="value" fill="#4ADE80" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export function AiAgentChat() {
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const { messages, loading, angebotLink, sendMessage } = useAiChat()
  const inputRef = useRef<HTMLInputElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Dashboard has its own ChatCommandBar
  if (location.pathname === '/') return null

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 80)
  }, [open])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  function send() {
    if (!input.trim() || loading) return
    const text = input
    setInput('')
    sendMessage(text)
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(v => !v)}
        className={cn(
          'fixed bottom-6 right-6 z-[70] w-12 h-12 rounded-full shadow-lg',
          'flex items-center justify-center transition-all duration-200',
          open ? 'bg-slate-800 text-white' : 'bg-indigo-600 text-white hover:bg-indigo-700 hover:scale-105'
        )}
        style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 72px)' }}
        aria-label="KI-Assistent"
      >
        {open ? <X size={18} /> : <Sparkles size={18} />}
      </button>

      {open && <div className="fixed inset-0 z-[65] bg-black/25 backdrop-blur-[2px]" onClick={() => setOpen(false)} />}

      {open && (
        <div
          className="fixed z-[70] flex flex-col bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden"
          style={{ top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 'min(92vw, 640px)', height: 'min(85vh, 720px)' }}
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center gap-2.5 px-4 py-3.5 border-b border-slate-100 shrink-0">
            <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-sm">
              <Bot size={13} className="text-white" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800">KI-Assistent</p>
              <p className="text-[10px] text-slate-400">QuickEnergy</p>
            </div>
            <button onClick={() => setOpen(false)} className="ml-auto w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors">
              <X size={14} />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
            {messages.length === 0 && !loading && (
              <div className="space-y-4 pt-4">
                <div className="text-center">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center mx-auto mb-3 shadow-md">
                    <Bot size={22} className="text-white" />
                  </div>
                  <p className="text-sm font-semibold text-slate-700">Wie kann ich helfen?</p>
                  <p className="text-xs text-slate-400 mt-1">Angebote · Daten · Charts</p>
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  {SUGGESTIONS.map(({ label, prompt }) => (
                    <button key={label} onClick={() => sendMessage(prompt)} className="text-left text-sm px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 text-slate-600 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 transition-all leading-snug font-medium">
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m, i) => (
              <div key={i} className={cn('flex items-start gap-3', m.role === 'user' ? 'justify-end' : 'justify-start')}>
                {m.role === 'assistant' && (
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
                    <Bot size={14} className="text-white" />
                  </div>
                )}
                <div className={cn('max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap', m.role === 'user' ? 'bg-indigo-600 text-white rounded-tr-sm shadow-sm' : 'bg-slate-100 text-slate-800 rounded-tl-sm')}>
                  {m.content}
                  {m.chart && <MiniChart chart={m.chart} />}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shrink-0 shadow-sm">
                  <Bot size={14} className="text-white" />
                </div>
                <div className="bg-slate-100 rounded-2xl rounded-tl-sm px-4 py-3.5 flex items-center gap-1.5">
                  {[0, 150, 300].map(d => <span key={d} className="w-2 h-2 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: `${d}ms` }} />)}
                </div>
              </div>
            )}

            {angebotLink && !loading && (
              <div className="pl-11">
                <Link to={`/angebote/${angebotLink.id}`} onClick={() => setOpen(false)} className="inline-flex items-center gap-2 text-sm font-medium text-indigo-600 bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-2 hover:bg-indigo-100 transition-colors">
                  <ExternalLink size={13} /> {angebotLink.nr} öffnen
                </Link>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input — BOTTOM */}
          <div className="shrink-0 px-6 py-4 border-t border-slate-100 bg-white">
            <div
              className="rounded-xl animate-gradient-shift"
              style={{ background: 'linear-gradient(90deg, #4ADE80, #60A5FA, #818CF8, #C084FC, #F472B6, #4ADE80)', backgroundSize: '200% 200%', padding: '1.5px', boxShadow: '0 0 20px rgba(129, 140, 248, 0.18)' }}
            >
              <div className="bg-white rounded-[10px] flex items-center gap-3 px-4 py-3">
                <input
                  ref={inputRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKey}
                  placeholder="Nachricht eingeben…"
                  disabled={loading}
                  className="flex-1 text-sm bg-transparent outline-none placeholder:text-slate-400 text-slate-800 min-w-0"
                />
                <button
                  onClick={send}
                  disabled={!input.trim() || loading}
                  className={cn('w-8 h-8 rounded-lg flex items-center justify-center transition-all shrink-0', input.trim() && !loading ? 'bg-indigo-500 text-white hover:bg-indigo-600' : 'bg-slate-100 text-slate-300')}
                >
                  {loading ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                </button>
              </div>
            </div>
            <p className="text-center text-[10px] text-slate-300 mt-2">Drücke Enter zum Senden · Esc zum Schließen</p>
          </div>
        </div>
      )}
    </>
  )
}
