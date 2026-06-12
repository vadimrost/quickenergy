import { type ReactNode } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { SectionCard } from '@/components/shared/SectionCard'
import { KundeSelector } from './KundeSelector'
import { PositionenEditor } from './PositionenEditor'
import { DokumentSummen } from './DokumentSummen'
import { berechneSummen, type PositionDraft } from './positionenUtils'
import type { Kunde } from '@/types/database'

export interface DokumentFormValues {
  kunde: Kunde | null
  betreff: string
  datum: string
  kopftext: string
  fusstext: string
  positionen: PositionDraft[]
  rabattGesamt: number
}

interface Props {
  values: DokumentFormValues
  onChange: (v: Partial<DokumentFormValues>) => void
  onSave: () => void
  onCancel: () => void
  saving: boolean
  titel: string
  nummer?: string
  onNummerChange?: (v: string) => void
  extraFelder?: ReactNode
}

export function DokumentForm({ values, onChange, onSave, onCancel, saving, titel, nummer, onNummerChange, extraFelder }: Props) {
  const summen = berechneSummen(values.positionen, values.rabattGesamt)

  return (
    <div className="space-y-5 max-w-5xl">
      {/* Kopfdaten */}
      <SectionCard title="Kontakt- und Dokumentinformationen">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-ink-muted mb-1 block">Kunde</label>
            <KundeSelector value={values.kunde} onChange={k => onChange({ kunde: k })} />
            {values.kunde && (
              <div className="mt-2 text-xs text-ink-muted bg-bg-muted rounded p-2 leading-relaxed">
                {values.kunde.firmenname && <div className="font-medium text-ink">{values.kunde.firmenname}</div>}
                {(values.kunde.vorname || values.kunde.nachname) && (
                  <div>{values.kunde.vorname} {values.kunde.nachname}</div>
                )}
                {values.kunde.adresse && <div>{values.kunde.adresse}</div>}
                {(values.kunde.plz || values.kunde.ort) && <div>{values.kunde.plz} {values.kunde.ort}</div>}
                {values.kunde.land && values.kunde.land !== 'Österreich' && <div>{values.kunde.land}</div>}
                {values.kunde.uid_nr && <div className="text-ink-muted">UID: {values.kunde.uid_nr}</div>}
              </div>
            )}
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-ink-muted mb-1 block">Betreff</label>
              <Input
                value={values.betreff}
                onChange={e => onChange({ betreff: e.target.value })}
                placeholder="Photovoltaikanlage & Speicher Inkl. Lieferung & Montage"
                className="text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-medium text-ink-muted mb-1 block">
                  {titel}nummer
                </label>
                <Input
                  value={nummer ?? ''}
                  placeholder="wird automatisch vergeben"
                  disabled={!onNummerChange}
                  onChange={onNummerChange ? e => onNummerChange(e.target.value) : undefined}
                  className={onNummerChange ? 'text-sm font-mono' : 'text-sm bg-bg-muted font-mono text-ink-muted'}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-ink-muted mb-1 block">Datum</label>
                <Input
                  type="date"
                  value={values.datum}
                  onChange={e => onChange({ datum: e.target.value })}
                  className="text-sm"
                />
              </div>
            </div>
            {extraFelder}
          </div>
        </div>
      </SectionCard>

      {/* Kopftext */}
      <SectionCard title="Kopf-Text">
        <textarea
          value={values.kopftext}
          onChange={e => onChange({ kopftext: e.target.value })}
          rows={4}
          className="w-full text-sm border border-border rounded-md px-3 py-2 bg-bg-base resize-y focus:outline-none focus:ring-2 focus:ring-accent-500"
        />
      </SectionCard>

      {/* Positionen */}
      <SectionCard title="Positionen">
        <PositionenEditor
          positionen={values.positionen}
          onChange={p => onChange({ positionen: p })}
        />

        {/* Gesamtrabatt */}
        <div className="mt-4 flex items-center gap-2">
          <label className="text-xs text-ink-muted shrink-0">Gesamtrabatt</label>
          <Input
            type="number"
            min={0}
            max={100}
            step={0.1}
            value={values.rabattGesamt}
            onChange={e => onChange({ rabattGesamt: parseFloat(e.target.value) || 0 })}
            className="h-7 w-20 text-sm text-right"
          />
          <span className="text-xs text-ink-muted">%</span>
        </div>

        <div className="mt-5 border-t border-border pt-4">
          <DokumentSummen summen={summen} rabattGesamt={values.rabattGesamt} />
        </div>
      </SectionCard>

      {/* Fußtext */}
      <SectionCard title="Fuß-Text">
        <textarea
          value={values.fusstext}
          onChange={e => onChange({ fusstext: e.target.value })}
          rows={5}
          className="w-full text-sm border border-border rounded-md px-3 py-2 bg-bg-base resize-y focus:outline-none focus:ring-2 focus:ring-accent-500"
        />
      </SectionCard>

      {/* Aktionen */}
      <div className="flex items-center justify-end gap-3 pb-4">
        <Button type="button" variant="outline" onClick={onCancel}>Abbrechen</Button>
        <Button type="button" onClick={onSave} disabled={saving}>
          {saving ? 'Speichern…' : 'Speichern'}
        </Button>
      </div>
    </div>
  )
}
