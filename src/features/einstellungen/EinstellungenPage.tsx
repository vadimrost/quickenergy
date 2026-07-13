import { useState, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { Building2, Phone, Landmark, Upload, Trash2, ImageIcon, Users, Plus, Check, X, Mail, Pencil, Tag } from 'lucide-react'
import { PageTitle } from '@/components/shared/PageTitle'
import { SectionCard } from '@/components/shared/SectionCard'
import { EmptyState } from '@/components/shared/EmptyState'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { supabase } from '@/lib/supabase'
import { useFirmaStammdaten, useUpsertFirma } from './useFirmaStammdaten'
import { useAllProfiles, useUpdateProfile, type Profile } from '@/contexts/RoleContext'
import { useMitarbeiterAll, useCreateMitarbeiter, useDeleteMitarbeiter } from '@/features/mitarbeiter/useMitarbeiterCrud'
import { useKategorien, useCreateKategorie, useUpdateKategorie, useDeleteKategorie } from '@/features/kategorien/useKategorien'
import { ProjectColorDot } from '@/components/shared/ProjectColorDot'
import type { FirmaStammdaten, Kategorie } from '@/types/database'

type FormState = Omit<FirmaStammdaten, 'id' | 'updated_at' | 'logo_url'>

const EMPTY: FormState = {
  name: '', strasse: '', plz_ort: '', land: 'Österreich',
  tel: '', email: '', web: '',
  uid: '', fn_nr: '', steuer_nr: '', gericht: '', gf: '',
  bank: '', iban: '', bic: '', konto: '', blz: '',
}

function Field({
  label, value, onChange, placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <div>
      <label className="text-xs font-medium text-ink-muted mb-1 block">{label}</label>
      <Input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="text-sm"
      />
    </div>
  )
}

export function EinstellungenPage() {
  const { data: firma, isPending } = useFirmaStammdaten()
  const { mutate: upsert, isPending: saving } = useUpsertFirma()
  const [form, setForm] = useState<FormState>(EMPTY)
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [logoUploading, setLogoUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (firma) {
      setForm({
        name: firma.name, strasse: firma.strasse, plz_ort: firma.plz_ort,
        land: firma.land, tel: firma.tel, email: firma.email, web: firma.web,
        uid: firma.uid, fn_nr: firma.fn_nr, steuer_nr: firma.steuer_nr,
        gericht: firma.gericht, gf: firma.gf,
        bank: firma.bank, iban: firma.iban, bic: firma.bic,
        konto: firma.konto, blz: firma.blz,
      })
      setLogoUrl(firma.logo_url ?? null)
    }
  }, [firma])

  function set(key: keyof FormState, value: string) {
    setForm(f => ({ ...f, [key]: value }))
  }

  async function handleLogoUpload(file: File) {
    if (!file.type.startsWith('image/')) {
      toast.error('Nur Bilddateien erlaubt (PNG, JPG, SVG)')
      return
    }
    setLogoUploading(true)
    try {
      const ext = file.name.split('.').pop() ?? 'png'
      const path = `firma/logo.${ext}`
      const { error: upErr } = await supabase.storage
        .from('rechnungen')
        .upload(path, file, { upsert: true, contentType: file.type })
      if (upErr) throw new Error(upErr.message)

      const { data: { publicUrl } } = supabase.storage.from('rechnungen').getPublicUrl(path)
      // Cache-buster so the browser reloads the image
      const url = `${publicUrl}?t=${Date.now()}`
      setLogoUrl(url)

      upsert(
        { ...form, logo_url: url, id: firma?.id },
        {
          onSuccess: () => toast.success('Logo hochgeladen'),
          onError: e => toast.error(String(e)),
        }
      )
    } catch (e) {
      toast.error(String(e))
    } finally {
      setLogoUploading(false)
    }
  }

  function handleLogoRemove() {
    setLogoUrl(null)
    upsert(
      { ...form, logo_url: null, id: firma?.id },
      {
        onSuccess: () => toast.success('Logo entfernt'),
        onError: e => toast.error(String(e)),
      }
    )
  }

  function handleSave() {
    upsert(
      { ...form, logo_url: logoUrl, id: firma?.id },
      {
        onSuccess: () => toast.success('Firmendaten gespeichert'),
        onError: e => toast.error(String(e)),
      }
    )
  }

  if (isPending) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="w-6 h-6 border-2 border-accent-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="max-w-3xl space-y-5">
      <PageTitle title="Einstellungen" subtitle="Firmenstammdaten, Mitarbeiter und Kategorien verwalten" />

      {/* Mitarbeiter */}
      <MitarbeiterSection />

      {/* Kategorien */}
      <KategorienSection />

      {/* Logo */}
      <SectionCard title={<span className="flex items-center gap-2"><ImageIcon size={14} /> Firmenlogo</span>}>
        <div className="flex items-center gap-6">
          {/* Preview */}
          <div className="w-40 h-20 rounded-lg border-2 border-dashed border-border flex items-center justify-center bg-bg-muted overflow-hidden shrink-0">
            {logoUrl ? (
              <img src={logoUrl} alt="Logo" className="max-w-full max-h-full object-contain p-2" />
            ) : (
              <div className="text-center">
                <ImageIcon size={24} className="text-ink-subtle mx-auto mb-1" />
                <span className="text-xs text-ink-subtle">Kein Logo</span>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="space-y-2">
            <p className="text-xs text-ink-muted">
              PNG, JPG oder SVG · wird oben rechts auf allen PDFs angezeigt
            </p>
            <div className="flex items-center gap-2">
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={e => {
                  const file = e.target.files?.[0]
                  if (file) handleLogoUpload(file)
                  e.target.value = ''
                }}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileRef.current?.click()}
                disabled={logoUploading}
              >
                <Upload size={13} className="mr-1.5" />
                {logoUploading ? 'Wird hochgeladen…' : logoUrl ? 'Logo ersetzen' : 'Logo hochladen'}
              </Button>
              {logoUrl && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleLogoRemove}
                  className="text-red-500 hover:text-red-700 hover:bg-red-50 px-2"
                >
                  <Trash2 size={13} />
                </Button>
              )}
            </div>
          </div>
        </div>
      </SectionCard>

      {/* Firmendaten */}
      <SectionCard title={<span className="flex items-center gap-2"><Building2 size={14} /> Firmendaten</span>}>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <Field label="Firmenname" value={form.name} onChange={v => set('name', v)}
              placeholder="Muster GmbH" />
          </div>
          <Field label="Straße + Hausnummer" value={form.strasse} onChange={v => set('strasse', v)}
            placeholder="Musterstraße 1" />
          <Field label="PLZ + Ort" value={form.plz_ort} onChange={v => set('plz_ort', v)}
            placeholder="1010 Wien" />
          <Field label="Land" value={form.land} onChange={v => set('land', v)}
            placeholder="Österreich" />
          <Field label="Geschäftsführung" value={form.gf} onChange={v => set('gf', v)}
            placeholder="Max Mustermann" />
          <Field label="UID-Nummer" value={form.uid} onChange={v => set('uid', v)}
            placeholder="ATU12345678" />
          <Field label="Firmenbuchnummer" value={form.fn_nr} onChange={v => set('fn_nr', v)}
            placeholder="123456a" />
          <Field label="Steuernummer" value={form.steuer_nr} onChange={v => set('steuer_nr', v)}
            placeholder="123/4567" />
          <Field label="Firmenbuchgericht" value={form.gericht} onChange={v => set('gericht', v)}
            placeholder="HG Wien" />
        </div>
      </SectionCard>

      {/* Kontakt */}
      <SectionCard title={<span className="flex items-center gap-2"><Phone size={14} /> Kontakt</span>}>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Telefon" value={form.tel} onChange={v => set('tel', v)}
            placeholder="+43 1 234 5678" />
          <Field label="E-Mail" value={form.email} onChange={v => set('email', v)}
            placeholder="office@firma.at" />
          <Field label="Website" value={form.web} onChange={v => set('web', v)}
            placeholder="www.firma.at" />
        </div>
      </SectionCard>

      {/* Bank */}
      <SectionCard title={<span className="flex items-center gap-2"><Landmark size={14} /> Bankverbindung</span>}>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Bank" value={form.bank} onChange={v => set('bank', v)}
            placeholder="Erste Bank" />
          <Field label="IBAN" value={form.iban} onChange={v => set('iban', v)}
            placeholder="AT12 3456 7890 1234 5678" />
          <Field label="BIC / SWIFT" value={form.bic} onChange={v => set('bic', v)}
            placeholder="GIBAATWW" />
          <Field label="Kontonummer" value={form.konto} onChange={v => set('konto', v)}
            placeholder="12345678" />
          <Field label="BLZ" value={form.blz} onChange={v => set('blz', v)}
            placeholder="20111" />
        </div>
      </SectionCard>

      <div className="flex justify-end pb-4">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? 'Speichern…' : 'Speichern'}
        </Button>
      </div>

    </div>
  )
}

