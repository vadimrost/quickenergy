import React, { useState, useRef, useEffect } from 'react'
import { Bot, X, Send, Loader2, ExternalLink, Sparkles, Building2, FileText, Receipt, FileInput, FileDown, ClipboardList, Truck, User, MapPin, Euro, Calendar, UserCircle } from 'lucide-react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { cn, formatEuro } from '@/lib/utils'
import { useAiChat, type ChartData, type EntityRef, type CrmLeadData, type CrmFunnelStage, type CrmSetterStat } from './useAiChat'
import { ThinkingAnimation } from './ThinkingAnimation'
import { SvgFunnel } from '@/features/crm/SvgFunnel'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'

const SUGGESTIONS = [
  { label: 'Umsatz-Entwicklung', prompt: 'Zeig mir meine Umsatz-Entwicklung der letzten 6 Monate' },
  { label: 'Ausgaben', prompt: 'Wie sind meine Ausgaben diesen Monat aufgeteilt?' },
  { label: 'Offene Rechnungen', prompt: 'Welche Rechnungen sind noch offen?' },
  { label: 'CRM Pipeline', prompt: 'Zeig mir den Conversion-Trichter meiner Leads' },
  { label: 'Leads heute', prompt: 'Welche Leads haben heute Termin?' },
  { label: 'Angebot erstellen', prompt: 'Erstelle ein Angebot für einen Kunden' },
]

const CRM_STATUS_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  neu:           { bg: 'bg-slate-100',   text: 'text-slate-600',   dot: 'bg-slate-400'   },
  kontaktiert:   { bg: 'bg-blue-100',    text: 'text-blue-700',    dot: 'bg-blue-400'    },
  termin:        { bg: 'bg-violet-100',  text: 'text-violet-700',  dot: 'bg-violet-500'  },
  angebot:       { bg: 'bg-amber-100',   text: 'text-amber-700',   dot: 'bg-amber-400'   },
  auftrag:       { bg: 'bg-green-100',   text: 'text-green-700',   dot: 'bg-green-500'   },
  abgeschlossen: { bg: 'bg-emerald-100', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  verloren:      { bg: 'bg-red-100',     text: 'text-red-600',     dot: 'bg-red-400'     },
}

const CRM_STATUS_LABELS: Record<string, string> = {
  neu: 'Neu', kontaktiert: 'Kontaktiert', termin: 'Termin',
  angebot: 'Angebot', auftrag: 'Auftrag', abgeschlossen: 'Abgeschlossen', verloren: 'Verloren',
}

function initials(name: string) {
  return name.trim().split(/\s+/).map(w => w[0] ?? '').join('').toUpperCase().slice(0, 2)
}

