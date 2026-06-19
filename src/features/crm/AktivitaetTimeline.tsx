import { useState } from 'react'
import { format, isToday, isYesterday } from 'date-fns'
import { de } from 'date-fns/locale'
import {
  MessageCircle, ArrowRight, FileText, Calendar,
  User, Euro, Sparkles, Send,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { LEAD_STATUS_LABELS } from './useLeads'
import { useLeadAktivitaeten, useAddAktivitaet, type AktivitaetTyp } from './useLeadAktivitaeten'
import type { LeadStatus } from '@/types/database'

const TYPE_CONFIG: Record<AktivitaetTyp, { icon: React.ElementType; bg: string; fg: string }> = {
  erstellt:  { icon: Sparkles,      bg: 'bg-amber-50',  fg: 'text-amber-500' },
  status:    { icon: ArrowRight,    bg: 'bg-blue-50',   fg: 'text-blue-500' },
  notiz:     { icon: FileText,      bg: 'bg-slate-100', fg: 'text-slate-400' },
  termin:    { icon: Calendar,      bg: 'bg-green-50',  fg: 'text-green-500' },
  zuweisung: { icon: User,          bg: 'bg-violet-50', fg: 'text-violet-500' },
  deal:      { icon: Euro,          bg: 'bg-amber-50',  fg: 'text-amber-500' },
  kommentar: { icon: MessageCircle, bg: 'bg-accent-50', fg: 'text-accent-500' },
}

// consistent color per author name
const AUTHOR_COLORS = [
  'bg-blue-100 text-blue-700',
  'bg-violet-100 text-violet-700',
  'bg-emerald-100 text-emerald-700',
  'bg-rose-100 text-rose-700',
  'bg-amber-100 text-amber-700',
  'bg-cyan-100 text-cyan-700',
]
function authorColor(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff
  return AUTHOR_COLORS[h % AUTHOR_COLORS.length]
}
function authorInitials(name: string): string {
  return name.trim().split(/[\s@]+/).map(p => p[0] ?? '').join('').toUpperCase().slice(0, 2)
}
function authorDisplay(raw: string): string {
  // if it looks like an email, return only the local part
  return raw.includes('@') ? raw.split('@')[0] : raw
}

function formatTs(dateStr: string): string {
  const d = new Date(dateStr)
  if (isToday(d)) return `Heute, ${format(d, 'HH:mm')}`
  if (isYesterday(d)) return `Gestern, ${format(d, 'HH:mm')}`
  return format(d, 'dd.MM.yy, HH:mm', { locale: de })
}

function entryLabel(typ: AktivitaetTyp, inhalt: string | null, meta: Record<string, string> | null): string {
  if (typ === 'erstellt') return 'Lead erstellt'
  if (typ === 'status' && meta) {
    const von = LEAD_STATUS_LABELS[meta.von as LeadStatus] ?? meta.von
    const nach = LEAD_STATUS_LABELS[meta.nach as LeadStatus] ?? meta.nach
    return `${von} → ${nach}`
  }
  if (typ === 'termin') return `Termin: ${inhalt ?? ''}`
  if (typ === 'zuweisung') return `Zugewiesen an ${inhalt ?? '—'}`
  if (typ === 'deal') return `Deal-Wert: ${inhalt ?? '0'} €`
  return inhalt ?? ''
}

export function AktivitaetTimeline({ leadId, currentUser }: {
  leadId: string
  currentUser?: string | null
}) {
  const { data: aktivitaeten = [], isLoading } = useLeadAktivitaeten(leadId)
  const { mutate: addAktivitaet, isPending } = useAddAktivitaet()
  const [kommentar, setKommentar] = useState('')

  function handleSend() {
    const text = kommentar.trim()
    if (!text) return
    addAktivitaet(
      { lead_id: leadId, typ: 'kommentar', inhalt: text, erstellt_von: currentUser ?? null },
      { onSuccess: () => setKommentar('') },
    )
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
      <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Aktivitäten</h3>

      {/* Kommentar input */}
      <div className="flex gap-2 mb-5">
        <input
          value={kommentar}
          onChange={e => setKommentar(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
          placeholder="Kommentar hinzufügen..."
          className="flex-1 text-sm bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent-400/30 focus:border-accent-400 text-slate-700 placeholder:text-slate-300 transition-all"
        />
        <Button
          size="sm"
          onClick={handleSend}
          disabled={isPending || !kommentar.trim()}
          className="bg-slate-800 hover:bg-slate-900 text-white px-3 shrink-0"
        >
          <Send size={13} />
        </Button>
      </div>

      {/* Feed */}
      {isLoading ? (
        <div className="flex justify-center py-6">
          <div className="w-5 h-5 border-2 border-accent-400 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : aktivitaeten.length === 0 ? (
        <p className="text-sm text-slate-300 text-center py-4">Noch keine Aktivitäten</p>
      ) : (
        <div>
          {aktivitaeten.map((a, i) => {
            const cfg = TYPE_CONFIG[a.typ] ?? TYPE_CONFIG.kommentar
            const Icon = cfg.icon
            const label = entryLabel(a.typ, a.inhalt, a.meta)
            const hasBody = (a.typ === 'notiz' || a.typ === 'kommentar') && a.inhalt
            const isLast = i === aktivitaeten.length - 1
            const author = a.erstellt_von

            return (
              <div key={a.id} className="flex gap-3">
                {/* Icon + connector */}
                <div className="flex flex-col items-center shrink-0">
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${cfg.bg} ${cfg.fg}`}>
                    <Icon size={13} />
                  </div>
                  {!isLast && <div className="w-px flex-1 bg-slate-100 my-1.5" />}
                </div>

                {/* Content */}
                <div className={`flex-1 min-w-0 ${isLast ? 'pb-0' : 'pb-4'}`}>
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-medium text-slate-700 leading-snug">{label}</span>
                    <span className="text-[10px] text-slate-300 whitespace-nowrap shrink-0 mt-0.5">
                      {formatTs(a.created_at)}
                    </span>
                  </div>

                  {/* Body text (notiz / kommentar) */}
                  {hasBody && (
                    <p className="text-xs text-slate-400 mt-0.5 leading-relaxed line-clamp-3">{a.inhalt}</p>
                  )}

                  {/* Author chip */}
                  {author && (
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <div className={`w-4 h-4 rounded-md text-[9px] font-bold flex items-center justify-center ${authorColor(author)}`}>
                        {authorInitials(author)}
                      </div>
                      <span className="text-[11px] text-slate-400 font-medium">{authorDisplay(author)}</span>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