// ─── Mitarbeiter-Sektion (inkl. Rollenvergabe) ───────────────────────────────

function MitarbeiterSection() {
  const { data: mitarbeiter = [], isLoading: loadingMa } = useMitarbeiterAll()
  const { data: profiles = [], isLoading: loadingProfiles } = useAllProfiles()
  const { mutate: create, isPending: isCreating } = useCreateMitarbeiter()
  const { mutate: deleteMitarbeiter } = useDeleteMitarbeiter()
  const { mutate: updateProfile, isPending: updatingProfile } = useUpdateProfile()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [vorname, setVorname] = useState('')
  const [nachname, setNachname] = useState('')
  const [email, setEmail] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const isLoading = loadingMa || loadingProfiles

  function resetForm() { setVorname(''); setNachname(''); setEmail('') }

  function handleCreate() {
    const name = [vorname.trim(), nachname.trim()].filter(Boolean).join(' ')
    if (!name) { toast.error('Vor- und Nachname sind erforderlich'); return }
    create({ name, email: email.trim() || null }, {
      onSuccess: () => { toast.success(`${name} hinzugefügt`); setDialogOpen(false); resetForm() },
      onError: err => toast.error(err.message),
    })
  }

  function handleDelete(id: string, name: string) {
    deleteMitarbeiter(id, {
      onSuccess: () => { toast.success(`${name} gelöscht`); setConfirmDelete(null) },
      onError: err => toast.error(err.message),
    })
  }

  function handleRolleChange(profile: Profile, rolle: 'admin' | 'setter', maName: string) {
    updateProfile(
      { id: profile.id, rolle, setter_name: rolle === 'setter' ? maName : null },
      {
        onSuccess: () => toast.success('Rolle gespeichert'),
        onError: e => toast.error(String(e)),
      }
    )
  }

  return (
    <>
      <SectionCard
        title={<span className="flex items-center gap-2"><Users size={14} /> Mitarbeiter & Rollen</span>}
        actions={
          <button
            onClick={() => setDialogOpen(true)}
            className="flex items-center gap-1.5 h-8 px-3 rounded-card-sm bg-accent-500 hover:bg-accent-600 text-white text-sm font-medium transition-colors"
          >
            <Plus size={14} /> Hinzufügen
          </button>
        }
      >
        {isLoading ? (
          <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-14" />)}</div>
        ) : mitarbeiter.length === 0 ? (
          <EmptyState title="Keine Mitarbeiter" description="Noch keine Mitarbeiter angelegt." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  {['Name', 'E-Mail', 'Rolle', ''].map(h => (
                    <th key={h} className="label-caps pb-3 border-b border-border/50 text-left font-normal">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {mitarbeiter.map(m => {
                  const profile = m.email
                    ? profiles.find(p => p.email.toLowerCase() === m.email!.toLowerCase())
                    : undefined

                  return (
                    <tr key={m.id} className="h-14 border-b border-border/50 last:border-0 hover:bg-bg-hover transition-colors">
                      <td>
                        <div className="flex items-center gap-2.5">
                          <ProjectColorDot id={m.id} />
                          <span className="text-sm font-medium text-ink">{m.name}</span>
                        </div>
                      </td>
                      <td>
                        {m.email ? (
                          <div className="flex items-center gap-1.5 text-sm text-ink-muted">
                            <Mail size={12} className="text-ink-subtle" />
                            {m.email}
                          </div>
                        ) : (
                          <span className="text-sm text-ink-subtle">—</span>
                        )}
                      </td>
                      <td>
                        {profile ? (
                          <Select
                            value={profile.rolle}
                            onValueChange={(v: 'admin' | 'setter') => handleRolleChange(profile, v, m.name)}
                            disabled={updatingProfile}
                          >
                            <SelectTrigger className="h-8 w-28 text-xs border-border">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="admin">Admin</SelectItem>
                              <SelectItem value="setter">Setter</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          <span className="text-xs text-ink-subtle italic">Kein Account</span>
                        )}
                      </td>
                      <td className="text-right">
                        {confirmDelete === m.id ? (
                          <div className="flex items-center justify-end gap-1">
                            <span className="text-xs text-ink-muted mr-1">Löschen?</span>
                            <button onClick={() => handleDelete(m.id, m.name)} className="w-7 h-7 rounded-lg flex items-center justify-center bg-status-danger/10 text-status-danger hover:bg-status-danger/20 transition-colors">
                              <Check size={13} />
                            </button>
                            <button onClick={() => setConfirmDelete(null)} className="w-7 h-7 rounded-lg flex items-center justify-center text-ink-muted hover:bg-bg-muted transition-colors">
                              <X size={13} />
                            </button>
                          </div>
                        ) : (
                          <button onClick={() => setConfirmDelete(m.id)} className="w-7 h-7 rounded-lg flex items-center justify-center text-ink-muted hover:bg-status-danger/10 hover:text-status-danger transition-colors ml-auto">
                            <Trash2 size={13} />
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-xs text-ink-subtle border-t border-border/50 pt-3">
          Rolle wird über den verknüpften Login-Account (gleiche E-Mail) gesteuert.
        </p>
      </SectionCard>

      <Dialog open={dialogOpen} onOpenChange={open => { setDialogOpen(open); if (!open) resetForm() }}>
        <DialogContent className="max-w-sm bg-bg-surface border-border">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold text-ink">Mitarbeiter hinzufügen</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium uppercase tracking-widest text-ink-muted mb-1.5">Vorname</label>
                <input value={vorname} onChange={e => setVorname(e.target.value)} placeholder="Max" autoFocus
                  className="w-full h-10 px-3 rounded-card-sm border border-border bg-bg-base text-sm text-ink placeholder:text-ink-subtle focus:outline-none focus:ring-2 focus:ring-accent-400" />
              </div>
              <div>
                <label className="block text-[11px] font-medium uppercase tracking-widest text-ink-muted mb-1.5">Nachname</label>
                <input value={nachname} onChange={e => setNachname(e.target.value)} placeholder="Mustermann"
                  className="w-full h-10 px-3 rounded-card-sm border border-border bg-bg-base text-sm text-ink placeholder:text-ink-subtle focus:outline-none focus:ring-2 focus:ring-accent-400" />
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-medium uppercase tracking-widest text-ink-muted mb-1.5">E-Mail</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="max@firma.at"
                onKeyDown={e => e.key === 'Enter' && handleCreate()}
                className="w-full h-10 px-3 rounded-card-sm border border-border bg-bg-base text-sm text-ink placeholder:text-ink-subtle focus:outline-none focus:ring-2 focus:ring-accent-400" />
            </div>
            <div className="flex gap-2 pt-2">
              <button onClick={handleCreate} disabled={isCreating}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-card-sm bg-accent-500 hover:bg-accent-600 disabled:opacity-50 text-white text-sm font-medium transition-colors">
                <Check size={14} /> Speichern
              </button>
              <button onClick={() => { setDialogOpen(false); resetForm() }}
                className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-card-sm border border-border hover:bg-bg-muted text-sm text-ink-muted transition-colors">
                <X size={14} />
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

// ─── Kategorien-Sektion ───────────────────────────────────────────────────────

function KategorienSection() {
  const { data: kategorien = [], isLoading } = useKategorien()
  const { mutate: create, isPending: isCreating } = useCreateKategorie()
  const { mutate: update } = useUpdateKategorie()
  const { mutate: del } = useDeleteKategorie()

  const [addOpen, setAddOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Kategorie | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [form, setForm] = useState({ wert: '', name: '', beschreibung: '' })

  function resetForm() { setForm({ wert: '', name: '', beschreibung: '' }) }

  function handleCreate() {
    const wert = form.wert.trim().toLowerCase().replace(/\s+/g, '_')
    const name = form.name.trim()
    if (!wert || !name) { toast.error('Wert und Name sind erforderlich'); return }
    create({ wert, name, beschreibung: form.beschreibung.trim() }, {
      onSuccess: () => { toast.success(`${name} hinzugefügt`); setAddOpen(false); resetForm() },
      onError: e => toast.error(e.message),
    })
  }

  function handleUpdate() {
    if (!editTarget) return
    update({ id: editTarget.id, updates: { name: editTarget.name, beschreibung: editTarget.beschreibung } }, {
      onSuccess: () => { toast.success('Gespeichert'); setEditTarget(null) },
      onError: e => toast.error(e.message),
    })
  }

  function handleDelete(id: string, name: string) {
    del(id, {
      onSuccess: () => { toast.success(`${name} gelöscht`); setConfirmDelete(null) },
      onError: e => toast.error(e.message),
    })
  }

  return (
    <>
      <SectionCard
        title={<span className="flex items-center gap-2"><Tag size={14} /> Kategorien</span>}
        actions={
          <button onClick={() => setAddOpen(true)}
            className="flex items-center gap-1.5 h-8 px-3 rounded-card-sm bg-accent-500 hover:bg-accent-600 text-white text-sm font-medium transition-colors">
            <Plus size={14} /> Hinzufügen
          </button>
        }
      >
        {isLoading ? (
          <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-16" />)}</div>
        ) : kategorien.length === 0 ? (
          <EmptyState title="Keine Kategorien" description="Noch keine Kategorien angelegt." />
        ) : (
          <div className="space-y-2">
            {kategorien.map(k => (
              <div key={k.id} className="flex items-start gap-3 p-3.5 rounded-card-sm border border-border/50 hover:bg-bg-hover transition-colors">
                <div className="w-8 h-8 rounded-lg bg-accent-50 text-accent-500 flex items-center justify-center shrink-0 mt-0.5">
                  <Tag size={14} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm font-medium text-ink">{k.name}</span>
                    <span className="text-xs font-mono text-ink-subtle bg-bg-muted px-1.5 py-0.5 rounded">{k.wert}</span>
                  </div>
                  <p className="text-xs text-ink-muted">{k.beschreibung || <span className="italic text-ink-subtle">Keine Beschreibung</span>}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => setEditTarget({ ...k })} className="w-7 h-7 rounded-lg flex items-center justify-center text-ink-muted hover:bg-bg-muted transition-colors">
                    <Pencil size={13} />
                  </button>
                  {confirmDelete === k.id ? (
                    <div className="flex items-center gap-1">
                      <button onClick={() => handleDelete(k.id, k.name)} className="w-7 h-7 rounded-lg flex items-center justify-center bg-status-danger/10 text-status-danger hover:bg-status-danger/20 transition-colors"><Check size={13} /></button>
                      <button onClick={() => setConfirmDelete(null)} className="w-7 h-7 rounded-lg flex items-center justify-center text-ink-muted hover:bg-bg-muted transition-colors"><X size={13} /></button>
                    </div>
                  ) : (
                    <button onClick={() => setConfirmDelete(k.id)} className="w-7 h-7 rounded-lg flex items-center justify-center text-ink-muted hover:bg-status-danger/10 hover:text-status-danger transition-colors">
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        <p className="mt-4 text-xs text-ink-subtle border-t border-border/50 pt-3">
          Die <strong>Beschreibung</strong> wird direkt in den OCR-Prompt eingebettet.
        </p>
      </SectionCard>

      <Dialog open={addOpen} onOpenChange={v => { setAddOpen(v); if (!v) resetForm() }}>
        <DialogContent className="max-w-sm bg-bg-surface border-border">
          <DialogHeader><DialogTitle className="text-base font-semibold text-ink">Kategorie hinzufügen</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <label className="block text-[11px] font-medium uppercase tracking-widest text-ink-muted mb-1.5">Name (Anzeige)</label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="z.B. Tank Diesel" autoFocus
                className="w-full h-10 px-3 rounded-card-sm border border-border bg-bg-base text-sm text-ink placeholder:text-ink-subtle focus:outline-none focus:ring-2 focus:ring-accent-400" />
            </div>
            <div>
              <label className="block text-[11px] font-medium uppercase tracking-widest text-ink-muted mb-1.5">Wert (intern)</label>
              <input value={form.wert} onChange={e => setForm(f => ({ ...f, wert: e.target.value }))} placeholder="tanken_diesel"
                className="w-full h-10 px-3 rounded-card-sm border border-border bg-bg-base text-sm text-ink font-mono placeholder:text-ink-subtle focus:outline-none focus:ring-2 focus:ring-accent-400" />
            </div>
            <div>
              <label className="block text-[11px] font-medium uppercase tracking-widest text-ink-muted mb-1.5">Beschreibung für OCR</label>
              <textarea value={form.beschreibung} onChange={e => setForm(f => ({ ...f, beschreibung: e.target.value }))} rows={3}
                placeholder="z.B. NUR wenn explizit Diesel/Kraftstoff auf einer TANKSTELLE"
                className="w-full px-3 py-2.5 rounded-card-sm border border-border bg-bg-base text-sm text-ink placeholder:text-ink-subtle focus:outline-none focus:ring-2 focus:ring-accent-400 resize-none" />
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={handleCreate} disabled={isCreating} className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-card-sm bg-accent-500 hover:bg-accent-600 disabled:opacity-50 text-white text-sm font-medium transition-colors">
                <Check size={14} /> Speichern
              </button>
              <button onClick={() => { setAddOpen(false); resetForm() }} className="px-4 py-2.5 rounded-card-sm border border-border hover:bg-bg-muted text-sm text-ink-muted transition-colors">
                <X size={14} />
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editTarget} onOpenChange={v => !v && setEditTarget(null)}>
        <DialogContent className="max-w-sm bg-bg-surface border-border">
          <DialogHeader><DialogTitle className="text-base font-semibold text-ink">Kategorie bearbeiten</DialogTitle></DialogHeader>
          {editTarget && (
            <div className="space-y-4 pt-2">
              <div>
                <label className="block text-[11px] font-medium uppercase tracking-widest text-ink-muted mb-1.5">Name (Anzeige)</label>
                <input value={editTarget.name} onChange={e => setEditTarget(t => t ? { ...t, name: e.target.value } : t)}
                  className="w-full h-10 px-3 rounded-card-sm border border-border bg-bg-base text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent-400" />
              </div>
              <div>
                <label className="block text-[11px] font-medium uppercase tracking-widest text-ink-muted mb-1.5">Wert (intern)</label>
                <input value={editTarget.wert} disabled className="w-full h-10 px-3 rounded-card-sm border border-border bg-bg-muted text-sm text-ink-muted font-mono cursor-not-allowed" />
              </div>
              <div>
                <label className="block text-[11px] font-medium uppercase tracking-widest text-ink-muted mb-1.5">Beschreibung für OCR</label>
                <textarea value={editTarget.beschreibung} onChange={e => setEditTarget(t => t ? { ...t, beschreibung: e.target.value } : t)} rows={3}
                  className="w-full px-3 py-2.5 rounded-card-sm border border-border bg-bg-base text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent-400 resize-none" />
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={handleUpdate} className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-card-sm bg-accent-500 hover:bg-accent-600 text-white text-sm font-medium transition-colors">
                  <Check size={14} /> Speichern
                </button>
                <button onClick={() => setEditTarget(null)} className="px-4 py-2.5 rounded-card-sm border border-border hover:bg-bg-muted text-sm text-ink-muted transition-colors">
                  <X size={14} />
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
