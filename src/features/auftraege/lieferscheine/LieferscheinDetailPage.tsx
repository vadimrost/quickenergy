import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Truck, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { PageTitle } from '@/components/shared/PageTitle'
import { SectionCard } from '@/components/shared/SectionCard'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PdfButton } from '@/features/auftraege/shared/PdfButton'
import { DocumentHtmlPreview } from '@/features/auftraege/shared/DocumentHtmlPreview'
import { useFirmaStammdaten } from '@/features/einstellungen/useFirmaStammdaten'
import { useLieferschein, useUpdateLieferschein } from './useLieferscheine'
import type { LieferscheinStatus } from '@/types/database'

const STATUS: { value: LieferscheinStatus; label: string }[] = [
  { value: 'entwurf',   label: 'Entwurf' },
  { value: 'geliefert', label: 'Geliefert' },
  { value: 'storniert', label: 'Storniert' },
]

export function LieferscheinDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: ls, isLoading } = useLieferschein(id)
  const { mutate: update, isPending } = useUpdateLieferschein()
  const { data: firma } = useFirmaStammdaten()

  const [form, setForm] = useState({ betreff: '', lieferdatum: '', lieferadresse: '', status: 'entwurf' as LieferscheinStatus })

  useEffect(() => {
    if (ls) {
      setForm({
        betreff:       ls.betreff ?? '',
        lieferdatum:   ls.lieferdatum ?? '',
        lieferadresse: ls.lieferadresse ?? '',
        status:        ls.status,
      })
    }
  }, [ls])

  if (isLoading) {
    return <div className="flex items-center gap-2 text-ink-muted"><Loader2 size={16} className="animate-spin" /> Lädt…</div>
  }
  if (!ls) return <div className="text-sm text-ink-muted">Lieferschein nicht gefunden</div>

  const handleSave = () => {
    if (!id) return
    update(
      { id, updates: { betreff: form.betreff || null, lieferdatum: form.lieferdatum, lieferadresse: form.lieferadresse || null, status: form.status } },
      { onSuccess: () => toast.success('Gespeichert'), onError: e => toast.error(String(e)) },
    )
  }

  const positionen = ls.positionen ?? []

  return (
    <div className="xl:flex xl:gap-6 xl:items-start">
      <div className="flex-1 min-w-0">
      <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/lieferscheine')} className="text-ink-muted hover:text-ink transition-colors">
            <ArrowLeft size={18} />
          </button>
          <PageTitle title="Lieferschein" subtitle={ls.lieferschein_nr} />
        </div>
        <div className="flex items-center gap-2">
          <PdfButton typ="lieferschein" doc={{ ...ls, positionen }} />
          <Button size="sm" onClick={handleSave} disabled={isPending}>Speichern</Button>
        </div>
      </div>

      <SectionCard title="Lieferdaten" className="mb-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="label-caps block mb-1.5">Betreff</label>
            <Input value={form.betreff} onChange={e => setForm(f => ({ ...f, betreff: e.target.value }))} />
          </div>
          <div>
            <label className="label-caps block mb-1.5">Lieferdatum</label>
            <Input type="date" value={form.lieferdatum} onChange={e => setForm(f => ({ ...f, lieferdatum: e.target.value }))} />
          </div>
          <div>
            <label className="label-caps block mb-1.5">Status</label>
            <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v as LieferscheinStatus }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{STATUS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2">
            <label className="label-caps block mb-1.5">Lieferadresse</label>
            <textarea
              value={form.lieferadresse}
              onChange={e => setForm(f => ({ ...f, lieferadresse: e.target.value }))}
              rows={3}
              className="w-full rounded-card-sm border border-border bg-bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-accent-400"
            />
          </div>
        </div>
      </SectionCard>

      <SectionCard title={<span className="flex items-center gap-2"><Truck size={14} /> Positionen (ohne Preise)</span>}>
        {positionen.length === 0 ? (
          <p className="text-sm text-ink-muted py-4">Keine Positionen</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-ink-muted uppercase tracking-wide border-b border-border/60">
                <th className="text-left font-medium py-2 w-10">Pos.</th>
                <th className="text-left font-medium py-2">Bezeichnung</th>
                <th className="text-right font-medium py-2 w-24">Menge</th>
                <th className="text-right font-medium py-2 w-20">Einheit</th>
              </tr>
            </thead>
            <tbody>
              {positionen.map((p, i) => (
                <tr key={p.id} className="border-b border-border/40">
                  <td className="py-2.5 text-ink-muted">{i + 1}.</td>
                  <td className="py-2.5 text-ink">
                    <div>{p.bezeichnung}</div>
                    {p.beschreibung && <div className="text-xs text-ink-muted whitespace-pre-line mt-0.5">{p.beschreibung}</div>}
                  </td>
                  <td className="py-2.5 text-right tabular-nums text-ink">{p.menge}</td>
                  <td className="py-2.5 text-right text-ink-muted">{p.einheit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SectionCard>
      </div>

      {/* Live-Vorschau */}
      <div className="hidden xl:block w-[620px] shrink-0 sticky top-6">
        <div className="rounded-card border border-border shadow-card overflow-hidden bg-white">
          <div className="px-4 py-2.5 border-b border-border bg-white">
            <span className="label-caps">Vorschau</span>
          </div>
          <div className="bg-[#e8eaed] p-4 max-h-[80vh] overflow-y-auto">
            <div className="mx-auto bg-white shadow-[0_1px_4px_rgba(0,0,0,0.18)]" style={{ maxWidth: 700 }}>
              <DocumentHtmlPreview
                typ="lieferschein"
                doc={{ ...ls, ...form, positionen }}
                firma={firma ?? null}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
