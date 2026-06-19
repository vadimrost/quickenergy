import { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { format } from 'date-fns'
import { de } from 'date-fns/locale'
import {
  ArrowLeft, Trash2, UserPlus, Phone, Mail, MapPin, Zap,
  Battery, Clock, ExternalLink, Navigation, Calendar, Euro,
  Paperclip, Upload, Download, X, FileText, Image,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useLead, useUpdateLead, useDeleteLead, LEAD_STATUS_LABELS } from './useLeads'
import { useAddAktivitaet } from './useLeadAktivitaeten'
import { AktivitaetTimeline } from './AktivitaetTimeline'
import { useCreateBenachrichtigung } from './useBenachrichtigungen'
import { useMitarbeiterAll } from '@/features/mitarbeiter/useMitarbeiterCrud'
import { useLeadDateien, useUploadLeadDatei, useDeleteLeadDatei, useDownloadDatei } from './useLeadDateien'
import { useStageLabels } from './useStageLabels'
import type { Lead, LeadStatus, Kunde } from '@/types/database'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildAddress(lead: Pick<Lead, 'strasse' | 'hausnummer' | 'plz' | 'ort' | 'bundesland'>): string | null {
  const street = [lead.strasse, lead.hausnummer].filter(Boolean).join(' ')
  const city = [lead.plz, lead.ort || lead.bundesland].filter(Boolean).join(' ')
  const parts = [street, city, 'Österreich'].filter(Boolean)
  return parts.length >= 2 ? parts.join(', ') : null
}

function initials(text: string): string {
  return text.trim().split(/\s+/).map(w => w[0] ?? '').join('').toUpperCase().slice(0, 2)
}

// ─── Status Stepper ───────────────────────────────────────────────────────────

const FORWARD: LeadStatus[] = ['neu', 'kontaktiert', 'termin', 'angebot', 'auftrag', 'abgeschlossen']

function StatusStepper({ status, onChange }: { status: LeadStatus; onChange: (s: LeadStatus) => void }) {
  const activeIdx = FORWARD.indexOf(status)
  const { labels } = useStageLabels()

  return (
    <div className="flex items-center flex-wrap gap-y-2">
      {FORWARD.map((stage, i) => {
        const past = i < activeIdx
        const current = stage === status
        return (
          <div key={stage} className="flex items-center">
            <button
              onClick={() => onChange(stage)}
              title={labels[stage]}
              className="flex flex-col items-center gap-1.5 group"
            >
              <div className={cn(
                'w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all',
                current
                  ? 'bg-accent-500 border-accent-500 scale-125 shadow-md shadow-accent-200'
                  : past
                  ? 'bg-accent-100 border-accent-300'
                  : 'bg-white border-slate-200 group-hover:border-accent-300',
              )}>
                {past && <div className="w-2 h-2 rounded-full bg-accent-400" />}
              </div>
              <span className={cn(
                'text-[10px] font-semibold whitespace-nowrap transition-colors',
                current ? 'text-accent-600' : past ? 'text-slate-400' : 'text-slate-300 group-hover:text-slate-400',
              )}>
                {labels[stage]}
              </span>
            </button>
            {i < FORWARD.length - 1 && (
              <div className={cn('h-0.5 w-6 mx-1 mb-4 transition-colors', i < activeIdx ? 'bg-accent-300' : 'bg-slate-200')} />
            )}
          </div>
        )
      })}

      <button
        onClick={() => onChange('verloren')}
        className={cn(
          'ml-4 text-[11px] font-semibold px-3 py-1 rounded-full border transition-all',
          status === 'verloren'
            ? 'bg-red-50 text-red-600 border-red-200'
            : 'text-slate-400 border-slate-200 hover:border-red-200 hover:text-red-400',
        )}
      >
        {labels['verloren']}
      </button>
    </div>
  )
}

// ─── Map Section ──────────────────────────────────────────────────────────────

function LeadMapSection({ lead }: { lead: Lead }) {
  const address = buildAddress(lead)
  if (!address) return null
  const embedUrl = `https://maps.google.com/maps?q=${encodeURIComponent(address)}&output=embed&hl=de&z=14`
  const navUrl = `https://www.google.com/maps/dir//${encodeURIComponent(address)}`
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
      <iframe
        title="Standort"
        src={embedUrl}
        className="w-full h-52 border-0"
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
      />
      <div className="p-3.5 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-0.5">Objektadresse</p>
          <p className="text-xs text-slate-600 truncate font-medium">{address}</p>
        </div>
        <div className="flex gap-1.5 shrink-0">
          <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 border border-slate-200 hover:border-slate-300 rounded-xl px-3 py-1.5 transition-all font-medium">
            <MapPin size={11} /> Karte
          </a>
          <a href={navUrl} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs text-white bg-accent-500 hover:bg-accent-600 rounded-xl px-3 py-1.5 transition-all font-semibold shadow-sm">
            <Navigation size={11} /> Navigation
          </a>
        </div>
      </div>
    </div>
  )
}