function CrmLeadCards({ leads, onClose }: { leads: CrmLeadData[]; onClose: () => void }) {
  const navigate = useNavigate()
  return (
    <div className="mt-3 space-y-2">
      {leads.map(lead => {
        const sc = CRM_STATUS_COLORS[lead.status] ?? CRM_STATUS_COLORS.neu
        return (
          <button
            key={lead.id}
            onClick={() => { navigate(`/crm/${lead.id}`); onClose() }}
            className="w-full text-left bg-white border border-slate-200 rounded-xl px-3 py-2.5 hover:border-indigo-300 hover:shadow-sm transition-all group"
          >
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white text-[11px] font-bold shrink-0">
                {initials(lead.name)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 justify-between">
                  <span className="text-sm font-semibold text-slate-800 truncate">{lead.name}</span>
                  <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0', sc.bg, sc.text)}>
                    {CRM_STATUS_LABELS[lead.status] ?? lead.status}
                  </span>
                </div>
                <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                  {(lead.plz || lead.ort) && (
                    <span className="flex items-center gap-1 text-[11px] text-slate-400">
                      <MapPin size={9} />{[lead.plz, lead.ort].filter(Boolean).join(' ')}
                    </span>
                  )}
                  {lead.deal_wert != null && lead.deal_wert > 0 && (
                    <span className="flex items-center gap-1 text-[11px] text-emerald-600 font-semibold">
                      <Euro size={9} />{lead.deal_wert.toLocaleString('de-AT')}
                    </span>
                  )}
                  {lead.zugewiesen_an && (
                    <span className="flex items-center gap-1 text-[11px] text-slate-400">
                      <UserCircle size={9} />{lead.zugewiesen_an}
                    </span>
                  )}
                  {lead.termin_datum && (
                    <span className="flex items-center gap-1 text-[11px] text-violet-600 font-medium">
                      <Calendar size={9} />{new Date(lead.termin_datum).toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                </div>
              </div>
              <ExternalLink size={12} className="text-slate-300 group-hover:text-indigo-400 shrink-0 transition-colors" />
            </div>
          </button>
        )
      })}
    </div>
  )
}

function CrmFunnelCard({ stages }: { stages: CrmFunnelStage[] }) {
  return (
    <div className="mt-3 bg-white border border-slate-200 rounded-xl px-4 pt-4 pb-2">
      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 block">Conversion-Trichter</span>
      <SvgFunnel data={stages} labels={CRM_STATUS_LABELS} />
    </div>
  )
}

function renderMarkdown(text: string): React.ReactNode {
  function inline(s: string): React.ReactNode {
    const parts = s.split(/(\*\*[^*]+\*\*)/g)
    return parts.map((p, i) =>
      p.startsWith('**') && p.endsWith('**')
        ? <strong key={i} className="font-semibold">{p.slice(2, -2)}</strong>
        : p
    )
  }
  const lines = text.split('\n')
  const result: React.ReactNode[] = []
  let listItems: React.ReactNode[] = []
  let listType: 'ul' | 'ol' | null = null
  let olCounter = 0
  function flushList() {
    if (!listItems.length) return
    result.push(
      listType === 'ul'
        ? <ul key={`ul-${result.length}`} className="space-y-0.5 my-1 pl-1">{listItems}</ul>
        : <ol key={`ol-${result.length}`} className="space-y-0.5 my-1 pl-1">{listItems}</ol>
    )
    listItems = []; listType = null; olCounter = 0
  }
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const ul = line.match(/^[-*•]\s+(.+)/)
    const ol = line.match(/^\d+\.\s+(.+)/)
    if (ul) {
      if (listType === 'ol') flushList()
      listType = 'ul'
      listItems.push(<li key={i} className="flex gap-1.5"><span className="text-slate-400 shrink-0">·</span><span>{inline(ul[1])}</span></li>)
    } else if (ol) {
      if (listType === 'ul') flushList()
      listType = 'ol'; olCounter++
      listItems.push(<li key={i} className="flex gap-1.5"><span className="text-slate-400 shrink-0 font-medium">{olCounter}.</span><span>{inline(ol[1])}</span></li>)
    } else {
      flushList()
      if (line.trim()) result.push(<span key={i} className={result.length > 0 ? 'block mt-1' : 'block'}>{inline(line)}</span>)
    }
  }
  flushList()
  return <>{result}</>
}

function CrmSetterStats({ stats }: { stats: CrmSetterStat[] }) {
  const stageKeys = ['neu', 'kontaktiert', 'termin', 'angebot', 'auftrag', 'abgeschlossen', 'verloren'] as const
  return (
    <div className="mt-3 space-y-2">
      {stats.slice(0, 8).map(s => (
        <div key={s.setter} className="bg-white border border-slate-200 rounded-xl px-3 py-2.5">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-400 to-indigo-500 flex items-center justify-center text-white text-[11px] font-bold shrink-0">
              {initials(s.setter)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-slate-800 truncate">{s.setter}</span>
                <div className="flex items-center gap-2.5 shrink-0">
                  <span className="text-[11px] font-bold text-emerald-600">{s.conversion_rate}</span>
                  <span className="text-[11px] text-slate-400">{s.gesamt} Leads</span>
                </div>
              </div>
              <div className="flex gap-px mt-1.5 h-1.5 rounded-full overflow-hidden bg-slate-100">
                {stageKeys.map(stage => {
                  const count = s[stage] as number
                  if (!count || !s.gesamt) return null
                  const pct = (count / s.gesamt) * 100
                  const dot = CRM_STATUS_COLORS[stage]?.dot ?? 'bg-slate-300'
                  return <div key={stage} className={cn('h-full', dot)} style={{ width: `${pct}%`, minWidth: count > 0 ? 2 : 0 }} title={`${stage}: ${count}`} />
                })}
              </div>
              <div className="flex items-center gap-3 mt-1 flex-wrap">
                {stageKeys.filter(k => (s[k] as number) > 0).map(k => (
                  <span key={k} className={cn('text-[10px] font-medium', CRM_STATUS_COLORS[k]?.text ?? 'text-slate-500')}>
                    {CRM_STATUS_LABELS[k]}: {s[k]}
                  </span>
                ))}
                {s.deal_wert_gesamt > 0 && (
                  <span className="flex items-center gap-1 text-[11px] text-emerald-600 font-semibold ml-auto">
                    <Euro size={9} />{s.deal_wert_gesamt.toLocaleString('de-AT')}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

const ENTITY_CONFIG = {
  kunde:               { icon: Building2,     bg: 'bg-blue-50 border-blue-200 hover:bg-blue-100',      text: 'text-blue-700',    external: false, href: (_id: string) => '/kunden' },
  angebot:             { icon: FileText,       bg: 'bg-indigo-50 border-indigo-200 hover:bg-indigo-100', text: 'text-indigo-700',  external: false, href: (id: string) => `/angebote/${id}` },
  rechnung:            { icon: Receipt,        bg: 'bg-emerald-50 border-emerald-200 hover:bg-emerald-100', text: 'text-emerald-700', external: false, href: (id: string) => `/ausgangsrechnungen/${id}` },
  eingangsrechnung:    { icon: FileInput,      bg: 'bg-amber-50 border-amber-200 hover:bg-amber-100',   text: 'text-amber-700',   external: false, href: (id: string) => `/buchung/${id}` },
  auftragsbestaetigung:{ icon: ClipboardList,  bg: 'bg-violet-50 border-violet-200 hover:bg-violet-100', text: 'text-violet-700',  external: false, href: (id: string) => `/auftraege/${id}` },
  lieferant:           { icon: Truck,          bg: 'bg-slate-50 border-slate-200 hover:bg-slate-100',   text: 'text-slate-700',   external: false, href: (_id: string) => '/rechnungen' },
  mitarbeiter:         { icon: User,           bg: 'bg-teal-50 border-teal-200 hover:bg-teal-100',      text: 'text-teal-700',    external: false, href: (_id: string) => '/mitarbeiter' },
  pdf:                 { icon: FileDown,       bg: 'bg-rose-50 border-rose-200 hover:bg-rose-100',      text: 'text-rose-700',    external: true,  href: (id: string) => id },
}

function EntityChips({ entities }: { entities: EntityRef[] }) {
  return (
    <div className="mt-2.5 flex flex-wrap gap-1.5">
      {entities.map((e) => {
        const cfg = ENTITY_CONFIG[e.type]
        const Icon = cfg.icon
        const cls = cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-medium transition-colors', cfg.bg, cfg.text)
        return cfg.external ? (
          <a key={e.id} href={cfg.href(e.id)} target="_blank" rel="noopener noreferrer" className={cls}>
            <Icon size={10} /><span>{e.label}</span>{e.sublabel && <span className="opacity-50">{e.sublabel}</span>}
          </a>
        ) : (
          <Link key={e.id} to={cfg.href(e.id)} className={cls}>
            <Icon size={10} /><span>{e.label}</span>{e.sublabel && <span className="opacity-50">{e.sublabel}</span>}
          </Link>
        )
      })}
    </div>
  )
}

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
  const closeChat = () => setOpen(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 80)
  }, [open])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  // Dashboard has its own ChatCommandBar — must come after all hooks
  if (location.pathname === '/') return null

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
          style={{ top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 'min(96vw, 860px)', height: 'min(92vh, 900px)' }}
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
                {m.role === 'assistant' ? (
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="inline-block max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed bg-slate-100 text-slate-800 rounded-tl-sm">
                      {renderMarkdown(m.content)}
                      {m.chart && <MiniChart chart={m.chart} />}
                      {m.entities && m.entities.length > 0 && <EntityChips entities={m.entities} />}
                      {m.crm_leads && m.crm_leads.length > 0 && <CrmLeadCards leads={m.crm_leads} onClose={closeChat} />}
                      {m.crm_setter_stats && m.crm_setter_stats.length > 0 && <CrmSetterStats stats={m.crm_setter_stats} />}
                    </div>
                    {m.crm_funnel && m.crm_funnel.length > 0 && <CrmFunnelCard stages={m.crm_funnel} />}
                  </div>
                ) : (
                  <div className="max-w-[82%] rounded-2xl px-4 py-3 text-sm leading-relaxed bg-indigo-600 text-white rounded-tr-sm shadow-sm whitespace-pre-wrap">
                    {m.content}
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shrink-0 shadow-sm">
                  <Bot size={14} className="text-white" />
                </div>
                <div className="bg-slate-100 rounded-2xl rounded-tl-sm px-4 py-3.5">
                  <ThinkingAnimation />
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
