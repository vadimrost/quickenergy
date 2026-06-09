import { useState } from 'react'
import { Search, Plus, Building2, User } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useKunden, useUpsertKunde } from '@/features/auftraege/kunden/useKunden'
import type { Kunde } from '@/types/database'
import { toast } from 'sonner'

interface Props {
  value: Kunde | null
  onChange: (kunde: Kunde) => void
}

export function KundeSelector({ value, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full text-left px-3 py-2 rounded-md border border-border hover:border-accent-400 transition-colors bg-bg-base text-sm"
      >
        {value ? (
          <span className="flex items-center gap-2 text-ink">
            {value.firmenname ? <Building2 size={14} className="text-ink-muted" /> : <User size={14} className="text-ink-muted" />}
            {value.firmenname ?? `${value.vorname ?? ''} ${value.nachname ?? ''}`.trim()}
            <span className="text-ink-muted text-xs ml-auto">{value.kundennummer}</span>
          </span>
        ) : (
          <span className="text-ink-muted flex items-center gap-2">
            <Search size={14} /> Kunde auswählen oder neu anlegen…
          </span>
        )}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Kunde wählen</DialogTitle>
          </DialogHeader>
          {creating ? (
            <NeuerKundeForm
              onSaved={k => { onChange(k); setOpen(false); setCreating(false) }}
              onCancel={() => setCreating(false)}
            />
          ) : (
            <KundeList
              search={search}
              onSearch={setSearch}
              onSelect={k => { onChange(k); setOpen(false) }}
              onNew={() => setCreating(true)}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

function KundeList({ search, onSearch, onSelect, onNew }: {
  search: string
  onSearch: (v: string) => void
  onSelect: (k: Kunde) => void
  onNew: () => void
}) {
  const { data: kunden = [] } = useKunden()
  const filtered = kunden.filter(k => {
    const q = search.toLowerCase()
    return (
      k.firmenname?.toLowerCase().includes(q) ||
      k.nachname?.toLowerCase().includes(q) ||
      k.vorname?.toLowerCase().includes(q) ||
      k.kundennummer?.toLowerCase().includes(q)
    )
  })

  return (
    <div className="space-y-3">
      <Input
        placeholder="Suchen…"
        value={search}
        onChange={e => onSearch(e.target.value)}
        autoFocus
      />
      <div className="max-h-72 overflow-y-auto space-y-1">
        {filtered.length === 0 && (
          <p className="text-sm text-ink-muted text-center py-6">Kein Kunde gefunden</p>
        )}
        {filtered.map(k => (
          <button
            key={k.id}
            onClick={() => onSelect(k)}
            className="w-full text-left px-3 py-2 rounded-md hover:bg-bg-hover transition-colors flex items-center gap-3"
          >
            {k.firmenname
              ? <Building2 size={14} className="text-ink-muted shrink-0" />
              : <User size={14} className="text-ink-muted shrink-0" />
            }
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-ink truncate">
                {k.firmenname ?? `${k.vorname ?? ''} ${k.nachname ?? ''}`.trim()}
              </div>
              <div className="text-xs text-ink-muted">{k.ort} {k.uid_nr ? `· ${k.uid_nr}` : ''}</div>
            </div>
            <span className="text-xs text-ink-muted">{k.kundennummer}</span>
          </button>
        ))}
      </div>
      <Button type="button" variant="outline" className="w-full" onClick={onNew}>
        <Plus size={14} className="mr-2" /> Neuen Kunden anlegen
      </Button>
    </div>
  )
}

function NeuerKundeForm({ onSaved, onCancel }: { onSaved: (k: Kunde) => void; onCancel: () => void }) {
  const { mutate, isPending } = useUpsertKunde()
  const [form, setForm] = useState({
    firmenname: '', anrede: '', vorname: '', nachname: '',
    adresse: '', plz: '', ort: '', land: 'Österreich',
    uid_nr: '', email: '', telefon: '',
  })

  function set(key: keyof typeof form, val: string) {
    setForm(f => ({ ...f, [key]: val }))
  }

  function save() {
    if (!form.firmenname && !form.nachname) {
      toast.error('Bitte Firmenname oder Nachname eingeben')
      return
    }
    mutate(
      { ...form, firmenname: form.firmenname || null, uid_nr: form.uid_nr || null, email: form.email || null, telefon: form.telefon || null },
      { onSuccess: k => onSaved(k as Kunde), onError: e => toast.error(String(e)) }
    )
  }

  const f = (label: string, key: keyof typeof form, placeholder = '') => (
    <div>
      <label className="text-xs font-medium text-ink-muted mb-1 block">{label}</label>
      <Input value={form[key]} onChange={e => set(key, e.target.value)} placeholder={placeholder} className="h-8 text-sm" />
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
        {f('E-Mail', 'email')}
        {f('Telefon', 'telefon')}
      </div>
      <div className="flex gap-2 pt-1">
        <Button type="button" variant="outline" className="flex-1" onClick={onCancel}>Abbrechen</Button>
        <Button type="button" className="flex-1" onClick={save} disabled={isPending}>
          {isPending ? 'Speichern…' : 'Kunde anlegen'}
        </Button>
      </div>
    </div>
  )
}