// ─── Contact Row ──────────────────────────────────────────────────────────────

function ContactRow({ icon: Icon, value, action }: {
  icon: React.ElementType
  value: string | null | undefined
  action?: { label: string; href: string }
}) {
  if (!value) return null
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-slate-100 last:border-0">
      <div className="w-7 h-7 rounded-lg bg-slate-50 flex items-center justify-center shrink-0">
        <Icon size={13} className="text-slate-400" />
      </div>
      <span className="text-sm text-slate-700 flex-1 truncate">{value}</span>
      {action && (
        <a href={action.href} className="text-xs font-semibold text-accent-500 hover:text-accent-700 transition-colors shrink-0">
          {action.label}
        </a>
      )}
    </div>
  )
}

// ─── Projekt Grid Item ────────────────────────────────────────────────────────

function ProjektItem({ icon: Icon, label, value }: {
  icon: React.ElementType; label: string; value: string | null | undefined
}) {
  if (!value) return null
  return (
    <div className="flex items-start gap-3">
      <div className="w-7 h-7 rounded-lg bg-amber-50 flex items-center justify-center shrink-0 mt-0.5">
        <Icon size={12} className="text-amber-500" />
      </div>
      <div>
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">{label}</p>
        <p className="text-sm text-slate-700 font-medium mt-0.5">{value}</p>
      </div>
    </div>
  )
}

// ─── LeadDetailPage ───────────────────────────────────────────────────────────

