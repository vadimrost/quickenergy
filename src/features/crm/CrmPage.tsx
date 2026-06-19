import { useState, useRef, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  formatDistanceToNow, format,
  startOfMonth, endOfMonth, eachDayOfInterval,
  isSameDay, isToday, startOfWeek, endOfWeek,
} from 'date-fns'
import { de } from 'date-fns/locale'
import {
  Plus, ChevronLeft, ChevronRight, Phone, Mail, Calendar, Zap,
  BarChart2, MapPin, CheckCircle, AlertCircle, XCircle,
  LayoutGrid, List, Search, User, Trash2, Pencil,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { PageTitle } from '@/components/shared/PageTitle'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useLeads, useUpdateLead, useDeleteLead, LEAD_STATUS_COLORS, PIPELINE_STAGES } from './useLeads'
import { useStageLabels } from './useStageLabels'
import { SvgFunnel } from './SvgFunnel'
import { useRole } from '@/contexts/RoleContext'
import { useMitarbeiterAll } from '@/features/mitarbeiter/useMitarbeiterCrud'
import { useCreateBenachrichtigung } from './useBenachrichtigungen'
import type { Lead, LeadStatus, Mitarbeiter } from '@/types/database'

type View = 'kanban' | 'liste' | 'analytics' | 'kalender'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function initials(text: string): string {
  return text.trim().split(/\s+/).map(w => w[0] ?? '').join('').toUpperCase().slice(0, 2)
}

const AVATAR_COLORS = [
  'bg-blue-500', 'bg-violet-500', 'bg-rose-500', 'bg-amber-500',
  'bg-emerald-500', 'bg-cyan-500', 'bg-orange-500', 'bg-pink-500',
]
function avatarBg(text: string): string {
  let h = 0
  for (const c of text) h = ((h * 31 + c.charCodeAt(0)) >>> 0)
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}

function leadName(lead: Lead): string {
  return [lead.vorname, lead.nachname].filter(Boolean).join(' ') || lead.email || '—'
}

