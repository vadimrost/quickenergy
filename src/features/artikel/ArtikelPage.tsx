import { useState, useMemo, useEffect, useRef } from 'react'
import { Package, Plus, Trash2, Pencil, Search, Sparkles, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { PageTitle } from '@/components/shared/PageTitle'
import { SectionCard } from '@/components/shared/SectionCard'
import { EmptyState } from '@/components/shared/EmptyState'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { formatEuro, cn } from '@/lib/utils'
import { EINHEITEN } from '@/features/auftraege/shared/positionenUtils'
import { fileToBase64 } from '@/lib/gemini-ocr'
import { lieferantAngebotOcr, mapLieferantEinheit } from '@/lib/lieferant-angebot-ocr'
import { useArtikel, useCreateArtikel, useCreateArtikelBulk, useUpdateArtikel, useDeleteArtikel, type ArtikelInput } from './useArtikel'
import type { Artikel } from '@/types/database'

const EMPTY: ArtikelInput = { bezeichnung: '', gruppe: null, einheit: 'Stk', vk_netto: 0, ek_netto: null, bestand: null }

function margeInfo(vk: number, ek: number | null): { abs: number | null; pct: number | null } {
  if (ek === null || ek === undefined) return { abs: null, pct: null }
  const abs = Math.round((vk - ek) * 100) / 100
  const pct = vk > 0 ? Math.round((abs / vk) * 100) : null
  return { abs, pct }
}

function ArtikelDialog({ open, onClose, initial, onSave, saving }: {
  open: boolean
  onClose: () => void
  initial: ArtikelInput
  onSave: (v: ArtikelInput) => void
  saving: boolean
}) {
  const [form, setForm] = useState<ArtikelInput>(initial)
  // Formular neu initialisieren, wenn ein anderer Artikel geöffnet wird
  useEffect(() => { if (open) setForm(initial) }, [open, initial])

  const num = (v: string): number | null => (v.trim() === '' ? null : parseFloat(v.replace(',', '.')) || 0)

  const submit = () => {
    if (!form.bezeichnung.trim()) { toast.error('Bezeichnung ist erforderlich'); return }
    onSave({ ...form, bezeichnung: form.bezeichnung.trim(), gruppe: form.gruppe?.trim() || null })
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md bg-white border border-border shadow-xl">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold text-ink">Artikel</DialogTitle>
        </DialogHeader>
        <div className="pt-2 space-y-3">
          <div>
            <label className="label-caps block mb-1.5">Bezeichnung</label>
            <Input value={form.bezeichnung} onChange={e => setForm(f => ({ ...f, bezeichnung: e.target.value }))} placeholder="Produkt / Leistung" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label-caps block mb-1.5">Gruppe</label>
              <Input value={form.gruppe ?? ''} onChange={e => setForm(f => ({ ...f, gruppe: e.target.value }))} placeholder="optional" />
            </div>
            <div>
              <label className="label-caps block mb-1.5">Einheit</label>
              <Select value={form.einheit} onValueChange={v => setForm(f => ({ ...f, einheit: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{EINHEITEN.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label-caps block mb-1.5">VK netto €</label>
              <Input type="number" step="0.01" value={form.vk_netto} onChange={e => setForm(f => ({ ...f, vk_netto: num(e.target.value) ?? 0 }))} className="text-right" />
            </div>
            <div>
              <label className="label-caps block mb-1.5">EK netto €</label>
              <Input type="number" step="0.01" value={form.ek_netto ?? ''} onChange={e => setForm(f => ({ ...f, ek_netto: num(e.target.value) }))} className="text-right" placeholder="—" />
            </div>
            <div>
              <label className="label-caps block mb-1.5">Bestand</label>
              <Input type="number" step="1" value={form.bestand ?? ''} onChange={e => setForm(f => ({ ...f, bestand: num(e.target.value) }))} className="text-right" placeholder="—" />
            </div>
          </div>
          <div className="flex items-center gap-2 pt-2">
            <button onClick={onClose} className="flex-1 h-9 rounded-card-sm border border-border text-sm text-ink-muted hover:bg-bg-muted transition-colors">Abbrechen</button>
            <button onClick={submit} disabled={saving} className="flex-1 h-9 rounded-card-sm bg-ink hover:bg-ink/80 disabled:opacity-40 text-white text-sm font-medium transition-colors">Speichern</button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function ArtikelPage() {
  const { data: artikel = [], isLoading } = useArtikel()
  const { mutate: create, isPending: creating } = useCreateArtikel()
  const { mutateAsync: createBulk } = useCreateArtikelBulk()
  const { mutate: update, isPending: updating } = useUpdateArtikel()
  const { mutate: del } = useDeleteArtikel()

  const [search, setSearch] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Artikel | null>(null)
  const [importing, setImporting] = useState(false)
  const importInputRef = useRef<HTMLInputElement>(null)

  const handleImport = async (file: File) => {
    const apiKey = import.meta.env.VITE_OPENROUTER_API_KEY as string | undefined
    if (!apiKey) { toast.error('Kein OpenRouter API Key konfiguriert'); return }
    setImporting(true)
    try {
      toast.info('Lieferanten-Angebot wird analysiert…')
      const base64 = await fileToBase64(file)
      const ocr = await lieferantAngebotOcr(base64, apiKey)
      if (ocr.positionen.length === 0) { toast.error('Keine Positionen erkannt'); return }
      const items: ArtikelInput[] = ocr.positionen.map(p => ({
        bezeichnung: p.artikelnummer ? `${p.bezeichnung} (${p.artikelnummer})` : p.bezeichnung,
        gruppe: ocr.lieferant ?? null,
        einheit: mapLieferantEinheit(p.einheit),
        // Eigenes Angebot → Einzelpreis ist unser VK; Lieferanten-Angebot → EK
        vk_netto: ocr.ist_eigenes_angebot ? (p.einzelpreis ?? 0) : 0,
        ek_netto: ocr.ist_eigenes_angebot ? null : (p.einzelpreis ?? null),
        bestand: null,
      }))
      await createBulk(items)
      toast.success(`${items.length} Artikel importiert${ocr.ist_eigenes_angebot ? '' : ' — bitte Verkaufspreise ergänzen'}`)
    } catch (err) {
      toast.error(`Import fehlgeschlagen: ${err instanceof Error ? err.message : 'Unbekannter Fehler'}`)
    } finally {
      setImporting(false)
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return artikel
    return artikel.filter(a =>
      a.bezeichnung.toLowerCase().includes(q) ||
      (a.nummer ?? '').toLowerCase().includes(q) ||
      (a.gruppe ?? '').toLowerCase().includes(q)
    )
  }, [artikel, search])

  return (
    <div>
      <PageTitle
        title="Artikelliste"
        subtitle={`${artikel.length} Artikel`}
        actions={
          <div className="flex items-center gap-2">
            <input
              ref={importInputRef}
              type="file"
              accept="application/pdf,.pdf"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) void handleImport(f); e.target.value = '' }}
            />
            <button
              onClick={() => importInputRef.current?.click()}
              disabled={importing}
              className="h-9 px-3 inline-flex items-center gap-1.5 text-sm rounded-card-sm border border-border bg-bg-surface text-ink hover:bg-bg-muted transition-colors disabled:opacity-50"
            >
              {importing ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} className="text-accent-500" />}
              Angebot importieren
            </button>
            <button onClick={() => setAddOpen(true)} className="h-9 px-3 inline-flex items-center gap-1.5 text-sm rounded-card-sm bg-ink hover:bg-ink/80 text-white transition-colors">
              <Plus size={15} /> Neuer Artikel
            </button>
          </div>
        }
      />

      <div className="relative mb-4 max-w-md">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Suchen nach Bezeichnung, Nummer, Gruppe…" className="pl-9" />
      </div>

      <SectionCard>
        {isLoading ? (
          <div className="space-y-3">{[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : filtered.length === 0 ? (
          <EmptyState icon={<Package size={24} />} title="Keine Artikel" description="Lege deinen ersten Artikel an oder importiere ein Lieferanten-Angebot." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-ink-muted uppercase tracking-wide border-b border-border/60">
                  <th className="text-left font-medium py-2 pr-3">Nr.</th>
                  <th className="text-left font-medium py-2 pr-3">Bezeichnung</th>
                  <th className="text-left font-medium py-2 pr-3">Gruppe</th>
                  <th className="text-left font-medium py-2 pr-3">Einheit</th>
                  <th className="text-right font-medium py-2 pr-3">VK netto</th>
                  <th className="text-right font-medium py-2 pr-3">EK netto</th>
                  <th className="text-right font-medium py-2 pr-3">Marge</th>
                  <th className="text-right font-medium py-2 pr-3">Bestand</th>
                  <th className="w-16"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(a => {
                  const m = margeInfo(a.vk_netto, a.ek_netto)
                  return (
                    <tr key={a.id} className="border-b border-border/40 hover:bg-bg-muted/40 transition-colors group">
                      <td className="py-2.5 pr-3 font-mono text-ink-muted">{a.nummer ?? '—'}</td>
                      <td className="py-2.5 pr-3 text-ink">
                        <span className="inline-flex items-center gap-1.5"><Package size={12} className="text-ink-subtle flex-shrink-0" />{a.bezeichnung}</span>
                      </td>
                      <td className="py-2.5 pr-3 text-ink-muted">{a.gruppe || '—'}</td>
                      <td className="py-2.5 pr-3 text-ink-muted">{a.einheit}</td>
                      <td className="py-2.5 pr-3 text-right tabular-nums text-ink">{formatEuro(a.vk_netto)}</td>
                      <td className="py-2.5 pr-3 text-right tabular-nums text-ink-muted">{a.ek_netto !== null ? formatEuro(a.ek_netto) : '—'}</td>
                      <td className={cn('py-2.5 pr-3 text-right tabular-nums', m.abs !== null && m.abs >= 0 ? 'text-green-600' : m.abs !== null ? 'text-red-600' : 'text-ink-subtle')}>
                        {m.abs !== null ? <>{formatEuro(m.abs)}{m.pct !== null && <span className="text-xs text-ink-muted"> ({m.pct}%)</span>}</> : '—'}
                      </td>
                      <td className="py-2.5 pr-3 text-right tabular-nums text-ink-muted">{a.bestand !== null ? a.bestand : '—'}</td>
                      <td className="py-2.5">
                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => setEditTarget(a)} className="w-7 h-7 rounded-lg flex items-center justify-center text-ink-muted hover:text-ink hover:bg-bg-muted"><Pencil size={13} /></button>
                          <button onClick={() => { if (confirm(`Artikel „${a.bezeichnung}" löschen?`)) del(a.id, { onError: e => toast.error(e.message) }) }} className="w-7 h-7 rounded-lg flex items-center justify-center text-ink-muted hover:text-status-danger hover:bg-red-50"><Trash2 size={13} /></button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <ArtikelDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        initial={EMPTY}
        saving={creating}
        onSave={v => create(v, { onSuccess: () => { toast.success('Artikel angelegt'); setAddOpen(false) }, onError: e => toast.error(e.message) })}
      />
      <ArtikelDialog
        open={!!editTarget}
        onClose={() => setEditTarget(null)}
        initial={editTarget ? { bezeichnung: editTarget.bezeichnung, gruppe: editTarget.gruppe, einheit: editTarget.einheit, vk_netto: editTarget.vk_netto, ek_netto: editTarget.ek_netto, bestand: editTarget.bestand } : EMPTY}
        saving={updating}
        onSave={v => { if (!editTarget) return; update({ id: editTarget.id, updates: v }, { onSuccess: () => { toast.success('Gespeichert'); setEditTarget(null) }, onError: e => toast.error(e.message) }) }}
      />
    </div>
  )
}
