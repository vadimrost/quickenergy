import { useState } from 'react'
import { Tag, Plus, Trash2, X, Check, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { PageTitle } from '@/components/shared/PageTitle'
import { SectionCard } from '@/components/shared/SectionCard'
import { EmptyState } from '@/components/shared/EmptyState'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useKategorien, useCreateKategorie, useUpdateKategorie, useDeleteKategorie } from './useKategorien'
import type { Kategorie } from '@/types/database'

export function KategorienPage() {
  const { data: kategorien = [], isLoading } = useKategorien()
  const { mutate: create, isPending: isCreating } = useCreateKategorie()
  const { mutate: update } = useUpdateKategorie()
  const { mutate: del } = useDeleteKategorie()

  const [addOpen, setAddOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Kategorie | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const [form, setForm] = useState({ wert: '', name: '', beschreibung: '' })
  const resetForm = () => setForm({ wert: '', name: '', beschreibung: '' })

  const handleCreate = () => {
    const wert = form.wert.trim().toLowerCase().replace(/\s+/g, '_')
    const name = form.name.trim()
    if (!wert || !name) { toast.error('Wert und Name sind erforderlich'); return }
    create({ wert, name, beschreibung: form.beschreibung.trim() }, {
      onSuccess: () => { toast.success(`${name} hinzugefügt`); setAddOpen(false); resetForm() },
      onError: (e) => toast.error(e.message),
    })
  }

  const handleUpdate = () => {
    if (!editTarget) return
    update({ id: editTarget.id, updates: { name: editTarget.name, beschreibung: editTarget.beschreibung } }, {
      onSuccess: () => { toast.success('Gespeichert'); setEditTarget(null) },
      onError: (e) => toast.error(e.message),
    })
  }

  const handleDelete = (id: string, name: string) => {
    del(id, {
      onSuccess: () => { toast.success(`${name} gelöscht`); setConfirmDelete(null) },
      onError: (e) => toast.error(e.message),
    })
  }

  return (
    <div>
      <PageTitle title="Kategorien" subtitle="Rechnungskategorien für OCR-Erkennung verwalten" />

      <SectionCard
        title="Alle Kategorien"
        actions={
          <button
            onClick={() => setAddOpen(true)}
            className="flex items-center gap-1.5 h-8 px-3 rounded-card-sm bg-accent-500 hover:bg-accent-600 text-white text-sm font-medium transition-colors"
          >
            <Plus size={14} /> Hinzufügen
          </button>
        }
      >
        {isLoading ? (
          <div className="space-y-3">{[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-16" />)}</div>
        ) : kategorien.length === 0 ? (
          <EmptyState title="Keine Kategorien" description="Noch keine Kategorien angelegt." />
        ) : (
          <div className="space-y-2">
            {kategorien.map(k => (
              <div key={k.id} className="flex items-start gap-3 p-3.5 rounded-card-sm border border-border/50 hover:bg-bg-hover transition-colors">
                <div className="w-8 h-8 rounded-lg bg-accent-50 text-accent-500 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Tag size={14} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm font-medium text-ink">{k.name}</span>
                    <span className="text-xs font-mono text-ink-subtle bg-bg-muted px-1.5 py-0.5 rounded">{k.wert}</span>
                  </div>
                  <p className="text-xs text-ink-muted leading-relaxed">{k.beschreibung || <span className="italic text-ink-subtle">Keine Beschreibung</span>}</p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => setEditTarget({ ...k })}
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-ink-muted hover:bg-bg-muted transition-colors"
                  >
                    <Pencil size={13} />
                  </button>
                  {confirmDelete === k.id ? (
                    <div className="flex items-center gap-1">
                      <button onClick={() => handleDelete(k.id, k.name)} className="w-7 h-7 rounded-lg flex items-center justify-center bg-status-danger/10 text-status-danger hover:bg-status-danger/20 transition-colors">
                        <Check size={13} />
                      </button>
                      <button onClick={() => setConfirmDelete(null)} className="w-7 h-7 rounded-lg flex items-center justify-center text-ink-muted hover:bg-bg-muted transition-colors">
                        <X size={13} />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmDelete(k.id)}
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-ink-muted hover:bg-status-danger/10 hover:text-status-danger transition-colors"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <p className="mt-4 text-xs text-ink-subtle border-t border-border/50 pt-3">
          Die <strong>Beschreibung</strong> wird direkt in den OCR-Prompt eingebettet — präzise Formulierungen verbessern die automatische Erkennung.
        </p>
      </SectionCard>

      {/* Add Dialog */}
      <Dialog open={addOpen} onOpenChange={v => { setAddOpen(v); if (!v) resetForm() }}>
        <DialogContent className="max-w-sm bg-bg-surface border-border">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold text-ink">Kategorie hinzufügen</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <label className="block text-[11px] font-medium uppercase tracking-widest text-ink-muted mb-1.5">Name (Anzeige)</label>
              <input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="z.B. Tank Diesel"
                autoFocus
                className="w-full h-10 px-3 rounded-card-sm border border-border bg-bg-base text-sm text-ink placeholder:text-ink-subtle focus:outline-none focus:ring-2 focus:ring-accent-400"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium uppercase tracking-widest text-ink-muted mb-1.5">Wert (intern)</label>
              <input
                value={form.wert}
                onChange={e => setForm(f => ({ ...f, wert: e.target.value }))}
                placeholder="z.B. tanken_diesel"
                className="w-full h-10 px-3 rounded-card-sm border border-border bg-bg-base text-sm text-ink font-mono placeholder:text-ink-subtle focus:outline-none focus:ring-2 focus:ring-accent-400"
              />
              <p className="text-[11px] text-ink-subtle mt-1">Kleinbuchstaben, Unterstriche. Wird automatisch normalisiert.</p>
            </div>
            <div>
              <label className="block text-[11px] font-medium uppercase tracking-widest text-ink-muted mb-1.5">Beschreibung für OCR-Prompt</label>
              <textarea
                value={form.beschreibung}
                onChange={e => setForm(f => ({ ...f, beschreibung: e.target.value }))}
                placeholder="z.B. NUR wenn explizit Diesel/Kraftstoff auf einer TANKSTELLE"
                rows={3}
                className="w-full px-3 py-2.5 rounded-card-sm border border-border bg-bg-base text-sm text-ink placeholder:text-ink-subtle focus:outline-none focus:ring-2 focus:ring-accent-400 resize-none"
              />
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

      {/* Edit Dialog */}
      <Dialog open={!!editTarget} onOpenChange={v => !v && setEditTarget(null)}>
        <DialogContent className="max-w-sm bg-bg-surface border-border">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold text-ink">Kategorie bearbeiten</DialogTitle>
          </DialogHeader>
          {editTarget && (
            <div className="space-y-4 pt-2">
              <div>
                <label className="block text-[11px] font-medium uppercase tracking-widest text-ink-muted mb-1.5">Name (Anzeige)</label>
                <input
                  value={editTarget.name}
                  onChange={e => setEditTarget(t => t ? { ...t, name: e.target.value } : t)}
                  className="w-full h-10 px-3 rounded-card-sm border border-border bg-bg-base text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent-400"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium uppercase tracking-widest text-ink-muted mb-1.5">Wert (intern)</label>
                <input
                  value={editTarget.wert}
                  disabled
                  className="w-full h-10 px-3 rounded-card-sm border border-border bg-bg-muted text-sm text-ink-muted font-mono cursor-not-allowed"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium uppercase tracking-widest text-ink-muted mb-1.5">Beschreibung für OCR-Prompt</label>
                <textarea
                  value={editTarget.beschreibung}
                  onChange={e => setEditTarget(t => t ? { ...t, beschreibung: e.target.value } : t)}
                  rows={3}
                  className="w-full px-3 py-2.5 rounded-card-sm border border-border bg-bg-base text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent-400 resize-none"
                />
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
    </div>
  )
}
