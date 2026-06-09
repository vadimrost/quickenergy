import { useState } from 'react'
import { Plus, Building2, User, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { PageTitle } from '@/components/shared/PageTitle'
import { SectionCard } from '@/components/shared/SectionCard'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useKunden, useUpsertKunde, useDeleteKunde } from './useKunden'
import type { Kunde } from '@/types/database'

export function KundenPage() {
  const { data: kunden = [], isLoading } = useKunden()
  const { mutate: upsert, isPending: saving } = useUpsertKunde()
  const { mutate: deleteKunde } = useDeleteKunde()
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<Partial<Kunde> | null>(null)

  const filtered = kunden.filter(k => {
    const q = search.toLowerCase()
    return (
      k.firmenname?.toLowerCase().includes(q) ||
      k.nachname?.toLowerCase().includes(q) ||
      k.vorname?.toLowerCase().includes(q) ||
      k.kundennummer?.toLowerCase().includes(q) ||
      k.uid_nr?.toLowerCase().includes(q)
    )
  })

  function handleSave() {
    if (!editing) return
    if (!editing.firmenname && !editing.nachname) {
      toast.error('Bitte Firmenname oder Nachname eingeben')
      return
    }
    upsert(editing as Partial<Kunde>, {
      onSuccess: () => { toast.success('Kunde gespeichert'); setEditing(null) },
      onError: e => toast.error(String(e)),
    })
  }

  function handleDelete(id: string) {
    if (!confirm('Kunden wirklich löschen?')) return
    deleteKunde(id, {
      onSuccess: () => toast.success('Kunde gelöscht'),
      onError: e => toast.error(String(e)),
    })
  }

  return (
    <div>
      <PageTitle
        title="Kunden"
        subtitle={`${kunden.length} Kunden`}
        actions={
          <Button onClick={() => setEditing({ land: 'Österreich' })}>
            <Plus size={14} className="mr-1.5" /> Neuer Kunde
          </Button>
        }
      />

      <div className="mb-4">
        <Input
          placeholder="Suchen nach Name, UID, Kundennummer…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="max-w-sm"
        />
      </div>

      <SectionCard>
        <div className="grid grid-cols-[100px_1fr_140px_130px_80px] gap-4 px-1 mb-2">
          {['Nr.', 'Name / Firma', 'Ort', 'UID-Nummer', ''].map(h => (
            <span key={h} className="text-xs font-medium text-ink-muted uppercase tracking-wide">{h}</span>
          ))}
        </div>

        {isLoading && <div className="py-8 text-center text-sm text-ink-muted">Laden…</div>}
        {!isLoading && filtered.length === 0 && (
          <div className="py-12 text-center text-sm text-ink-muted">Keine Kunden gefunden</div>
        )}

        <div className="space-y-0">
          {filtered.map(k => (
            <div key={k.id} className="grid grid-cols-[100px_1fr_140px_130px_80px] gap-4 items-center py-3 border-b border-border/50 last:border-0 group hover:bg-bg-hover -mx-6 px-6 transition-colors">
              <span className="text-xs font-mono text-ink-muted">{k.kundennummer}</span>
              <div className="flex items-center gap-2 min-w-0">
                {k.firmenname
                  ? <Building2 size={14} className="text-ink-muted shrink-0" />
                  : <User size={14} className="text-ink-muted shrink-0" />
                }
                <div className="min-w-0">
                  <div className="text-sm font-medium text-ink truncate">
                    {k.firmenname ?? `${k.vorname ?? ''} ${k.nachname ?? ''}`.trim()}
                  </div>
                  {k.firmenname && (k.vorname || k.nachname) && (
                    <div className="text-xs text-ink-muted">{k.vorname} {k.nachname}</div>
                  )}
                </div>
              </div>
              <span className="text-sm text-ink-muted">{k.plz} {k.ort}</span>
              <span className="text-xs font-mono text-ink-muted">{k.uid_nr ?? '—'}</span>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => setEditing(k)} className="p-1 text-ink-muted hover:text-ink rounded transition-colors">
                  <Pencil size={13} />
                </button>
                <button onClick={() => handleDelete(k.id)} className="p-1 text-ink-muted hover:text-red-500 rounded transition-colors">
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      {/* Edit/Create Dialog */}
      <Dialog open={!!editing} onOpenChange={open => !open && setEditing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing?.id ? 'Kunde bearbeiten' : 'Neuer Kunde'}</DialogTitle>
          </DialogHeader>
          {editing && (
            <KundeFormFields
              values={editing}
              onChange={patch => setEditing(v => ({ ...v, ...patch }))}
              onSave={handleSave}
              onCancel={() => setEditing(null)}
              saving={saving}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function KundeFormFields({ values, onChange, onSave, onCancel, saving }: {
  values: Partial<Kunde>
  onChange: (patch: Partial<Kunde>) => void
  onSave: () => void
  onCancel: () => void
  saving: boolean
}) {
  const f = (label: string, key: keyof Kunde, placeholder = '', type = 'text', required = false) => (
    <div>
      <label className="text-xs font-medium text-ink-muted mb-1 block">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <Input
        type={type}
        value={(values[key] as string) ?? ''}
        onChange={e => onChange({ [key]: e.target.value || null })}
        placeholder={placeholder}
        className="h-8 text-sm"
      />
    </div>
  )

  return (
    <div className="space-y-3">
      {f('Firmenname', 'firmenname', 'Quick Energy GmbH')}
      <div className="grid grid-cols-2 gap-2">
        {f('Vorname', 'vorname')}
        {f('Nachname', 'nachname')}
      </div>
      {f('Adresse', 'adresse', 'Musterstraße 1')}
      <div className="grid grid-cols-3 gap-2">
        {f('PLZ', 'plz', '1190')}
        {f('Ort', 'ort', 'Wien')}
        {f('Land', 'land')}
      </div>
      {f('UID-Nummer', 'uid_nr', 'ATU12345678')}
      <div className="grid grid-cols-2 gap-2">
        {f('E-Mail', 'email', '', 'email')}
        {f('Telefon', 'telefon')}
      </div>
      <div>
        <label className="text-xs font-medium text-ink-muted mb-1 block">Notiz</label>
        <textarea
          value={values.notiz ?? ''}
          onChange={e => onChange({ notiz: e.target.value || null })}
          rows={2}
          className="w-full text-sm border border-border rounded-md px-3 py-2 bg-bg-base resize-y focus:outline-none focus:ring-2 focus:ring-accent-500"
        />
      </div>
      <div className="flex gap-2 pt-1">
        <Button type="button" variant="outline" className="flex-1" onClick={onCancel}>Abbrechen</Button>
        <Button type="button" className="flex-1" onClick={onSave} disabled={saving}>
          {saving ? 'Speichern…' : 'Speichern'}
        </Button>
      </div>
    </div>
  )
}