function relTime(date: string): string {
  return formatDistanceToNow(new Date(date), { addSuffix: true, locale: de })
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

function Avatar({ name, size = 'sm' }: { name: string; size?: 'sm' | 'md' | 'lg' }) {
  const sz = size === 'lg' ? 'w-9 h-9 text-sm' : size === 'md' ? 'w-7 h-7 text-xs' : 'w-6 h-6 text-[10px]'
  return (
    <div className={cn(avatarBg(name), sz, 'rounded-full text-white font-bold flex items-center justify-center shrink-0 select-none')}>
      {initials(name)}
    </div>
  )
}

// ─── Score Badge ──────────────────────────────────────────────────────────────

function ScoreBadge({ score }: { score: number | null | undefined }) {
  if (score == null) return null
  const cls = score >= 80
    ? 'text-emerald-600 bg-emerald-50 border-emerald-200'
    : score >= 50
    ? 'text-amber-600 bg-amber-50 border-amber-200'
    : 'text-red-500 bg-red-50 border-red-200'
  const Icon = score >= 80 ? CheckCircle : score >= 50 ? AlertCircle : XCircle
  return (
    <div className={cn('inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full border', cls)}>
      <Icon size={10} />
      {score}%
    </div>
  )
}

// ─── Stage accent colors ──────────────────────────────────────────────────────

const STAGE_BORDER: Record<LeadStatus, string> = {
  neu:           'border-l-slate-400',
  kontaktiert:   'border-l-blue-400',
  termin:        'border-l-violet-400',
  angebot:       'border-l-amber-400',
  auftrag:       'border-l-green-400',
  abgeschlossen: 'border-l-emerald-500',
  verloren:      'border-l-red-400',
}

const STAGE_DOT: Record<LeadStatus, string> = {
  neu:           'bg-slate-400',
  kontaktiert:   'bg-blue-400',
  termin:        'bg-violet-500',
  angebot:       'bg-amber-400',
  auftrag:       'bg-green-500',
  abgeschlossen: 'bg-emerald-500',
  verloren:      'bg-red-400',
}

// ─── Kanban Card ──────────────────────────────────────────────────────────────

function KanbanCard({
  lead, dragging, onDragStart, onDragEnd, onClick, onDelete,
}: {
  lead: Lead
  dragging: boolean
  onDragStart: (e: React.DragEvent) => void
  onDragEnd: () => void
  onClick: () => void
  onDelete: () => void
}) {
  const name = leadName(lead)
  const isExpired = lead.termin_datum
    && new Date(lead.termin_datum) < new Date()
    && !['auftrag', 'abgeschlossen', 'verloren'].includes(lead.status)

  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null)
  const [confirmDel, setConfirmDel] = useState(false)

  function handleContextMenu(e: React.MouseEvent) {
    e.preventDefault()
    setCtxMenu({ x: e.clientX, y: e.clientY })
  }

  function handleDoubleClick(e: React.MouseEvent) {
    e.stopPropagation()
    setConfirmDel(true)
  }

  return (
    <>
      {/* Context menu */}
      {ctxMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setCtxMenu(null)} />
          <div
            className="fixed z-50 bg-white border border-slate-200 rounded-xl shadow-xl py-1 min-w-[160px]"
            style={{ left: ctxMenu.x, top: ctxMenu.y }}
          >
            <button
              onClick={() => { setCtxMenu(null); onClick() }}
              className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
            >
              Lead öffnen
            </button>
            <div className="h-px bg-slate-100 my-1" />
            <button
              onClick={() => { setCtxMenu(null); setConfirmDel(true) }}
              className="w-full text-left px-4 py-2 text-sm text-red-500 hover:bg-red-50 transition-colors flex items-center gap-2"
            >
              <Trash2 size={13} /> Lead löschen
            </button>
          </div>
        </>
      )}

      {/* Delete confirm */}
      {confirmDel && (
        <>
          <div className="fixed inset-0 z-40 bg-black/20" onClick={() => setConfirmDel(false)} />
          <div className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white border border-slate-200 rounded-2xl shadow-2xl p-5 w-72">
            <p className="text-sm font-semibold text-slate-800 mb-1">Lead löschen?</p>
            <p className="text-xs text-slate-500 mb-4">„{name}" wird unwiderruflich gelöscht.</p>
            <div className="flex gap-2">
              <button onClick={() => { setConfirmDel(false); onDelete() }} className="flex-1 py-2 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-semibold transition-colors">Löschen</button>
              <button onClick={() => setConfirmDel(false)} className="flex-1 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-sm text-slate-600 transition-colors">Abbrechen</button>
            </div>
          </div>
        </>
      )}

    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      onContextMenu={handleContextMenu}
      onDoubleClick={handleDoubleClick}
      className={cn(
        'group bg-white rounded-2xl border-l-4 shadow-sm select-none',
        'cursor-grab active:cursor-grabbing',
        'hover:shadow-md hover:-translate-y-0.5 transition-all duration-150',
        dragging && 'opacity-30 scale-95',
        STAGE_BORDER[lead.status],
      )}
    >
      <div className="p-3">
        {/* Row 1: Name + Avatar */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <p className="text-[13px] font-bold text-slate-800 leading-snug line-clamp-2 group-hover:text-accent-600 transition-colors">
            {name}
          </p>
          {lead.zugewiesen_an ? (
            <Avatar name={lead.zugewiesen_an} size="sm" />
          ) : (
            <div className="w-6 h-6 rounded-full border-2 border-dashed border-slate-200 flex items-center justify-center shrink-0">
              <User size={8} className="text-slate-300" />
            </div>
          )}
        </div>

        {/* Row 2: Contact info */}
        <div className="space-y-0.5 mb-2">
          {lead.email && (
            <p className="text-[11px] text-slate-400 truncate flex items-center gap-1">
              <Mail size={9} className="shrink-0" />{lead.email}
            </p>
          )}
          {lead.telefon && (
            <p className="text-[11px] text-slate-400 truncate flex items-center gap-1">
              <Phone size={9} className="shrink-0" />{lead.telefon}
            </p>
          )}
          {(lead.plz || lead.bundesland) && (
            <p className="text-[11px] text-slate-400 flex items-center gap-1">
              <MapPin size={9} className="shrink-0" />
              {[lead.plz, lead.bundesland].filter(Boolean).join(' ')}
            </p>
          )}
          {lead.anlagengroesse && (
            <p className="text-[11px] text-slate-400 flex items-center gap-1">
              <Zap size={9} className="shrink-0 text-amber-400" />{lead.anlagengroesse}
            </p>
          )}
        </div>

        {/* Row 3: Badges */}
        {(lead.utm_source || lead.termin_datum) && (
          <div className="flex flex-wrap gap-1">
            {lead.utm_source && (
              <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-semibold tracking-wide">
                {lead.utm_source.toUpperCase()}
              </span>
            )}
            {isExpired && (
              <span className="text-[10px] bg-red-50 text-red-500 border border-red-200 px-2 py-0.5 rounded-full font-semibold">
                Termin abgelaufen
              </span>
            )}
            {lead.termin_datum && !isExpired && (
              <span className="text-[10px] bg-violet-50 text-violet-600 border border-violet-200 px-2 py-0.5 rounded-full font-semibold flex items-center gap-0.5">
                <Calendar size={9} />
                {format(new Date(lead.termin_datum), 'dd.MM HH:mm')}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      {(lead.deal_wert || lead.lead_score != null) && (
        <div className="flex items-center justify-between px-3 py-2 border-t border-slate-100 bg-slate-50/60 rounded-b-2xl">
          <ScoreBadge score={lead.lead_score} />
          {lead.deal_wert ? (
            <span className="text-[11px] font-bold text-slate-600">
              € {lead.deal_wert.toLocaleString('de-AT')}
            </span>
          ) : <span />}
        </div>
      )}
    </div>
    </>
  )
}

// ─── Kanban Column ────────────────────────────────────────────────────────────

function KanbanColumn({
  stage, leads, label, isOver, draggingId,
  onDragOver, onDragLeave, onDrop, onDragStart, onDragEnd, onCardClick,
  onRenameStage, onDeleteLead,
}: {
  stage: LeadStatus
  leads: Lead[]
  label: string
  isOver: boolean
  draggingId: string | null
  onDragOver: (e: React.DragEvent) => void
  onDragLeave: () => void
  onDrop: (e: React.DragEvent) => void
  onDragStart: (e: React.DragEvent, id: string) => void
  onDragEnd: () => void
  onCardClick: (id: string) => void
  onRenameStage: (status: LeadStatus, label: string) => void
  onDeleteLead: (id: string) => void
}) {
  const totalValue = leads.reduce((s, l) => s + (l.deal_wert ?? 0), 0)
  const [editing, setEditing] = useState(false)
  const [editVal, setEditVal] = useState(label)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { setEditVal(label) }, [label])

  function startEdit() { setEditing(true); setTimeout(() => inputRef.current?.select(), 30) }
  function commitEdit() {
    setEditing(false)
    if (editVal.trim() && editVal.trim() !== label) onRenameStage(stage, editVal.trim())
    else setEditVal(label)
  }

  return (
    <div className="flex-shrink-0 w-[240px] flex flex-col">
      {/* Column header */}
      <div className="mb-3">
        <div className="flex items-center justify-between gap-1">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className={cn('w-2.5 h-2.5 rounded-full shrink-0', STAGE_DOT[stage])} />
            {editing ? (
              <input
                ref={inputRef}
                value={editVal}
                onChange={e => setEditVal(e.target.value)}
                onBlur={commitEdit}
                onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') { setEditing(false); setEditVal(label) } }}
                className="text-[13px] font-bold text-slate-700 bg-white border border-accent-400 rounded px-1.5 py-0.5 w-full outline-none focus:ring-1 focus:ring-accent-400"
              />
            ) : (
              <button
                onDoubleClick={startEdit}
                title="Doppelklick zum Umbenennen"
                className="text-[13px] font-bold text-slate-700 hover:text-accent-600 transition-colors text-left truncate group flex items-center gap-1"
              >
                {label}
                <Pencil size={10} className="opacity-0 group-hover:opacity-40 shrink-0" />
              </button>
            )}
          </div>
          <span className="text-[11px] text-slate-400 font-bold bg-slate-100 px-2 py-0.5 rounded-full min-w-[24px] text-center shrink-0">
            {leads.length}
          </span>
        </div>
        {totalValue > 0 && (
          <p className="text-[11px] text-slate-400 font-medium mt-1 pl-4">
            Σ € {totalValue.toLocaleString('de-AT')}
          </p>
        )}
      </div>

      {/* Drop zone */}
      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={cn(
          'flex flex-col gap-2 flex-1 min-h-[200px] rounded-2xl p-2 transition-all duration-150',
          isOver ? 'bg-accent-50 ring-2 ring-accent-400/60' : 'bg-slate-100/60',
        )}
      >
        {leads.map(lead => (
          <KanbanCard
            key={lead.id}
            lead={lead}
            dragging={draggingId === lead.id}
            onDragStart={e => onDragStart(e, lead.id)}
            onDragEnd={onDragEnd}
            onClick={() => onCardClick(lead.id)}
            onDelete={() => onDeleteLead(lead.id)}
          />
        ))}
        {leads.length === 0 && (
          <div className={cn(
            'flex items-center justify-center h-16 rounded-xl border-2 border-dashed transition-colors',
            isOver ? 'border-accent-400' : 'border-slate-200/80',
          )}>
            <span className="text-[11px] text-slate-300 font-medium">Leer</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Kanban View ──────────────────────────────────────────────────────────────

function KanbanView({
  leads, labels, onStatusChange, onRenameStage, onDeleteLead,
}: {
  leads: Lead[]
  labels: Record<LeadStatus, string>
  onStatusChange: (id: string, status: LeadStatus) => void
  onRenameStage: (status: LeadStatus, label: string) => void
  onDeleteLead: (id: string) => void
}) {
  const navigate = useNavigate()
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragOverStage, setDragOverStage] = useState<LeadStatus | null>(null)

  function handleDragStart(e: React.DragEvent, id: string) {
    e.dataTransfer.setData('leadId', id)
    e.dataTransfer.effectAllowed = 'move'
    setDraggingId(id)
  }

  function handleDragOver(e: React.DragEvent, stage: LeadStatus) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverStage(stage)
  }

  function handleDrop(e: React.DragEvent, stage: LeadStatus) {
    e.preventDefault()
    const id = e.dataTransfer.getData('leadId')
    if (id) onStatusChange(id, stage)
    setDraggingId(null)
    setDragOverStage(null)
  }

  function handleDragEnd() {
    setDraggingId(null)
    setDragOverStage(null)
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-4 -mx-4 px-4">
      {PIPELINE_STAGES.map(stage => (
        <KanbanColumn
          key={stage}
          stage={stage}
          label={labels[stage]}
          leads={leads.filter(l => l.status === stage)}
          isOver={dragOverStage === stage}
          draggingId={draggingId}
          onDragOver={e => handleDragOver(e, stage)}
          onDragLeave={() => setDragOverStage(null)}
          onDrop={e => handleDrop(e, stage)}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onCardClick={id => navigate(`/crm/${id}`)}
          onRenameStage={onRenameStage}
          onDeleteLead={onDeleteLead}
        />
      ))}
    </div>
  )
}

// ─── List View ────────────────────────────────────────────────────────────────

function ListView({ leads, mitarbeiter, labels, onAssign, onDeleteLead }: {
  leads: Lead[]
  mitarbeiter: Mitarbeiter[]
  labels: Record<LeadStatus, string>
  onAssign: (id: string, name: string | null) => void
  onDeleteLead: (id: string) => void
}) {
  const navigate = useNavigate()
  const aktiveMa = mitarbeiter.filter(m => m.aktiv)
  const [confirmId, setConfirmId] = useState<string | null>(null)

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
      {/* Header */}
      <div className="grid items-center gap-4 px-5 py-3 bg-slate-50 border-b border-slate-200"
        style={{ gridTemplateColumns: '1fr 120px 100px 130px 190px 36px' }}>
        {['Name', 'Status', 'Score', 'Eingegangen', 'Zugewiesen', ''].map(h => (
          <span key={h} className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">{h}</span>
        ))}
      </div>

      {leads.length === 0 ? (
        <div className="flex items-center justify-center py-16 text-sm text-slate-400">
          Keine Leads gefunden
        </div>
      ) : (
        leads.map((lead, i) => {
          const name = leadName(lead)
          return (
            <div
              key={lead.id}
              onClick={() => navigate(`/crm/${lead.id}`)}
              className={cn(
                'grid items-center gap-4 px-5 py-3 cursor-pointer transition-colors hover:bg-slate-50',
                i !== leads.length - 1 && 'border-b border-slate-100',
              )}
              style={{ gridTemplateColumns: '1fr 120px 100px 130px 190px 36px' }}
            >
              {/* Name */}
              <div className="flex items-center gap-3 min-w-0">
                <Avatar name={name} size="md" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">{name}</p>
                  {lead.email && (
                    <p className="text-[11px] text-slate-400 truncate">{lead.email}</p>
                  )}
                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                    {lead.plz && (
                      <span className="text-[10px] text-slate-400">
                        {lead.plz} {lead.bundesland}
                      </span>
                    )}
                    {lead.utm_source && (
                      <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-semibold tracking-wide">
                        {lead.utm_source.toUpperCase()}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Status */}
              <span className={cn(
                'text-[10px] font-bold px-2.5 py-1 rounded-full whitespace-nowrap w-fit',
                LEAD_STATUS_COLORS[lead.status],
              )}>
                {labels[lead.status]}
              </span>

              {/* Score */}
              <div><ScoreBadge score={lead.lead_score} /></div>

              {/* Time */}
              <span className="text-xs text-slate-400 whitespace-nowrap">
                {relTime(lead.created_at)}
              </span>

              {/* Assignee dropdown */}
              <div onClick={e => e.stopPropagation()}>
                <Select
                  value={lead.zugewiesen_an ?? '__none__'}
                  onValueChange={v => onAssign(lead.id, v === '__none__' ? null : v)}
                >
                  <SelectTrigger className={cn(
                    'h-8 text-xs border rounded-xl px-2.5 w-full transition-colors',
                    lead.zugewiesen_an
                      ? 'border-slate-200 bg-white text-slate-700'
                      : 'border-dashed border-slate-200 bg-transparent text-slate-400',
                  )}>
                    {lead.zugewiesen_an ? (
                      <div className="flex items-center gap-1.5 min-w-0">
                        <Avatar name={lead.zugewiesen_an} size="sm" />
                        <span className="truncate font-medium">{lead.zugewiesen_an}</span>
                      </div>
                    ) : (
                      <SelectValue placeholder="Nicht zugewiesen" />
                    )}
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">
                      <span className="text-slate-400 italic">Nicht zugewiesen</span>
                    </SelectItem>
                    {aktiveMa.map(m => (
                      <SelectItem key={m.id} value={m.name}>
                        <div className="flex items-center gap-2">
                          <Avatar name={m.name} size="sm" />
                          {m.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Delete */}
              <div onClick={e => e.stopPropagation()}>
                {confirmId === lead.id ? (
                  <button
                    onClick={() => { setConfirmId(null); onDeleteLead(lead.id) }}
                    className="w-8 h-8 rounded-lg bg-red-500 hover:bg-red-600 text-white flex items-center justify-center transition-colors"
                    title="Bestätigen"
                  >
                    <Trash2 size={13} />
                  </button>
                ) : (
                  <button
                    onClick={() => setConfirmId(lead.id)}
                    className="w-8 h-8 rounded-lg text-slate-300 hover:bg-red-50 hover:text-red-500 flex items-center justify-center transition-colors"
                    title="Löschen"
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            </div>
          )
        })
      )}
    </div>
  )
}

// ─── Kalender View ────────────────────────────────────────────────────────────

function KalenderView({ leads }: { leads: Lead[] }) {
  const navigate = useNavigate()
  const [currentMonth, setCurrentMonth] = useState(new Date())

  const monthStart = startOfMonth(currentMonth)
  const monthEnd = endOfMonth(currentMonth)
  const calStart = startOfWeek(monthStart, { weekStartsOn: 1 })
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 })
  const days = eachDayOfInterval({ start: calStart, end: calEnd })
  const leadsWithTermin = leads.filter(l => l.termin_datum)
  const DOW = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-ink">
          {format(currentMonth, 'MMMM yyyy', { locale: de })}
        </h2>
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7"
            onClick={() => setCurrentMonth(m => new Date(m.getFullYear(), m.getMonth() - 1, 1))}>
            <ChevronLeft size={14} />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7"
            onClick={() => setCurrentMonth(m => new Date(m.getFullYear(), m.getMonth() + 1, 1))}>
            <ChevronRight size={14} />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-px bg-slate-200 rounded-xl overflow-hidden shadow-sm text-sm">
        {DOW.map(d => (
          <div key={d} className="bg-slate-50 text-center py-2 text-xs font-semibold text-slate-400">{d}</div>
        ))}
        {days.map(day => {
          const dayLeads = leadsWithTermin.filter(l => isSameDay(new Date(l.termin_datum!), day))
          const isCurMonth = day.getMonth() === currentMonth.getMonth()
          return (
            <div key={day.toISOString()} className={cn('bg-white min-h-[80px] p-1.5', !isCurMonth && 'bg-slate-50/70')}>
              <span className={cn(
                'text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full mb-1',
                isToday(day) ? 'bg-accent-500 text-white font-bold' : isCurMonth ? 'text-slate-700' : 'text-slate-300',
              )}>
                {format(day, 'd')}
              </span>
              {dayLeads.map(lead => {
                const name = leadName(lead)
                return (
                  <button
                    key={lead.id}
                    onClick={() => navigate(`/crm/${lead.id}`)}
                    className={cn(
                      'w-full text-left text-[10px] font-semibold px-1.5 py-0.5 rounded truncate mb-0.5',
                      LEAD_STATUS_COLORS[lead.status],
                    )}
                    title={`${name} — ${format(new Date(lead.termin_datum!), 'HH:mm')}`}
                  >
                    {format(new Date(lead.termin_datum!), 'HH:mm')} {name}
                  </button>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Analytics View ───────────────────────────────────────────────────────────

const FUNNEL_STAGE_ORDER: LeadStatus[] = ['neu', 'kontaktiert', 'termin', 'angebot', 'auftrag', 'abgeschlossen']


function AnalyticsView({ leads, labels }: { leads: Lead[]; labels: Record<LeadStatus, string> }) {
  const { isAdmin } = useRole()

  // Available months from lead data
  const months = useMemo(() => {
    const set = new Set(leads.map(l => l.created_at?.slice(0, 7)).filter(Boolean))
    return Array.from(set).sort().reverse()
  }, [leads])

  const setters = useMemo(() => {
    const set = new Set(leads.map(l => l.zugewiesen_an).filter(Boolean)) as Set<string>
    return Array.from(set).sort()
  }, [leads])

  const [monat, setMonat] = useState('alle')
  const [setter, setSetter] = useState('alle')

  const filtered = useMemo(() => {
    let f = leads
    if (monat !== 'alle') f = f.filter(l => l.created_at?.startsWith(monat))
    if (setter !== 'alle') f = f.filter(l => (l.zugewiesen_an ?? '') === setter)
    return f
  }, [leads, monat, setter])

  const total = filtered.length
  const auftraege = filtered.filter(l => l.status === 'auftrag' || l.status === 'abgeschlossen').length
  const verloren = filtered.filter(l => l.status === 'verloren').length
  const gesamtwert = filtered.reduce((s, l) => s + (l.deal_wert ?? 0), 0)
  const auftragswert = filtered
    .filter(l => l.status === 'auftrag' || l.status === 'abgeschlossen')
    .reduce((s, l) => s + (l.deal_wert ?? 0), 0)
  const conversionRate = total > 0 ? Math.round((auftraege / total) * 100) : 0

  // Funnel: cumulative — how many leads reached each stage or beyond
  const STAGE_IDX = Object.fromEntries(FUNNEL_STAGE_ORDER.map((s, i) => [s, i]))
  const funnelData = FUNNEL_STAGE_ORDER.map(stage => {
    const idx = STAGE_IDX[stage]
    const count = filtered.filter(l => {
      if (l.status === 'verloren') return false
      return (STAGE_IDX[l.status] ?? -1) >= idx
    }).length
    return { stage, count }
  })

  // Monthly trend: leads per month + aufträge
  const trendData = useMemo(() => {
    const map = new Map<string, { leads: number; auftraege: number }>()
    for (const l of leads) {
      const m = l.created_at?.slice(0, 7)
      if (!m) continue
      if (!map.has(m)) map.set(m, { leads: 0, auftraege: 0 })
      const entry = map.get(m)!
      entry.leads++
      if (l.status === 'auftrag' || l.status === 'abgeschlossen') entry.auftraege++
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-6)
      .map(([month, v]) => ({ month: month.slice(5) + '/' + month.slice(2, 4), ...v }))
  }, [leads])

  const trendMax = Math.max(...trendData.map(d => d.leads), 1)

  const setterStats = useMemo(() =>
    Array.from(
      filtered.reduce((map, l) => {
        const key = l.zugewiesen_an || 'Nicht zugewiesen'
        if (!map.has(key)) map.set(key, { name: key, total: 0, auftraege: 0, wert: 0, termin: 0, angebot: 0, verloren: 0 })
        const e = map.get(key)!
        e.total++
        if (l.status === 'auftrag' || l.status === 'abgeschlossen') e.auftraege++
        if (l.status === 'termin') e.termin++
        if (l.status === 'angebot') e.angebot++
        if (l.status === 'verloren') e.verloren++
        e.wert += l.deal_wert ?? 0
        return map
      }, new Map<string, { name: string; total: number; auftraege: number; wert: number; termin: number; angebot: number; verloren: number }>())
      .values()
    ).sort((a, b) => b.auftraege - a.auftraege),
  [filtered])

  return (
    <div className="space-y-5">
      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <Select value={monat} onValueChange={setMonat}>
          <SelectTrigger className="h-8 text-xs w-36 bg-white border-slate-200">
            <SelectValue placeholder="Monat" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="alle">Alle Monate</SelectItem>
            {months.map(m => (
              <SelectItem key={m} value={m}>
                {format(new Date(m + '-01'), 'MMMM yyyy', { locale: de })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {isAdmin && setters.length > 0 && (
          <Select value={setter} onValueChange={setSetter}>
            <SelectTrigger className="h-8 text-xs w-40 bg-white border-slate-200">
              <SelectValue placeholder="Setter" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="alle">Alle Setter</SelectItem>
              {setters.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Leads gesamt', value: total.toString(), sub: 'Alle Phasen' },
          { label: 'Aufträge', value: auftraege.toString(), sub: `${conversionRate}% Conversion` },
          { label: 'Verloren', value: verloren.toString(), sub: total > 0 ? `${Math.round((verloren / total) * 100)}% Drop-off` : '—' },
          { label: 'Auftragswert', value: `€ ${auftragswert.toLocaleString('de-AT')}`, sub: `Σ € ${gesamtwert.toLocaleString('de-AT')} Pipeline` },
        ].map(kpi => (
          <div key={kpi.label} className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
            <p className="text-xs text-slate-400 mb-1">{kpi.label}</p>
            <p className="text-xl font-bold text-slate-800">{kpi.value}</p>
            <p className="text-[10px] text-slate-400 mt-0.5">{kpi.sub}</p>
          </div>
        ))}
      </div>

      {/* Conversion funnel */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Conversion-Trichter</p>
        {total === 0 ? (
          <p className="text-sm text-slate-400">Keine Daten für diesen Filter</p>
        ) : (
          <SvgFunnel data={funnelData} labels={labels} />
        )}
      </div>

      {/* Pipeline-Verteilung (Bar lines) */}
      {(() => {
        const stageStats = PIPELINE_STAGES.map(s => ({
          stage: s,
          count: filtered.filter(l => l.status === s).length,
          wert: filtered.filter(l => l.status === s).reduce((acc, l) => acc + (l.deal_wert ?? 0), 0),
        })).filter(s => s.count > 0)
        const maxC = Math.max(...stageStats.map(s => s.count), 1)
        if (stageStats.length === 0) return null
        return (
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Pipeline-Verteilung</p>
            <div className="space-y-3">
              {stageStats.map(s => (
                <div key={s.stage} className="flex items-center gap-3">
                  <span className={cn(
                    'text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 w-28 text-center',
                    LEAD_STATUS_COLORS[s.stage],
                  )}>
                    {labels[s.stage]}
                  </span>
                  <div className="flex-1 bg-slate-100 rounded-full h-2 overflow-hidden">
                    <div
                      className="h-2 rounded-full bg-accent-400 transition-all duration-700"
                      style={{ width: `${(s.count / maxC) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs font-bold text-slate-600 w-5 text-right">{s.count}</span>
                  {s.wert > 0 && (
                    <span className="text-[11px] text-slate-400 w-28 text-right">
                      € {s.wert.toLocaleString('de-AT')}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )
      })()}

      {/* Monthly trend */}
      {trendData.length > 1 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-5">Monatliche Entwicklung</p>
          <div className="flex items-end gap-2 h-28">
            {trendData.map(d => (
              <div key={d.month} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full flex flex-col-reverse gap-0.5" style={{ height: '88px' }}>
                  <div
                    className="w-full rounded-t bg-accent-400 transition-all duration-500"
                    style={{ height: `${(d.leads / trendMax) * 88}px` }}
                    title={`${d.leads} Leads`}
                  />
                  {d.auftraege > 0 && (
                    <div
                      className="w-full bg-emerald-400 rounded-sm"
                      style={{ height: `${(d.auftraege / trendMax) * 88}px`, marginTop: '-100%' }}
                    />
                  )}
                </div>
                <span className="text-[9px] text-slate-400 font-medium">{d.month}</span>
                <span className="text-[9px] text-slate-600 font-bold">{d.leads}</span>
              </div>
            ))}
          </div>
          <div className="flex gap-4 mt-3">
            <div className="flex items-center gap-1.5"><div className="w-3 h-2 rounded bg-accent-400" /><span className="text-[10px] text-slate-400">Leads</span></div>
            <div className="flex items-center gap-1.5"><div className="w-3 h-2 rounded bg-emerald-400" /><span className="text-[10px] text-slate-400">Aufträge</span></div>
          </div>
        </div>
      )}

      {/* Setter table */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Performance pro Setter</p>
        {setterStats.length === 0 ? (
          <p className="text-sm text-slate-400">Noch keine Daten</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  {['Setter', 'Leads', 'Termin', 'Angebot', 'Auftrag', 'Verloren', 'Conv.', 'Wert'].map(h => (
                    <th key={h} className="text-left text-[10px] font-bold text-slate-400 uppercase tracking-wide pb-2.5 pr-4">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {setterStats.map(s => {
                  const conv = s.total > 0 ? Math.round((s.auftraege / s.total) * 100) : 0
                  return (
                    <tr key={s.name} className="border-b border-slate-50 last:border-0">
                      <td className="py-2.5 pr-4">
                        <div className="flex items-center gap-2">
                          {s.name !== 'Nicht zugewiesen' && <Avatar name={s.name} size="sm" />}
                          <span className="font-semibold text-slate-700">{s.name}</span>
                        </div>
                      </td>
                      <td className="py-2.5 pr-4 text-slate-500">{s.total}</td>
                      <td className="py-2.5 pr-4 text-purple-600 font-medium">{s.termin}</td>
                      <td className="py-2.5 pr-4 text-amber-600 font-medium">{s.angebot}</td>
                      <td className="py-2.5 pr-4 text-emerald-600 font-bold">{s.auftraege}</td>
                      <td className="py-2.5 pr-4 text-red-400">{s.verloren}</td>
                      <td className="py-2.5 pr-4">
                        <span className={cn(
                          'text-[10px] font-bold px-1.5 py-0.5 rounded-full',
                          conv >= 50 ? 'bg-emerald-50 text-emerald-600' :
                          conv >= 25 ? 'bg-amber-50 text-amber-600' :
                          'bg-red-50 text-red-500',
                        )}>
                          {conv}%
                        </span>
                      </td>
                      <td className="py-2.5 font-semibold text-slate-700">
                        {s.wert > 0 ? `€ ${s.wert.toLocaleString('de-AT')}` : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── CrmPage ──────────────────────────────────────────────────────────────────

export function CrmPage() {
  const navigate = useNavigate()
  const { isAdmin, isSetter, setterName } = useRole()
  const { data: leads = [], isLoading } = useLeads(isSetter ? setterName : null)
  const { mutate: updateLead } = useUpdateLead()
  const { mutate: deleteLead } = useDeleteLead()
  const { labels, updateLabel } = useStageLabels()
  const { data: mitarbeiter = [] } = useMitarbeiterAll()
  const { mutate: createBenachrichtigung } = useCreateBenachrichtigung()
  const [view, setView] = useState<View>('kanban')
  const [setterFilter, setSetterFilter] = useState('alle')
  const [search, setSearch] = useState('')

  function handleAssign(id: string, name: string | null) {
    const lead = leads.find(l => l.id === id)
    updateLead({ id, zugewiesen_an: name }, {
      onSuccess: () => {
        toast.success(name ? `Zugewiesen an ${name}` : 'Zuweisung entfernt')
        if (name && lead) {
          // Setter benachrichtigen
          createBenachrichtigung({
            empfaenger: name,
            typ: 'zuweisung',
            titel: `Neuer Lead zugewiesen: ${leadName(lead)}`,
            nachricht: lead.email ?? lead.plz ?? undefined,
            lead_id: id,
          })
        }
      },
    })
  }

  const setter = Array.from(new Set(leads.map(l => l.zugewiesen_an).filter(Boolean))) as string[]

  let filtered = leads
  // Admin-Filter nur für Admins sichtbar
  if (isAdmin) {
    if (setterFilter === 'unzugewiesen') filtered = filtered.filter(l => !l.zugewiesen_an)
    else if (setterFilter !== 'alle') filtered = filtered.filter(l => l.zugewiesen_an === setterFilter)
  }
  if (search.trim()) {
    const q = search.toLowerCase()
    filtered = filtered.filter(l =>
      leadName(l).toLowerCase().includes(q) ||
      (l.email ?? '').toLowerCase().includes(q) ||
      (l.plz ?? '').includes(q) ||
      (l.zugewiesen_an ?? '').toLowerCase().includes(q)
    )
  }

  function handleStatusChange(id: string, status: LeadStatus) {
    updateLead({ id, status })
  }

  function handleDeleteLead(id: string) {
    deleteLead(id, {
      onSuccess: () => toast.success('Lead gelöscht'),
      onError: (e) => toast.error(String(e)),
    })
  }

  const stageCount = PIPELINE_STAGES.reduce((acc, s) => {
    acc[s] = filtered.filter(l => l.status === s).length
    return acc
  }, {} as Record<LeadStatus, number>)

  const VIEWS = [
    { key: 'kanban' as View,   icon: LayoutGrid, label: 'Kanban'    },
    { key: 'liste' as View,    icon: List,       label: 'Liste'     },
    { key: 'kalender' as View, icon: Calendar,   label: 'Kalender'  },
    { key: 'analytics' as View, icon: BarChart2, label: 'Analytics', adminOnly: true },
  ].filter(v => !v.adminOnly || isAdmin)

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <PageTitle title="CRM" subtitle={`${filtered.length} Leads`} />
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-slate-100 rounded-xl p-0.5 gap-0.5">
            {VIEWS.map(v => (
              <button
                key={v.key}
                onClick={() => setView(v.key)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all',
                  view === v.key
                    ? 'bg-white shadow-sm text-slate-800'
                    : 'text-slate-400 hover:text-slate-600',
                )}
              >
                <v.icon size={13} />
                {v.label}
              </button>
            ))}
          </div>
          {isAdmin && (
            <Button size="sm" onClick={() => navigate('/crm/neu')} className="shadow-sm">
              <Plus size={14} className="mr-1.5" />
              Neuer Lead
            </Button>
          )}
        </div>
      </div>

      {/* Search + Setter filter */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Suche..."
            className="pl-9 h-8 text-sm w-52 bg-white border-slate-200"
          />
        </div>
        {isAdmin && (
          <div className="flex gap-1.5 flex-wrap">
            {[
              { value: 'alle', label: 'Alle', icon: false },
              { value: 'unzugewiesen', label: 'Nicht zugewiesen', icon: false },
              ...setter.map(s => ({ value: s, label: s, icon: true })),
            ].map(opt => (
              <button
                key={opt.value}
                onClick={() => setSetterFilter(opt.value)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all border',
                  setterFilter === opt.value
                    ? 'bg-accent-500 text-white border-accent-500 shadow-sm'
                    : 'bg-white text-slate-500 border-slate-200 hover:border-accent-300 hover:text-slate-700',
                )}
              >
                {opt.icon && <Avatar name={opt.value} size="sm" />}
                {opt.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Stage stats */}
      {view !== 'analytics' && (
        <div className="flex gap-1.5 mb-5 overflow-x-auto pb-1">
          {PIPELINE_STAGES.map(s => (
            <div key={s} className="flex-shrink-0 flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2 shadow-sm">
              <span className={cn('w-2 h-2 rounded-full shrink-0', STAGE_DOT[s])} />
              <div>
                <p className="text-sm font-bold text-slate-800 leading-none">{stageCount[s]}</p>
                <p className="text-[10px] text-slate-400 font-medium mt-0.5">{labels[s]}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* View */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 border-2 border-accent-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : view === 'kanban' ? (
        <KanbanView
          leads={filtered}
          labels={labels}
          onStatusChange={handleStatusChange}
          onRenameStage={updateLabel}
          onDeleteLead={handleDeleteLead}
        />
      ) : view === 'liste' ? (
        <ListView leads={filtered} mitarbeiter={mitarbeiter} labels={labels} onAssign={handleAssign} onDeleteLead={handleDeleteLead} />
      ) : view === 'analytics' ? (
        <AnalyticsView leads={filtered} labels={labels} />
      ) : (
        <KalenderView leads={filtered} />
      )}
    </div>
  )
}
