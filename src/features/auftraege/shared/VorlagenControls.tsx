import { useState } from 'react'
import { LayoutTemplate, Save, Trash2, ChevronDown } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel,
} from '@/components/ui/dropdown-menu'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { useVorlagen, useCreateVorlage, useDeleteVorlage } from './useVorlagen'
import type { PositionDraft } from './positionenUtils'
import type { DokumentTyp, DokumentVorlage } from '@/types/database'

export interface VorlagenPayload {
  betreff: string
  kopftext: string
  fusstext: string
  rabattGesamt: number
  positionen: PositionDraft[]
}

interface Props {
  typ?: DokumentTyp
  current: VorlagenPayload
  onLoad: (payload: VorlagenPayload) => void
  /** true = aktuelle Positionen enthalten bereits Inhalt (Ersetzen bestätigen) */
  hasContent?: boolean
}

export function VorlagenControls({ typ = 'angebot', current, onLoad, hasContent }: Props) {
  const { data: vorlagen = [] } = useVorlagen(typ)
  const { mutate: createVorlage, isPending: creating } = useCreateVorlage()
  const { mutate: deleteVorlage } = useDeleteVorlage()

  const [saveOpen, setSaveOpen] = useState(false)
  const [name, setName] = useState('')

  function applyVorlage(v: DokumentVorlage) {
    if (hasContent && !window.confirm(`Aktuelle Positionen durch Vorlage „${v.name}" ersetzen?`)) return
    onLoad({
      betreff: v.betreff ?? '',
      kopftext: v.kopftext ?? '',
      fusstext: v.fusstext ?? '',
      rabattGesamt: v.rabatt_gesamt_prozent ?? 0,
      positionen: (v.positionen ?? []).map((p, i) => ({ ...p, reihenfolge: i })),
    })
    toast.success(`Vorlage „${v.name}" geladen`)
  }

  function handleSave() {
    if (!name.trim()) { toast.error('Bitte einen Namen eingeben'); return }
    createVorlage({
      name: name.trim(),
      typ,
      betreff: current.betreff || null,
      kopftext: current.kopftext || null,
      fusstext: current.fusstext || null,
      rabatt_gesamt_prozent: current.rabattGesamt,
      positionen: current.positionen,
    }, {
      onSuccess: () => { toast.success('Als Vorlage gespeichert'); setSaveOpen(false); setName('') },
      onError: e => toast.error(String(e)),
    })
  }

  return (
    <div className="flex items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm">
            <LayoutTemplate size={13} className="mr-1.5" />
            Vorlage laden
            <ChevronDown size={13} className="ml-1.5 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64 bg-white border border-slate-200 shadow-xl">
          <DropdownMenuLabel>Vorlagen</DropdownMenuLabel>
          {vorlagen.length === 0 ? (
            <div className="px-2 py-1.5 text-xs text-ink-muted">Noch keine Vorlagen</div>
          ) : (
            vorlagen.map(v => (
              <DropdownMenuItem
                key={v.id}
                onSelect={() => applyVorlage(v)}
                className="flex items-center justify-between gap-2 group cursor-pointer focus:bg-slate-100"
              >
                <span className="truncate">{v.name}</span>
                <button
                  onClick={e => {
                    e.stopPropagation()
                    if (window.confirm(`Vorlage „${v.name}" löschen?`)) deleteVorlage(v.id)
                  }}
                  className="opacity-0 group-hover:opacity-100 text-ink-muted hover:text-red-500 transition-opacity shrink-0"
                  title="Vorlage löschen"
                >
                  <Trash2 size={13} />
                </button>
              </DropdownMenuItem>
            ))
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setSaveOpen(true)} className="cursor-pointer focus:bg-slate-100">
            <Save size={13} className="mr-2" />
            Aktuelle Positionen als Vorlage speichern
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Als Vorlage speichern</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <label className="text-xs font-medium text-ink-muted mb-1 block">Name der Vorlage</label>
            <Input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="z.B. Klimaanlage Single-Split"
              autoFocus
              onKeyDown={e => { if (e.key === 'Enter') handleSave() }}
            />
            <p className="text-[11px] text-ink-muted mt-2">
              Gespeichert werden Betreff, Kopf-/Fußtext, Gesamtrabatt und alle Positionen.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveOpen(false)}>Abbrechen</Button>
            <Button onClick={handleSave} disabled={creating}>
              {creating ? 'Speichern…' : 'Speichern'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
