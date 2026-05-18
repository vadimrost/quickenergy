import { useState } from 'react'
import { Users, Plus, Trash2, X, Check, Mail } from 'lucide-react'
import { toast } from 'sonner'
import { PageTitle } from '@/components/shared/PageTitle'
import { StatCard } from '@/components/shared/StatCard'
import { SectionCard } from '@/components/shared/SectionCard'
import { EmptyState } from '@/components/shared/EmptyState'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useMitarbeiterAll, useCreateMitarbeiter, useDeleteMitarbeiter } from './useMitarbeiterCrud'
import { ProjectColorDot } from '@/components/shared/ProjectColorDot'

export function MitarbeiterPage() {
  const { data: mitarbeiter = [], isLoading } = useMitarbeiterAll()
  const { mutate: create, isPending: isCreating } = useCreateMitarbeiter()
  const { mutate: deleteMitarbeiter } = useDeleteMitarbeiter()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [vorname, setVorname] = useState('')
  const [nachname, setNachname] = useState('')
  const [email, setEmail] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const aktiveCount = mitarbeiter.filter(m => m.aktiv).length

  const resetForm = () => {
    setVorname('')
    setNachname('')
    setEmail('')
  }

  const handleCreate = () => {
    const name = [vorname.trim(), nachname.trim()].filter(Boolean).join(' ')
    if (!name) {
      toast.error('Vor- und Nachname sind erforderlich')
      return
    }
    create(
      { name, email: email.trim() || null },
      {
        onSuccess: () => {
          toast.success(`${name} hinzugefügt`)
          setDialogOpen(false)
          resetForm()
        },
        onError: (err) => toast.error(err.message),
      },
    )
  }

  const handleDelete = (id: string, name: string) => {
    deleteMitarbeiter(id, {
      onSuccess: () => {
        toast.success(`${name} gelöscht`)
        setConfirmDelete(null)
      },
      onError: (err) => toast.error(err.message),
    })
  }

  return (
    <div>
      <PageTitle title="Mitarbeiter" subtitle="Spesenkarten und Zuweisungen verwalten" />

      <div className="grid grid-cols-2 gap-5 mb-6">
        <StatCard
          label="Mitarbeiter"
          value={isLoading ? '…' : mitarbeiter.length.toString()}
          sub="Gesamt erfasst"
          icon={<Users size={16} />}
        />
        <StatCard
          label="Aktiv"
          value={isLoading ? '…' : aktiveCount.toString()}
          sub="Aktuell zuweisbar"
          icon={<Users size={16} />}
          accent
        />
      </div>

      <SectionCard
        title="Alle Mitarbeiter"
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
                  {['Name', 'E-Mail', 'Status', ''].map(h => (
                    <th key={h} className="label-caps pb-3 border-b border-border/50 text-left font-normal">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {mitarbeiter.map(m => (
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
                      <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-pill border ${
                        m.aktiv
                          ? 'bg-status-active/10 text-status-active border-status-active/20'
                          : 'bg-bg-muted text-ink-muted border-border'
                      }`}>
                        {m.aktiv ? 'Aktiv' : 'Inaktiv'}
                      </span>
                    </td>
                    <td className="text-right">
                      {confirmDelete === m.id ? (
                        <div className="flex items-center justify-end gap-1">
                          <span className="text-xs text-ink-muted mr-1">Löschen?</span>
                          <button
                            onClick={() => handleDelete(m.id, m.name)}
                            className="w-7 h-7 rounded-lg flex items-center justify-center bg-status-danger/10 text-status-danger hover:bg-status-danger/20 transition-colors"
                          >
                            <Check size={13} />
                          </button>
                          <button
                            onClick={() => setConfirmDelete(null)}
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-ink-muted hover:bg-bg-muted transition-colors"
                          >
                            <X size={13} />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmDelete(m.id)}
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-ink-muted hover:bg-status-danger/10 hover:text-status-danger transition-colors ml-auto"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {/* Add Dialog */}
      <Dialog open={dialogOpen} onOpenChange={open => { setDialogOpen(open); if (!open) resetForm() }}>
        <DialogContent className="max-w-sm bg-bg-surface border-border">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold text-ink">Mitarbeiter hinzufügen</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium uppercase tracking-widest text-ink-muted mb-1.5">Vorname</label>
                <input
                  value={vorname}
                  onChange={e => setVorname(e.target.value)}
                  placeholder="Max"
                  autoFocus
                  className="w-full h-10 px-3 rounded-card-sm border border-border bg-bg-base text-sm text-ink placeholder:text-ink-subtle focus:outline-none focus:ring-2 focus:ring-accent-400 focus:ring-offset-0"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium uppercase tracking-widest text-ink-muted mb-1.5">Nachname</label>
                <input
                  value={nachname}
                  onChange={e => setNachname(e.target.value)}
                  placeholder="Mustermann"
                  className="w-full h-10 px-3 rounded-card-sm border border-border bg-bg-base text-sm text-ink placeholder:text-ink-subtle focus:outline-none focus:ring-2 focus:ring-accent-400 focus:ring-offset-0"
                />
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-medium uppercase tracking-widest text-ink-muted mb-1.5">E-Mail</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="max@firma.at"
                onKeyDown={e => e.key === 'Enter' && handleCreate()}
                className="w-full h-10 px-3 rounded-card-sm border border-border bg-bg-base text-sm text-ink placeholder:text-ink-subtle focus:outline-none focus:ring-2 focus:ring-accent-400 focus:ring-offset-0"
              />
            </div>
            <div className="flex gap-2 pt-2">
              <button
                onClick={handleCreate}
                disabled={isCreating}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-card-sm bg-accent-500 hover:bg-accent-600 disabled:opacity-50 text-white text-sm font-medium transition-colors"
              >
                <Check size={14} /> Speichern
              </button>
              <button
                onClick={() => { setDialogOpen(false); resetForm() }}
                className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-card-sm border border-border hover:bg-bg-muted text-sm text-ink-muted transition-colors"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
