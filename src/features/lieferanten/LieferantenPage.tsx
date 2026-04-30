import { useState } from 'react'
import { Building2, TrendingUp, Zap, FileText, Search, Pencil, X, Check } from 'lucide-react'
import { toast } from 'sonner'
import { PageTitle } from '@/components/shared/PageTitle'
import { StatCard } from '@/components/shared/StatCard'
import { SectionCard } from '@/components/shared/SectionCard'
import { ProjectColorDot } from '@/components/shared/ProjectColorDot'
import { EmptyState } from '@/components/shared/EmptyState'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useLieferanten, useUpdateLieferant } from './useLieferanten'
import { formatPercent, cn } from '@/lib/utils'
import type { Lieferant } from '@/types/database'

function formatIban(iban: string | null) {
  if (!iban) return '—'
  const clean = iban.replace(/\s/g, '')
  return clean.replace(/(.{4})/g, '$1 ').trim()
}

export function LieferantenPage() {
  const { data: lieferanten = [], isLoading } = useLieferanten()
  const { mutate: updateLieferant } = useUpdateLieferant()
  const [search, setSearch] = useState('')
  const [editTarget, setEditTarget] = useState<Lieferant | null>(null)
  const [editForm, setEditForm] = useState<Partial<Lieferant>>({})

  const mitAutoErkennung = lieferanten.filter(l => l.auto_kostengruppe).length
  const rechnungenGesamt = lieferanten.reduce((sum, l) => sum + l.anzahl_rechnungen, 0)
  const rechnungenMitAuto = lieferanten
    .filter(l => l.auto_kostengruppe)
    .reduce((sum, l) => sum + l.anzahl_rechnungen, 0)
  // Weighted by invoice count — more meaningful than per-lieferant ratio
  const erkennungsrate = rechnungenGesamt ? (rechnungenMitAuto / rechnungenGesamt) * 100 : 0

  const filtered = lieferanten.filter(l =>
    !search || l.name.toLowerCase().includes(search.toLowerCase()) || l.ustid?.includes(search)
  )

  const handleEditOpen = (l: Lieferant) => {
    setEditTarget(l)
    setEditForm({ ...l })
  }

  const handleSave = () => {
    if (!editTarget) return
    updateLieferant({ id: editTarget.id, updates: editForm })
    toast.success('Lieferant gespeichert')
    setEditTarget(null)
  }

  return (
    <div>
      <PageTitle title="Lieferanten" subtitle="Stammdaten und Auto-Erkennungsstatistik" />

      {/* KPI Row */}
      <div className="grid grid-cols-4 gap-5 mb-6">
        <StatCard label="Lieferanten" value={isLoading ? '…' : lieferanten.length.toString()} sub="In der Datenbank" icon={<Building2 size={16} />} />
        <StatCard label="Mit Auto-Erkennung" value={isLoading ? '…' : mitAutoErkennung.toString()} sub="Kostengruppe zugewiesen" icon={<Zap size={16} />} />
        <StatCard label="Erkennungsrate" value={isLoading ? '…' : formatPercent(erkennungsrate)} sub="Automatische Zuordnung" accent icon={<TrendingUp size={16} />} />
        <StatCard label="Rechnungen Gesamt" value={isLoading ? '…' : rechnungenGesamt.toString()} sub="Über alle Lieferanten" icon={<FileText size={16} />} />
      </div>

      {/* Auto-Erkennungs-Balken */}
      {!isLoading && lieferanten.length > 0 && (
        <SectionCard title="Auto-Erkennung nach Lieferant" className="mb-6">
          <div className="space-y-3">
            {lieferanten.slice().sort((a, b) => b.anzahl_rechnungen - a.anzahl_rechnungen).map(l => (
              <div key={l.id}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <ProjectColorDot id={l.id} />
                    <span className="text-sm text-ink font-medium">{l.name}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-ink-muted">
                    {l.auto_kostengruppe ? (
                      <span className="inline-flex items-center gap-1 text-status-active">
                        <Zap size={10} /> KGr. {l.auto_kostengruppe}
                      </span>
                    ) : (
                      <span className="text-ink-subtle">Keine Zuordnung</span>
                    )}
                    <span>{l.anzahl_rechnungen} Rechnungen</span>
                  </div>
                </div>
                <div className="h-1.5 bg-border rounded-full">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${Math.min(100, (l.anzahl_rechnungen / Math.max(...lieferanten.map(x => x.anzahl_rechnungen))) * 100)}%`,
                      backgroundColor: l.auto_kostengruppe ? '#10B981' : '#94A3B8',
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* Table */}
      <SectionCard
        title="Alle Lieferanten"
        actions={
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Suchen…"
              className="pl-8 pr-4 h-8 text-sm border border-border rounded-card-sm bg-bg-surface text-ink placeholder:text-ink-subtle focus:outline-none focus:ring-1 focus:ring-accent-400 w-48"
            />
          </div>
        }
      >
        {isLoading ? (
          <div className="space-y-3">{[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-14" />)}</div>
        ) : filtered.length === 0 ? (
          <EmptyState title="Keine Lieferanten" description="Noch keine Lieferanten erfasst." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  {['Lieferant', 'USt-IdNr.', 'IBAN', 'Kostengruppe', 'Rechnungen', ''].map(h => (
                    <th key={h} className={cn('label-caps pb-3 border-b border-border/50 text-left font-normal', h === 'Rechnungen' && 'text-right')}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(l => (
                  <tr key={l.id} className="h-14 border-b border-border/50 last:border-0 hover:bg-bg-hover transition-colors">
                    <td>
                      <div className="flex items-center gap-2.5">
                        <ProjectColorDot id={l.id} />
                        <span className="text-sm font-medium text-ink">{l.name}</span>
                      </div>
                    </td>
                    <td className="text-sm font-mono text-ink-muted">{l.ustid ?? <span className="text-ink-subtle">Kleinunternehmer</span>}</td>
                    <td className="text-sm font-mono text-ink-muted">{formatIban(l.iban)}</td>
                    <td>
                      {l.auto_kostengruppe ? (
                        <span className="inline-flex items-center gap-1 text-xs font-mono bg-status-active/10 text-status-active border border-status-active/20 rounded-pill px-2 py-0.5">
                          <Zap size={10} /> {l.auto_kostengruppe}
                        </span>
                      ) : (
                        <span className="text-xs text-ink-subtle">—</span>
                      )}
                    </td>
                    <td className="text-right text-sm text-ink-muted">{l.anzahl_rechnungen}</td>
                    <td className="text-right">
                      <button
                        onClick={() => handleEditOpen(l)}
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-ink-muted hover:bg-bg-muted hover:text-ink transition-colors ml-auto"
                      >
                        <Pencil size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {/* Edit Dialog */}
      <Dialog open={!!editTarget} onOpenChange={open => !open && setEditTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold text-ink">Lieferant bearbeiten</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <Label className="label-caps mb-1.5 block">Name</Label>
              <Input value={editForm.name ?? ''} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <Label className="label-caps mb-1.5 block">USt-IdNr.</Label>
              <Input value={editForm.ustid ?? ''} onChange={e => setEditForm(f => ({ ...f, ustid: e.target.value }))} placeholder="DE123456789" className="font-mono" />
            </div>
            <div>
              <Label className="label-caps mb-1.5 block">IBAN</Label>
              <Input value={editForm.iban ?? ''} onChange={e => setEditForm(f => ({ ...f, iban: e.target.value }))} placeholder="DE89 3704 0044 0532 0130 00" className="font-mono" />
            </div>
            <div>
              <Label className="label-caps mb-1.5 block">Auto-Kostengruppe (SKR04)</Label>
              <Input value={editForm.auto_kostengruppe ?? ''} onChange={e => setEditForm(f => ({ ...f, auto_kostengruppe: e.target.value || null }))} placeholder="z.B. 4930" className="font-mono" />
            </div>
            <div className="flex gap-2 pt-2">
              <button onClick={handleSave} className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-card-sm bg-accent-500 hover:bg-accent-600 text-white text-sm font-medium transition-colors">
                <Check size={14} /> Speichern
              </button>
              <button onClick={() => setEditTarget(null)} className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-card-sm border border-border hover:bg-bg-muted text-sm text-ink-muted transition-colors">
                <X size={14} />
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
