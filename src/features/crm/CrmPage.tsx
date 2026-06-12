import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isToday, startOfWeek, endOfWeek } from 'date-fns'
import { de } from 'date-fns/locale'
import { Plus, ChevronLeft, ChevronRight, Phone, Mail, Calendar, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PageTitle } from '@/components/shared/PageTitle'
import { Button } from '@/components/ui/button'
import { useLeads, LEAD_STATUS_LABELS, LEAD_STATUS_COLORS, PIPELINE_STAGES } from './useLeads'
import type { Lead, LeadStatus } from '@/types/database'

type Tab = 'pipeline' | 'kalender'

// ─── Lead Card ───────────────────────────────────────────────────────────────

function LeadCard({ lead }: { lead: Lead }) {
  const navigate = useNavigate()
  const name = [lead.vorname, lead.nachname].filter(Boolean).join(' ') || lead.email || '—'

  return (
    <div
      onClick={() => navigate(`/crm/${lead.id}`)}
      className="bg-bg-surface border border-border rounded-lg p-3 cursor-pointer hover:border-accent-300 hover:shadow-sm transition-all group"
    >
      <p className="text-sm font-medium text-ink truncate group-hover:text-accent-600">{name}</p>
      {lead.anlagengroesse && (
        <p className="text-xs text-ink-muted truncate mt-0.5 flex items-center gap-1">
          <Zap size={10} className="shrink-0" />
          {lead.anlagengroesse}
        </p>
      )}
      <div className="flex items-center gap-2 mt-2">
        {lead.telefon && (
          <a
            href={`tel:${lead.telefon}`}
            onClick={e => e.stopPropagation()}
            className="text-ink-subtle hover:text-accent-600 transition-colors"
          >
            <Phone size={12} />
          </a>
        )}
        {lead.email && (
          <a
            href={`mailto:${lead.email}`}
            onClick={e => e.stopPropagation()}
            className="text-ink-subtle hover:text-accent-600 transition-colors"
          >
            <Mail size={12} />
          </a>
        )}
        {lead.termin_datum && (
          <span className="text-[10px] text-purple-600 ml-auto flex items-center gap-0.5">
            <Calendar size={10} />
            {format(new Date(lead.termin_datum), 'dd.MM HH:mm')}
          </span>
        )}
      </div>
      {lead.plz && (
        <p className="text-[10px] text-ink-subtle mt-1">{lead.plz} {lead.bundesland}</p>
      )}
    </div>
  )
}

// ─── Pipeline (Kanban) ────────────────────────────────────────────────────────

function PipelineView({ leads }: { leads: Lead[] }) {
  return (
    <div className="flex gap-3 overflow-x-auto pb-4 -mx-4 px-4">
      {PIPELINE_STAGES.map(stage => {
        const stageLeads = leads.filter(l => l.status === stage)
        return (
          <div key={stage} className="flex-shrink-0 w-52">
            <div className="flex items-center justify-between mb-2">
              <span className={cn(
                'text-xs font-semibold px-2 py-0.5 rounded-full',
                LEAD_STATUS_COLORS[stage]
              )}>
                {LEAD_STATUS_LABELS[stage]}
              </span>
              <span className="text-xs text-ink-subtle font-medium">{stageLeads.length}</span>
            </div>
            <div className="flex flex-col gap-2 min-h-[120px]">
              {stageLeads.map(lead => (
                <LeadCard key={lead.id} lead={lead} />
              ))}
              {stageLeads.length === 0 && (
                <div className="border-2 border-dashed border-border rounded-lg h-20 flex items-center justify-center">
                  <span className="text-xs text-ink-subtle">Leer</span>
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Kalender ────────────────────────────────────────────────────────────────

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
      {/* Month navigation */}
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

      {/* Grid */}
      <div className="grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden text-sm">
        {DOW.map(d => (
          <div key={d} className="bg-bg-muted text-center py-2 text-xs font-medium text-ink-muted">{d}</div>
        ))}
        {days.map(day => {
          const dayLeads = leadsWithTermin.filter(l => isSameDay(new Date(l.termin_datum!), day))
          const isCurrentMonth = day.getMonth() === currentMonth.getMonth()
          return (
            <div
              key={day.toISOString()}
              className={cn(
                'bg-bg-surface min-h-[80px] p-1.5',
                !isCurrentMonth && 'bg-bg-muted/50'
              )}
            >
              <span className={cn(
                'text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full mb-1',
                isToday(day) ? 'bg-accent-500 text-white' : isCurrentMonth ? 'text-ink' : 'text-ink-subtle'
              )}>
                {format(day, 'd')}
              </span>
              {dayLeads.map(lead => {
                const name = [lead.vorname, lead.nachname].filter(Boolean).join(' ') || lead.email || '—'
                return (
                  <button
                    key={lead.id}
                    onClick={() => navigate(`/crm/${lead.id}`)}
                    className={cn(
                      'w-full text-left text-[10px] font-medium px-1.5 py-0.5 rounded truncate mb-0.5',
                      LEAD_STATUS_COLORS[lead.status]
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

// ─── CrmPage ─────────────────────────────────────────────────────────────────

export function CrmPage() {
  const navigate = useNavigate()
  const { data: leads = [], isLoading } = useLeads()
  const [tab, setTab] = useState<Tab>('pipeline')

  const statusCounts = PIPELINE_STAGES.reduce((acc, s) => {
    acc[s] = leads.filter(l => l.status === s).length
    return acc
  }, {} as Record<LeadStatus, number>)

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <PageTitle title="CRM" subtitle={`${leads.length} Leads gesamt`} />
        <Button size="sm" onClick={() => navigate('/crm/neu')}>
          <Plus size={14} className="mr-1.5" />
          Neuer Lead
        </Button>
      </div>

      {/* Stats row */}
      <div className="flex gap-2 mb-5 overflow-x-auto pb-1">
        {(['neu', 'kontaktiert', 'termin', 'angebot', 'auftrag'] as LeadStatus[]).map(s => (
          <div key={s} className={cn('flex-shrink-0 px-3 py-2 rounded-lg text-center min-w-[80px]', LEAD_STATUS_COLORS[s])}>
            <p className="text-lg font-bold">{statusCounts[s]}</p>
            <p className="text-[10px] font-medium">{LEAD_STATUS_LABELS[s]}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-border">
        {(['pipeline', 'kalender'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px',
              tab === t
                ? 'border-accent-500 text-accent-600'
                : 'border-transparent text-ink-muted hover:text-ink'
            )}
          >
            {t === 'pipeline' ? 'Pipeline' : 'Kalender'}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 border-2 border-accent-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : tab === 'pipeline' ? (
        <PipelineView leads={leads} />
      ) : (
        <KalenderView leads={leads} />
      )}
    </div>
  )
}
