import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { format } from 'date-fns'
import { ArrowLeft, Trash2, UserPlus, Phone, Mail, MapPin, Zap, Battery, Clock, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { PageTitle } from '@/components/shared/PageTitle'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { supabase } from '@/lib/supabase'
import { useLead, useUpdateLead, useDeleteLead, LEAD_STATUS_LABELS, LEAD_STATUS_COLORS, PIPELINE_STAGES } from './useLeads'
import type { LeadStatus, Kunde } from '@/types/database'

function InfoRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string | null | undefined }) {
  if (!value) return null
  return (
    <div className="flex items-start gap-3 py-2 border-b border-border last:border-0">
      <Icon size={14} className="text-ink-muted mt-0.5 shrink-0" />
      <div>
        <p className="text-[10px] text-ink-subtle uppercase tracking-wide font-medium">{label}</p>
        <p className="text-sm text-ink">{value}</p>
      </div>
    </div>
  )
}

export function LeadDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const isNew = id === 'neu'

  const { data: lead } = useLead(isNew ? undefined : id)
  const { mutate: updateLead, isPending: updating } = useUpdateLead()
  const { mutate: deleteLead, isPending: deleting } = useDeleteLead()

  const [notiz, setNotiz] = useState('')
  const [terminDatum, setTerminDatum] = useState('')
  const [terminZeit, setTerminZeit] = useState('')
  const [creatingAngebot, setCreatingAngebot] = useState(false)


  useEffect(() => {
    if (lead) {
      setNotiz(lead.notiz ?? '')
      if (lead.termin_datum) {
        const d = new Date(lead.termin_datum)
        setTerminDatum(d.toISOString().split('T')[0])
        setTerminZeit(d.toTimeString().slice(0, 5))
      }
    }
  }, [lead])

  function handleStatusChange(status: LeadStatus) {
    if (!lead) return
    updateLead({ id: lead.id, status }, {
      onSuccess: () => toast.success(`Status: ${LEAD_STATUS_LABELS[status]}`),
      onError: e => toast.error(String(e)),
    })
  }

  function handleSaveNotiz() {
    if (!lead) return
    updateLead({ id: lead.id, notiz }, {
      onSuccess: () => toast.success('Notiz gespeichert'),
      onError: e => toast.error(String(e)),
    })
  }

  function handleSaveTermin() {
    if (!lead) return
    const termin_datum = terminDatum
      ? `${terminDatum}T${terminZeit || '00:00'}:00`
      : null
    updateLead({ id: lead.id, termin_datum }, {
      onSuccess: () => toast.success(termin_datum ? 'Termin gespeichert' : 'Termin entfernt'),
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

      // Create Kunde if not yet linked
      if (!kunde) {
        const { data: newKunde, error: kundeError } = await supabase
          .from('kunden')
          .insert({
            vorname: lead.vorname,
            nachname: lead.nachname,
            email: lead.email,
            telefon: lead.telefon,
            plz: lead.plz,
            land: 'AT',
          })
          .select()
          .single()
        if (kundeError) throw kundeError
        kunde = newKunde as Kunde

        // Link kunde to lead
        await supabase.from('leads').update({ kunde_id: kunde.id }).eq('id', lead.id)
      }

      // Update lead status to 'angebot'
      await supabase.from('leads').update({ status: 'angebot' }).eq('id', lead.id)

      toast.success('Kunde erstellt — Angebot wird geöffnet')
      navigate('/angebote/neu', { state: { lead_id: lead.id, kunde } })
    } catch (e) {
      toast.error(String(e))
    } finally {
      setCreatingAngebot(false)
    }
  }

  if (isNew) {
    return <NewLeadForm />
  }

  if (!lead) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-6 h-6 border-2 border-accent-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const name = [lead.vorname, lead.nachname].filter(Boolean).join(' ') || lead.email || '—'

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-3 mb-5">
        <button onClick={() => navigate('/crm')} className="text-ink-muted hover:text-ink transition-colors">
          <ArrowLeft size={18} />
        </button>
        <PageTitle title={name} subtitle={`Lead · ${format(new Date(lead.created_at), 'dd.MM.yyyy')}`} />
        <div className="ml-auto flex items-center gap-2">
          <Button
            onClick={handleCreateAngebot}
            disabled={creatingAngebot}
            size="sm"
            className="bg-accent-500 hover:bg-accent-600 text-white"
          >
            <UserPlus size={14} className="mr-1.5" />
            {lead.kunde_id ? 'Angebot erstellen' : 'Kunde + Angebot'}
          </Button>
          <Button variant="ghost" size="sm" onClick={handleDelete} disabled={deleting}
            className="text-red-500 hover:text-red-700 hover:bg-red-50 px-2">
            <Trash2 size={14} />
          </Button>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {/* Left: Info + Status */}
        <div className="space-y-4">
          {/* Status */}
          <div className="bg-bg-surface border border-border rounded-xl p-4">
            <p className="text-xs font-semibold text-ink-muted uppercase tracking-wide mb-3">Status</p>
            <Select value={lead.status} onValueChange={v => handleStatusChange(v as LeadStatus)}>
              <SelectTrigger className={cn(
                'h-8 px-3 text-xs font-medium rounded-full border-0 w-auto gap-1.5 focus:ring-0',
                LEAD_STATUS_COLORS[lead.status]
              )}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PIPELINE_STAGES.map(s => (
                  <SelectItem key={s} value={s}>{LEAD_STATUS_LABELS[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Pipeline steps */}
            <div className="flex items-center gap-1 mt-3 overflow-x-auto">
              {PIPELINE_STAGES.filter(s => s !== 'verloren').map((s, i, arr) => {
                const stageIndex = arr.indexOf(lead.status as any) ?? -1
                const thisIndex = arr.indexOf(s)
                const active = thisIndex <= stageIndex
                return (
                  <div key={s} className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => handleStatusChange(s)}
                      className={cn(
                        'w-2 h-2 rounded-full transition-all',
                        active ? 'bg-accent-500 scale-125' : 'bg-border hover:bg-accent-300'
                      )}
                      title={LEAD_STATUS_LABELS[s]}
                    />
                    {i < arr.length - 1 && (
                      <div className={cn('w-4 h-0.5', active && thisIndex < stageIndex ? 'bg-accent-400' : 'bg-border')} />
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Contact info */}
          <div className="bg-bg-surface border border-border rounded-xl p-4">
            <p className="text-xs font-semibold text-ink-muted uppercase tracking-wide mb-2">Kontakt</p>
            <InfoRow icon={Phone} label="Telefon" value={lead.telefon} />
            <InfoRow icon={Mail} label="E-Mail" value={lead.email} />
            <InfoRow icon={MapPin} label="PLZ / Bundesland" value={[lead.plz, lead.bundesland].filter(Boolean).join(' ')} />
          </div>

          {/* Projekt info */}
          <div className="bg-bg-surface border border-border rounded-xl p-4">
            <p className="text-xs font-semibold text-ink-muted uppercase tracking-wide mb-2">Projekt</p>
            <InfoRow icon={Zap} label="Anlagenort" value={lead.anlagenort} />
            <InfoRow icon={Zap} label="Anlagengröße" value={lead.anlagengroesse} />
            <InfoRow icon={Battery} label="Batteriespeicher" value={lead.batteriespeicher === null ? null : lead.batteriespeicher ? 'Ja' : 'Nein'} />
            <InfoRow icon={Clock} label="Umsetzung" value={lead.umsetzung} />
          </div>

          {/* Linked Kunde */}
          {lead.kunde && (
            <div className="bg-bg-surface border border-border rounded-xl p-4">
              <p className="text-xs font-semibold text-ink-muted uppercase tracking-wide mb-2">Verknüpfter Kunde</p>
              <button
                onClick={() => navigate(`/kunden`)}
                className="flex items-center gap-2 text-sm text-accent-600 hover:underline"
              >
                <ExternalLink size={13} />
                {lead.kunde.firmenname || [lead.kunde.vorname, lead.kunde.nachname].filter(Boolean).join(' ')}
                <span className="text-ink-subtle text-xs">#{lead.kunde.kundennummer}</span>
              </button>
            </div>
          )}
        </div>

        {/* Right: Termin + Notiz */}
        <div className="space-y-4">
          {/* Termin */}
          <div className="bg-bg-surface border border-border rounded-xl p-4">
            <p className="text-xs font-semibold text-ink-muted uppercase tracking-wide mb-3">Termin</p>
            <div className="grid grid-cols-2 gap-2 mb-3">
              <div>
                <label className="text-xs text-ink-muted mb-1 block">Datum</label>
                <Input type="date" value={terminDatum} onChange={e => setTerminDatum(e.target.value)} className="text-sm" />
              </div>
              <div>
                <label className="text-xs text-ink-muted mb-1 block">Uhrzeit</label>
                <Input type="time" value={terminZeit} onChange={e => setTerminZeit(e.target.value)} className="text-sm" />
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={handleSaveTermin} disabled={updating}>
              Termin speichern
            </Button>
            {terminDatum && (
              <p className="text-xs text-ink-muted mt-2">
                {format(new Date(`${terminDatum}T${terminZeit || '00:00'}:00`), "EEEE, dd.MM.yyyy 'um' HH:mm 'Uhr'", { locale: undefined })}
              </p>
            )}
          </div>

          {/* Notiz */}
          <div className="bg-bg-surface border border-border rounded-xl p-4">
            <p className="text-xs font-semibold text-ink-muted uppercase tracking-wide mb-3">Notiz</p>
            <textarea
              value={notiz}
              onChange={e => setNotiz(e.target.value)}
              rows={6}
              placeholder="Notizen zum Lead..."
              className="w-full text-sm bg-bg-base border border-border rounded-lg p-2.5 resize-none focus:outline-none focus:ring-1 focus:ring-accent-400 text-ink placeholder:text-ink-subtle"
            />
            <Button size="sm" variant="outline" className="mt-2" onClick={handleSaveNotiz} disabled={updating}>
              Speichern
            </Button>
          </div>

          {/* UTM */}
          {(lead.utm_source || lead.utm_campaign) && (
            <div className="bg-bg-surface border border-border rounded-xl p-4">
              <p className="text-xs font-semibold text-ink-muted uppercase tracking-wide mb-2">Marketing</p>
              <InfoRow icon={ExternalLink} label="UTM Source" value={lead.utm_source} />
              <InfoRow icon={ExternalLink} label="UTM Medium" value={lead.utm_medium} />
              <InfoRow icon={ExternalLink} label="UTM Campaign" value={lead.utm_campaign} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── New Lead Form ────────────────────────────────────────────────────────────

function NewLeadForm() {
  const navigate = useNavigate()
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    vorname: '', nachname: '', email: '', telefon: '',
    plz: '', bundesland: '', notiz: '',
    anlagenort: '', anlagengroesse: '', umsetzung: '',
  })

  async function handleSave() {
    setSaving(true)
    try {
      const { data, error } = await supabase
        .from('leads')
        .insert({
          ...form,
          status: 'neu',
          batteriespeicher: null,
        })
        .select()
        .single()
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
      <div className="flex items-center gap-3 mb-5">
        <button onClick={() => navigate('/crm')} className="text-ink-muted hover:text-ink transition-colors">
          <ArrowLeft size={18} />
        </button>
        <PageTitle title="Neuer Lead" />
      </div>

      <div className="bg-bg-surface border border-border rounded-xl p-5 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-ink-muted mb-1 block">Vorname</label>
            <Input value={form.vorname} onChange={f('vorname')} placeholder="Max" />
          </div>
          <div>
            <label className="text-xs font-medium text-ink-muted mb-1 block">Nachname</label>
            <Input value={form.nachname} onChange={f('nachname')} placeholder="Mustermann" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-ink-muted mb-1 block">E-Mail</label>
            <Input type="email" value={form.email} onChange={f('email')} />
          </div>
          <div>
            <label className="text-xs font-medium text-ink-muted mb-1 block">Telefon</label>
            <Input type="tel" value={form.telefon} onChange={f('telefon')} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-ink-muted mb-1 block">PLZ</label>
            <Input value={form.plz} onChange={f('plz')} />
          </div>
          <div>
            <label className="text-xs font-medium text-ink-muted mb-1 block">Bundesland</label>
            <Input value={form.bundesland} onChange={f('bundesland')} placeholder="z.B. Niederösterreich" />
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-ink-muted mb-1 block">Anlagenort</label>
          <Input value={form.anlagenort} onChange={f('anlagenort')} placeholder="z.B. Einfamilienhaus" />
        </div>
        <div>
          <label className="text-xs font-medium text-ink-muted mb-1 block">Anlagengröße</label>
          <Input value={form.anlagengroesse} onChange={f('anlagengroesse')} placeholder="z.B. 5–10 kWp" />
        </div>
        <div>
          <label className="text-xs font-medium text-ink-muted mb-1 block">Notiz</label>
          <textarea
            value={form.notiz}
            onChange={f('notiz')}
            rows={3}
            className="w-full text-sm bg-bg-base border border-border rounded-lg p-2.5 resize-none focus:outline-none focus:ring-1 focus:ring-accent-400 text-ink placeholder:text-ink-subtle"
          />
        </div>
        <div className="flex gap-2 pt-1">
          <Button onClick={handleSave} disabled={saving} size="sm">
            Lead erstellen
          </Button>
          <Button variant="ghost" size="sm" onClick={() => navigate('/crm')}>
            Abbrechen
          </Button>
        </div>
      </div>
    </div>
  )
}
