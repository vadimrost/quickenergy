import { Plus, Trash2, ChevronUp, ChevronDown } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { formatEuro } from '@/lib/utils'
import { type PositionDraft, EINHEITEN, UST_SAETZE, berechneZeilenbetrag, emptyPosition } from './positionenUtils'

interface Props {
  positionen: PositionDraft[]
  onChange: (positionen: PositionDraft[]) => void
}

export function PositionenEditor({ positionen, onChange }: Props) {
  function update(index: number, patch: Partial<PositionDraft>) {
    const next = positionen.map((p, i) => {
      if (i !== index) return p
      const merged = { ...p, ...patch }
      return { ...merged, zeilenbetrag_netto: berechneZeilenbetrag(merged) }
    })
    onChange(next)
  }

  function add() {
    onChange([...positionen, emptyPosition(positionen.length)])
  }

  function remove(index: number) {
    onChange(positionen.filter((_, i) => i !== index))
  }

  function move(index: number, dir: -1 | 1) {
    const next = [...positionen]
    const swap = index + dir
    if (swap < 0 || swap >= next.length) return
    ;[next[index], next[swap]] = [next[swap], next[index]]
    onChange(next.map((p, i) => ({ ...p, reihenfolge: i })))
  }

  return (
    <div>
      {/* Header */}
      <div className="grid grid-cols-[2fr_65px_72px_90px_52px_48px_105px_28px] gap-2 mb-2 px-1">
        {(['Bezeichnung', 'Menge', 'Einheit', 'EP netto', 'USt%', 'Rab%', 'Betrag netto', ''] as const).map(h => (
          <span key={h} className="text-xs font-medium text-ink-muted uppercase tracking-wide">{h}</span>
        ))}
      </div>

      <div className="space-y-1.5">
        {positionen.map((p, i) => (
          <div key={i} className="grid grid-cols-[2fr_65px_72px_90px_52px_48px_105px_28px] gap-2 items-center group">
            {/* Bezeichnung */}
            <Input
              value={p.bezeichnung}
              onChange={e => update(i, { bezeichnung: e.target.value })}
              placeholder="Produktname / Leistung"
              className="h-8 text-sm"
            />

            {/* Menge */}
            <Input
              type="number"
              min={0}
              step={0.01}
              value={p.menge}
              onChange={e => update(i, { menge: parseFloat(e.target.value) || 0 })}
              className="h-8 text-sm text-right"
            />

            {/* Einheit */}
            <Select value={p.einheit} onValueChange={v => update(i, { einheit: v })}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EINHEITEN.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
              </SelectContent>
            </Select>

            {/* EP netto */}
            <Input
              type="number"
              min={0}
              step={0.01}
              value={p.einzelpreis_netto}
              onChange={e => update(i, { einzelpreis_netto: parseFloat(e.target.value) || 0 })}
              className="h-8 text-sm text-right"
            />

            {/* USt% */}
            <Select value={String(p.ust_satz)} onValueChange={v => update(i, { ust_satz: Number(v) as 0 | 10 | 20 })}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {UST_SAETZE.map(s => <SelectItem key={s} value={String(s)}>{s}%</SelectItem>)}
              </SelectContent>
            </Select>

            {/* Rabatt% */}
            <Input
              type="number"
              min={0}
              max={100}
              step={0.1}
              value={p.rabatt_prozent}
              onChange={e => update(i, { rabatt_prozent: parseFloat(e.target.value) || 0 })}
              className="h-8 text-sm text-right"
            />

            {/* Zeilenbetrag */}
            <div className="h-8 flex items-center justify-end text-sm font-medium text-ink pr-1">
              {formatEuro(p.zeilenbetrag_netto)}
            </div>

            {/* Aktionen */}
            <div className="flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <button onClick={() => move(i, -1)} disabled={i === 0} className="text-ink-muted hover:text-ink disabled:opacity-30">
                <ChevronUp size={12} />
              </button>
              <button onClick={() => move(i, 1)} disabled={i === positionen.length - 1} className="text-ink-muted hover:text-ink disabled:opacity-30">
                <ChevronDown size={12} />
              </button>
            </div>

            {/* Delete — full row hover */}
            <button
              onClick={() => remove(i)}
              className="col-start-8 row-start-1 text-ink-muted hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ display: 'none' }}
            />
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-4">
        <Button type="button" variant="ghost" size="sm" onClick={add} className="text-accent-600 hover:text-accent-700 px-0">
          <Plus size={14} className="mr-1" /> Position hinzufügen
        </Button>
        {positionen.length > 0 && (
          <button
            type="button"
            onClick={() => remove(positionen.length - 1)}
            className="text-xs text-ink-muted hover:text-red-500 flex items-center gap-1"
          >
            <Trash2 size={12} /> Letzte entfernen
          </button>
        )}
      </div>
    </div>
  )
}
