import { useState, useMemo } from 'react'
import { Package, Search } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { formatEuro } from '@/lib/utils'
import { useArtikel } from './useArtikel'
import type { Artikel } from '@/types/database'

export function ArtikelPickerDialog({ open, onClose, onSelect }: {
  open: boolean
  onClose: () => void
  onSelect: (artikel: Artikel) => void
}) {
  const { data: artikel = [], isLoading } = useArtikel()
  const [search, setSearch] = useState('')

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
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg bg-white border border-border shadow-xl">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold text-ink">Artikel auswählen</DialogTitle>
        </DialogHeader>
        <div className="pt-2">
          <div className="relative mb-3">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Suchen…" className="pl-9" autoFocus />
          </div>
          {isLoading ? (
            <div className="py-8 text-center text-sm text-ink-muted">Lädt…</div>
          ) : filtered.length === 0 ? (
            <div className="py-8 text-center text-sm text-ink-muted">
              <Package size={22} className="mx-auto mb-2 text-ink-subtle" />
              Keine Artikel gefunden.
            </div>
          ) : (
            <div className="max-h-80 overflow-y-auto -mx-1">
              {filtered.map(a => (
                <button
                  key={a.id}
                  onClick={() => { onSelect(a); onClose() }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-card-sm hover:bg-bg-muted transition-colors text-left"
                >
                  <Package size={14} className="text-ink-subtle flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-ink truncate">{a.bezeichnung}</div>
                    <div className="text-xs text-ink-muted font-mono">{a.nummer ?? ''} · {a.einheit}</div>
                  </div>
                  <div className="flex-shrink-0 text-right">
                    <div className="text-sm font-medium text-ink tabular-nums">VK {formatEuro(a.vk_netto)}</div>
                    {a.ek_netto != null && <div className="text-xs text-ink-muted tabular-nums">EK {formatEuro(a.ek_netto)}</div>}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
