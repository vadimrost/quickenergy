import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, UserPlus, ArrowRight, Calendar, Star, X } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { de } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import {
  useBenachrichtigungen, useBenachrichtigungenRealtime,
  useMarkAsRead, useUnreadCount, type BenachrichtigungTyp,
} from '@/features/crm/useBenachrichtigungen'

const TYPE_CONFIG: Record<BenachrichtigungTyp, { icon: React.ElementType; bg: string; fg: string }> = {
  neuer_lead: { icon: Star,      bg: 'bg-amber-50',  fg: 'text-amber-500' },
  status:     { icon: ArrowRight, bg: 'bg-blue-50',  fg: 'text-blue-500' },
  zuweisung:  { icon: UserPlus,  bg: 'bg-violet-50', fg: 'text-violet-500' },
  termin:     { icon: Calendar,  bg: 'bg-green-50',  fg: 'text-green-500' },
}

export function BenachrichtigungenPanel() {
  const [open, setOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  // Single realtime subscription for the whole app — safe to call here because
  // BenachrichtigungenPanel mounts exactly once in the sidebar
  useBenachrichtigungenRealtime()

  const { data: benachrichtigungen = [] } = useBenachrichtigungen()
  const unread = useUnreadCount()
  const { mutate: markAsRead } = useMarkAsRead()

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  function handleOpen() {
    setOpen(v => !v)
    // Mark all unread as read when opening
    const unreadIds = benachrichtigungen.filter(b => !b.gelesen).map(b => b.id)
    if (unreadIds.length > 0) markAsRead(unreadIds)
  }

  function handleGoToLead(leadId: string | null) {
    if (!leadId) return
    setOpen(false)
    navigate(`/crm/${leadId}`)
  }

  return (
    <div ref={panelRef} className="relative">
      {/* Bell button */}
      <button
        onClick={handleOpen}
        className={cn(
          'relative w-10 h-10 rounded-xl flex items-center justify-center transition-colors',
          open ? 'bg-accent-100 text-accent-600' : 'text-ink-muted hover:bg-bg-muted',
        )}
        title="Benachrichtigungen"
      >
        <Bell size={20} />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div className="absolute left-14 bottom-0 w-80 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <h3 className="text-sm font-bold text-slate-800">Benachrichtigungen</h3>
            <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
              <X size={15} />
            </button>
          </div>

          {/* List */}
          <div className="max-h-96 overflow-y-auto">
            {benachrichtigungen.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-slate-400">
                <Bell size={24} className="mb-2 opacity-30" />
                <p className="text-xs">Keine Benachrichtigungen</p>
              </div>
            ) : (
              benachrichtigungen.map(b => {
                const cfg = TYPE_CONFIG[b.typ] ?? TYPE_CONFIG.status
                const Icon = cfg.icon
                return (
                  <button
                    key={b.id}
                    onClick={() => handleGoToLead(b.lead_id)}
                    className={cn(
                      'w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-slate-50 transition-colors border-b border-slate-50 last:border-0',
                      !b.gelesen && 'bg-accent-50/40',
                    )}
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${cfg.bg} ${cfg.fg}`}>
                      <Icon size={14} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={cn('text-xs font-semibold text-slate-800 leading-tight', !b.gelesen && 'text-slate-900')}>
                        {b.titel}
                      </p>
                      {b.nachricht && (
                        <p className="text-[11px] text-slate-400 mt-0.5 truncate">{b.nachricht}</p>
                      )}
                      <p className="text-[10px] text-slate-300 mt-1">
                        {formatDistanceToNow(new Date(b.created_at), { addSuffix: true, locale: de })}
                      </p>
                    </div>
                    {!b.gelesen && (
                      <div className="w-1.5 h-1.5 rounded-full bg-accent-500 shrink-0 mt-2" />
                    )}
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