export function LeadDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const isNew = id === 'neu'

  const { user } = useAuth()
  const currentUser = user?.user_metadata?.full_name ?? user?.email ?? null

  const { data: lead } = useLead(isNew ? undefined : id)
  const { mutate: updateLead, isPending: updating } = useUpdateLead()
  const { mutate: deleteLead, isPending: deleting } = useDeleteLead()
  const { mutate: addAktivitaet } = useAddAktivitaet()
  const { mutate: createBenachrichtigung } = useCreateBenachrichtigung()
  const { data: mitarbeiter = [] } = useMitarbeiterAll()

  const [notiz, setNotiz] = useState('')
  const [terminDatum, setTerminDatum] = useState('')
  const [terminZeit, setTerminZeit] = useState('')
  const [dealWert, setDealWert] = useState('')
  const [creatingAngebot, setCreatingAngebot] = useState(false)

  useEffect(() => {
    if (lead) {
      setNotiz(lead.notiz ?? '')
      setDealWert(lead.deal_wert != null ? String(lead.deal_wert) : '')
      if (lead.termin_datum) {
        const d = new Date(lead.termin_datum)
        setTerminDatum(d.toISOString().split('T')[0])
        setTerminZeit(d.toTimeString().slice(0, 5))
      } else {
        setTerminDatum('')
        setTerminZeit('')
      }
    }
  }, [lead])

  function handleStatusChange(status: LeadStatus) {
    if (!lead) return
    const previousStatus = lead.status
    const name = [lead.vorname, lead.nachname].filter(Boolean).join(' ') || lead.email || 'Lead'
    updateLead({ id: lead.id, status }, {
      onSuccess: () => {
        toast.success(LEAD_STATUS_LABELS[status])
        addAktivitaet({
          lead_id: lead.id,
          typ: 'status',
          inhalt: `${LEAD_STATUS_LABELS[previousStatus]} → ${LEAD_STATUS_LABELS[status]}`,
          meta: { von: previousStatus, nach: status },
          erstellt_von: currentUser,
        })
        // Admins benachrichtigen bei relevanten Status
        if (['termin', 'angebot', 'auftrag', 'abgeschlossen', 'verloren'].includes(status)) {
          createBenachrichtigung({
            empfaenger: 'admin',
            typ: 'status',
            titel: `${name}: ${LEAD_STATUS_LABELS[previousStatus]} → ${LEAD_STATUS_LABELS[status]}`,
            nachricht: lead.zugewiesen_an ? `Setter: ${lead.zugewiesen_an}` : undefined,
            lead_id: lead.id,
          })
        }
      },
      onError: e => toast.error(String(e)),
    })
  }

  function handleSaveNotiz() {
    if (!lead) return
    updateLead({ id: lead.id, notiz, deal_wert: dealWert ? parseFloat(dealWert) : null }, {
      onSuccess: () => {
        toast.success('Notiz gespeichert')
        if (notiz.trim()) {
          addAktivitaet({ lead_id: lead.id, typ: 'notiz', inhalt: notiz.trim(), erstellt_von: currentUser })
        }
      },
      onError: e => toast.error(String(e)),
    })
  }

  function handleSaveTermin() {
    if (!lead) return
    const termin_datum = terminDatum ? `${terminDatum}T${terminZeit || '00:00'}:00` : null
    const name = [lead.vorname, lead.nachname].filter(Boolean).join(' ') || lead.email || 'Lead'
    updateLead({ id: lead.id, termin_datum }, {
      onSuccess: () => {
        toast.success(termin_datum ? 'Termin gespeichert' : 'Termin entfernt')
        if (termin_datum) {
          const terminStr = format(new Date(termin_datum), "dd.MM.yyyy 'um' HH:mm 'Uhr'", { locale: de })
          addAktivitaet({
            lead_id: lead.id,
            typ: 'termin',
            inhalt: terminStr,
            erstellt_von: currentUser,
          })
          createBenachrichtigung({
            empfaenger: 'admin',
            typ: 'termin',
            titel: `Termin gesetzt: ${name}`,
            nachricht: terminStr + (lead.zugewiesen_an ? ` · ${lead.zugewiesen_an}` : ''),
            lead_id: lead.id,
          })
        }
      },
      onError: e => toast.error(String(e)),
    })
  }

  function handleDelete() {
    if (!lead || !window.confirm('Lead wirklich löschen?')) return
    deleteLead(lead.id, {
      onSuccess: () => { toast.success('Lead gelöscht'); navigate('/crm') },
      onError: e => toast.error(String(e)),
    })
  }

  async function handleCreateAngebot() {
    if (!lead) return
    setCreatingAngebot(true)
    try {
      let kunde: Kunde | null = lead.kunde ?? null
      if (!kunde) {
        const { data: newKunde, error: kundeError } = await supabase
          .from('kunden')
          .insert({
            vorname: lead.vorname, nachname: lead.nachname,
            email: lead.email, telefon: lead.telefon, plz: lead.plz, land: 'AT',
          })
          .select().single()
        if (kundeError) throw kundeError
        kunde = newKunde as Kunde
        await supabase.from('leads').update({ kunde_id: kunde.id }).eq('id', lead.id)
      }
      await supabase.from('leads').update({ status: 'angebot' }).eq('id', lead.id)
      toast.success('Angebot wird geöffnet')
      navigate('/angebote/neu', { state: { lead_id: lead.id, kunde } })
    } catch (e) {
      toast.error(String(e))
    } finally {
      setCreatingAngebot(false)
    }
  }

  if (isNew) return <NewLeadForm />

  if (!lead) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-6 h-6 border-2 border-accent-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const name = [lead.vorname, lead.nachname].filter(Boolean).join(' ') || lead.email || '—'
  const address = buildAddress(lead) ?? ([lead.plz, lead.bundesland].filter(Boolean).join(' ') || null)

  return (
    <div>
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between mb-6 gap-4">
        <div className="flex items-start gap-4 min-w-0">
          <button
            onClick={() => navigate('/crm')}
            className="mt-1.5 text-slate-400 hover:text-slate-700 transition-colors shrink-0"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-3 mb-0.5">
              {/* Avatar */}
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-accent-400 to-accent-600 flex items-center justify-center text-white font-bold text-sm shadow-md shadow-accent-200 shrink-0">
                {initials(name)}
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-900 leading-tight">{name}</h1>
                <p className="text-sm text-slate-400">
                  Lead · {format(new Date(lead.created_at), 'dd. MMMM yyyy', { locale: de })}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            onClick={handleCreateAngebot}
            disabled={creatingAngebot}
            className="bg-accent-500 hover:bg-accent-600 text-white shadow-sm shadow-accent-200"
            size="sm"
          >
            <UserPlus size={14} className="mr-1.5" />
            {lead.kunde_id ? 'Angebot erstellen' : 'Kunde + Angebot'}
          </Button>
          <Button
            variant="ghost" size="sm" onClick={handleDelete} disabled={deleting}
            className="text-red-400 hover:text-red-600 hover:bg-red-50 px-2.5"
          >
            <Trash2 size={14} />
          </Button>
        </div>
      </div>

      {/* ── Status Stepper ─────────────────────────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-2xl px-5 py-4 mb-6 shadow-sm">
        <StatusStepper status={lead.status} onChange={handleStatusChange} />
      </div>

      {/* ── Main Grid ──────────────────────────────────────────────────────── */}
      <div className="grid gap-5" style={{ gridTemplateColumns: '1fr 300px' }}>

        {/* ── Left column ─────────────────────────────────────────────────── */}
        <div className="space-y-5 min-w-0">

          {/* Contact */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Kontakt</h3>
            <ContactRow icon={Phone} value={lead.telefon}
              action={lead.telefon ? { label: 'Anrufen', href: `tel:${lead.telefon}` } : undefined} />
            <ContactRow icon={Mail} value={lead.email}
              action={lead.email ? { label: 'E-Mail', href: `mailto:${lead.email}` } : undefined} />
            <ContactRow icon={MapPin} value={address} />
          </div>

          {/* Projekt */}
          {(lead.anlagenort || lead.anlagengroesse || lead.batteriespeicher != null || lead.umsetzung) && (
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Projekt</h3>
              <div className="grid grid-cols-2 gap-4">
                <ProjektItem icon={MapPin} label="Anlagenort" value={lead.anlagenort} />
                <ProjektItem icon={Zap} label="Anlagengröße" value={lead.anlagengroesse} />
                <ProjektItem icon={Battery} label="Batteriespeicher"
                  value={lead.batteriespeicher == null ? null : lead.batteriespeicher ? 'Ja' : 'Nein'} />
                <ProjektItem icon={Clock} label="Umsetzung" value={lead.umsetzung} />
              </div>
            </div>
          )}

          {/* Kundennachricht */}
          {lead.nachricht && (
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Nachricht des Kunden</h3>
              <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-line">{lead.nachricht}</p>
            </div>
          )}

          {/* Notizen */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Notizen</h3>
            <textarea
              value={notiz}
              onChange={e => setNotiz(e.target.value)}
              rows={5}
              placeholder="Notizen zum Lead..."
              className="w-full text-sm bg-slate-50 border border-slate-200 rounded-xl p-3 resize-none focus:outline-none focus:ring-2 focus:ring-accent-400/30 focus:border-accent-400 text-slate-700 placeholder:text-slate-300 transition-all"
            />
            <Button size="sm" className="mt-3 bg-slate-800 hover:bg-slate-900 text-white text-xs"
              onClick={handleSaveNotiz} disabled={updating}>
              Speichern
            </Button>
          </div>

          {/* Datei-Anhänge */}
          <DateiAnhangSection leadId={lead.id} currentUser={currentUser} />

          {/* Verknüpfter Kunde */}
          {lead.kunde && (
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Verknüpfter Kunde</h3>
              <button
                onClick={() => navigate('/kunden')}
                className="flex items-center gap-2.5 text-sm text-accent-600 hover:text-accent-700 font-medium transition-colors group"
              >
                <div className="w-8 h-8 rounded-xl bg-accent-50 flex items-center justify-center">
                  <ExternalLink size={13} className="text-accent-500" />
                </div>
                {lead.kunde.firmenname || [lead.kunde.vorname, lead.kunde.nachname].filter(Boolean).join(' ')}
                <span className="text-slate-400 text-xs font-normal">#{lead.kunde.kundennummer}</span>
              </button>
            </div>
          )}

          {/* Aktivitäts-Timeline */}
          <AktivitaetTimeline leadId={lead.id} currentUser={currentUser} />
        </div>

        {/* ── Right sidebar ───────────────────────────────────────────────── */}
        <div className="space-y-4">

          {/* Map */}
          <LeadMapSection lead={lead} />

          {/* Zuweisung + Deal */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Zuweisung & Deal</h3>
            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-semibold text-slate-500 mb-1.5 block">Zugewiesen an</label>
                <Select
                  value={lead.zugewiesen_an ?? '__none__'}
                  onValueChange={v => {
                    const val = v === '__none__' ? null : v
                    updateLead({ id: lead.id, zugewiesen_an: val }, {
                      onSuccess: () => {
                        toast.success(val ? `Zugewiesen an ${val}` : 'Zuweisung entfernt')
                        addAktivitaet({ lead_id: lead.id, typ: 'zuweisung', inhalt: val ?? 'Nicht zugewiesen', erstellt_von: currentUser })
                      },
                    })
                  }}
                >
                  <SelectTrigger className="h-9 text-sm border-slate-200">
                    <SelectValue placeholder="Nicht zugewiesen" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Nicht zugewiesen</SelectItem>
                    {mitarbeiter.filter(m => m.aktiv).map(m => (
                      <SelectItem key={m.id} value={m.name}>{m.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-[11px] font-semibold text-slate-500 mb-1.5 flex items-center gap-1 block">
                  <Euro size={10} /> Deal-Wert (€)
                </label>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    value={dealWert}
                    onChange={e => setDealWert(e.target.value)}
                    placeholder="0"
                    className="text-sm h-9 border-slate-200"
                  />
                  <Button size="sm" variant="outline" className="h-9 px-3 shrink-0 border-slate-200"
                    onClick={() => {
                      const wert = dealWert ? parseFloat(dealWert) : null
                      updateLead({ id: lead.id, deal_wert: wert }, {
                        onSuccess: () => {
                          toast.success('Deal-Wert gespeichert')
                          addAktivitaet({ lead_id: lead.id, typ: 'deal', inhalt: wert != null ? String(wert) : '0', erstellt_von: currentUser })
                        },
                      })
                    }}
                    disabled={updating}
                  >
                    OK
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Termin */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <Calendar size={11} /> Termin
            </h3>
            <div className="grid grid-cols-2 gap-2 mb-3">
              <div>
                <label className="text-[11px] font-semibold text-slate-500 mb-1.5 block">Datum</label>
                <Input type="date" value={terminDatum} onChange={e => setTerminDatum(e.target.value)}
                  className="text-sm h-9 border-slate-200" />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-slate-500 mb-1.5 block">Uhrzeit</label>
                <Input type="time" value={terminZeit} onChange={e => setTerminZeit(e.target.value)}
                  className="text-sm h-9 border-slate-200" />
              </div>
            </div>
            {terminDatum && (
              <p className="text-[11px] text-accent-600 font-medium mb-2.5">
                {format(new Date(`${terminDatum}T${terminZeit || '00:00'}:00`), "EEE, dd.MM.yyyy 'um' HH:mm 'Uhr'", { locale: de })}
              </p>
            )}
            <Button size="sm" variant="outline" onClick={handleSaveTermin} disabled={updating}
              className="w-full border-slate-200 text-sm">
              Termin speichern
            </Button>
          </div>

          {/* UTM */}
          {(lead.utm_source || lead.utm_campaign) && (
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Marketing</h3>
              <div className="space-y-1.5">
                {[
                  { label: 'Source', value: lead.utm_source },
                  { label: 'Medium', value: lead.utm_medium },
                  { label: 'Campaign', value: lead.utm_campaign },
                ].filter(r => r.value).map(r => (
                  <div key={r.label} className="flex items-center justify-between">
                    <span className="text-[11px] text-slate-400 font-medium">{r.label}</span>
                    <span className="text-[11px] text-slate-600 bg-white border border-slate-200 px-2 py-0.5 rounded-md font-mono">
                      {r.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Datei-Anhang Section ─────────────────────────────────────────────────────

function DateiAnhangSection({ leadId, currentUser }: { leadId: string; currentUser: string | null }) {
  const { data: dateien = [], isLoading } = useLeadDateien(leadId)
  const { mutate: upload, isPending: uploading } = useUploadLeadDatei(leadId)
  const { mutate: remove } = useDeleteLeadDatei(leadId)
  const { mutate: download } = useDownloadDatei()
  const fileRef = useRef<HTMLInputElement>(null)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    upload(
      { file, erstellt_von: currentUser },
      {
        onSuccess: () => toast.success(`${file.name} hochgeladen`),
        onError: (err) => toast.error(String(err)),
      },
    )
    e.target.value = ''
  }

  function fileIcon(mime: string | null) {
    if (!mime) return FileText
    if (mime.startsWith('image/')) return Image
    return FileText
  }

  function formatBytes(bytes: number | null) {
    if (!bytes) return ''
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
          <Paperclip size={11} /> Anhänge {dateien.length > 0 && <span className="font-bold text-slate-500">({dateien.length})</span>}
        </h3>
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-1.5 text-xs font-semibold text-accent-600 hover:text-accent-700 disabled:opacity-50 transition-colors"
        >
          <Upload size={12} />
          {uploading ? 'Hochladen…' : 'Hochladen'}
        </button>
        <input ref={fileRef} type="file" className="hidden" onChange={handleFileChange}
          accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.gif,.webp,.heic" />
      </div>

      {isLoading ? (
        <div className="h-10 bg-slate-100 rounded-xl animate-pulse" />
      ) : dateien.length === 0 ? (
        <button
          onClick={() => fileRef.current?.click()}
          className="w-full border-2 border-dashed border-slate-200 rounded-xl py-6 flex flex-col items-center gap-2 text-slate-300 hover:border-accent-300 hover:text-accent-400 transition-colors group"
        >
          <Upload size={20} className="group-hover:scale-110 transition-transform" />
          <span className="text-xs font-medium">PDF, Bild oder Dokument hochladen</span>
        </button>
      ) : (
        <div className="space-y-1.5">
          {dateien.map(d => {
            const Icon = fileIcon(d.mime_type)
            return (
              <div key={d.id} className="flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-slate-50 group transition-colors">
                <Icon size={15} className="text-slate-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-slate-700 truncate">{d.name}</p>
                  {d.groesse && <p className="text-[10px] text-slate-400">{formatBytes(d.groesse)}</p>}
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => download({ storage_path: d.storage_path, name: d.name }, { onError: (e) => toast.error(String(e)) })}
                    className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                    title="Herunterladen"
                  >
                    <Download size={13} />
                  </button>
                  <button
                    onClick={() => remove({ id: d.id, storage_path: d.storage_path }, { onError: (e) => toast.error(String(e)) })}
                    className="p-1 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors"
                    title="Löschen"
                  >
                    <X size={13} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── New Lead Form ────────────────────────────────────────────────────────────

function NewLeadForm() {
  const navigate = useNavigate()
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    vorname: '', nachname: '', email: '', telefon: '',
    strasse: '', hausnummer: '', plz: '', ort: '', bundesland: '', notiz: '',
    anlagenort: '', anlagengroesse: '', umsetzung: '',
  })

  async function handleSave() {
    setSaving(true)
    try {
      const { data, error } = await supabase
        .from('leads')
        .insert({ ...form, status: 'neu', batteriespeicher: null })
        .select().single()
      if (error) throw error
      toast.success('Lead erstellt')
      navigate(`/crm/${data.id}`)
    } catch (e) {
      toast.error(String(e))
    } finally {
      setSaving(false)
    }
  }

  function f(key: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm(v => ({ ...v, [key]: e.target.value }))
  }

  return (
    <div className="max-w-xl">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/crm')} className="text-slate-400 hover:text-slate-700 transition-colors">
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Neuer Lead</h1>
          <p className="text-sm text-slate-400">Lead manuell erfassen</p>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1.5 block">Vorname</label>
            <Input value={form.vorname} onChange={f('vorname')} placeholder="Max" />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1.5 block">Nachname</label>
            <Input value={form.nachname} onChange={f('nachname')} placeholder="Mustermann" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1.5 block">E-Mail</label>
            <Input type="email" value={form.email} onChange={f('email')} />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1.5 block">Telefon</label>
            <Input type="tel" value={form.telefon} onChange={f('telefon')} />
          </div>
        </div>
        <div className="grid grid-cols-[1fr_80px] gap-3">
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1.5 block">Straße</label>
            <Input value={form.strasse} onChange={f('strasse')} placeholder="Musterstraße" />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1.5 block">Nr.</label>
            <Input value={form.hausnummer} onChange={f('hausnummer')} placeholder="12" />
          </div>
        </div>
        <div className="grid grid-cols-[100px_1fr] gap-3">
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1.5 block">PLZ</label>
            <Input value={form.plz} onChange={f('plz')} />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1.5 block">Ort</label>
            <Input value={form.ort} onChange={f('ort')} placeholder="Wien" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1.5 block">Anlagenort</label>
            <Input value={form.anlagenort} onChange={f('anlagenort')} placeholder="Einfamilienhaus" />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1.5 block">Anlagengröße</label>
            <Input value={form.anlagengroesse} onChange={f('anlagengroesse')} placeholder="5–10 kWp" />
          </div>
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500 mb-1.5 block">Notiz</label>
          <textarea
            value={form.notiz}
            onChange={f('notiz')}
            rows={3}
            className="w-full text-sm bg-slate-50 border border-slate-200 rounded-xl p-3 resize-none focus:outline-none focus:ring-2 focus:ring-accent-400/30 focus:border-accent-400 text-slate-700 placeholder:text-slate-300 transition-all"
          />
        </div>
        <div className="flex gap-2 pt-1">
          <Button onClick={handleSave} disabled={saving} className="bg-accent-500 hover:bg-accent-600 text-white">
            Lead erstellen
          </Button>
          <Button variant="ghost" onClick={() => navigate('/crm')} className="text-slate-500">
            Abbrechen
          </Button>
        </div>
      </div>
    </div>
  )
}
