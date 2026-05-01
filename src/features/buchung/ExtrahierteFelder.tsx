import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { CreditCard, X, AlertTriangle } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { useUpdateRechnung, useDeleteRechnung } from '@/features/inbox/useRechnungen'
import { useLieferanten } from '@/features/lieferanten/useLieferanten'
import type { Rechnung, RechnungStatus } from '@/types/database'
import { formatDate } from '@/lib/utils'

interface ExtrahierteFelder_Props {
  rechnung: Rechnung
}

const STATUS_LABELS: Record<RechnungStatus, string> = {
  eingegangen: 'Neu',
  geprüft: 'Neu',
  gebucht: 'Neu',
  bezahlt: 'Bezahlt',
}

const STATUS_FLOW: RechnungStatus[] = ['eingegangen', 'bezahlt']

export function ExtrahierteFelder({ rechnung }: ExtrahierteFelder_Props) {
  const navigate = useNavigate()
  const { data: lieferanten = [] } = useLieferanten()
  const { mutate: updateRechnung, isPending } = useUpdateRechnung()
  const { mutate: deleteRechnung, isPending: isDeleting } = useDeleteRechnung()
  const [confirmOpen, setConfirmOpen] = useState(false)

  const [form, setForm] = useState({
    rechnungsnr: rechnung.rechnungsnr,
    betrag: rechnung.betrag.toString(),
    ust_satz: rechnung.ust_satz.toString(),
    faelligkeit: rechnung.faelligkeit ?? '',
    skonto_datum: rechnung.skonto_datum ?? '',
    skonto_prozent: rechnung.skonto_prozent?.toString() ?? '',
    lieferant_id: rechnung.lieferant_id ?? '',
    status: rechnung.status,
  })

  useEffect(() => {
    setForm({
      rechnungsnr: rechnung.rechnungsnr,
      betrag: rechnung.betrag.toString(),
      ust_satz: rechnung.ust_satz.toString(),
      faelligkeit: rechnung.faelligkeit ?? '',
      skonto_datum: rechnung.skonto_datum ?? '',
      skonto_prozent: rechnung.skonto_prozent?.toString() ?? '',
      lieferant_id: rechnung.lieferant_id ?? '',
      status: rechnung.status,
    })
  }, [rechnung])

  const brutto = parseFloat(form.betrag || '0') * (1 + parseFloat(form.ust_satz || '0') / 100)
  const skontoWert = parseFloat(form.betrag || '0') * (parseFloat(form.skonto_prozent || '0') / 100)

  const handleSave = () => {
    updateRechnung({
      id: rechnung.id,
      updates: {
        rechnungsnr: form.rechnungsnr,
        betrag: parseFloat(form.betrag),
        ust_satz: parseFloat(form.ust_satz),
        faelligkeit: form.faelligkeit || null,
        skonto_datum: form.skonto_datum || null,
        skonto_prozent: form.skonto_prozent ? parseFloat(form.skonto_prozent) : null,
        lieferant_id: form.lieferant_id || null,
        status: form.status as RechnungStatus,
      },
    })
    toast.success('Rechnung gespeichert')
  }

  const handleStatusAdvance = () => {
    const currentIdx = STATUS_FLOW.indexOf(form.status as RechnungStatus)
    if (currentIdx < STATUS_FLOW.length - 1) {
      const nextStatus = STATUS_FLOW[currentIdx + 1]
      setForm(f => ({ ...f, status: nextStatus }))
      updateRechnung({ id: rechnung.id, updates: { status: nextStatus } })
      toast.success(`Status: ${STATUS_LABELS[nextStatus]}`)
    }
  }

  const nextStatus = STATUS_FLOW[STATUS_FLOW.indexOf(form.status as RechnungStatus) + 1]

  const confidenceColor = (field: keyof NonNullable<Rechnung['ocr_json']>) => {
    const conf = rechnung.ocr_json?.[field]?.confidence
    if (!conf) return ''
    if (conf >= 0.95) return 'ring-1 ring-status-active/40'
    if (conf >= 0.80) return 'ring-1 ring-status-warning/40'
    return 'ring-1 ring-status-danger/40'
  }

  return (
    <div className="space-y-6">
      {/* Lieferant */}
      <div className="card-base p-5">
        <p className="label-caps mb-4">Lieferant</p>
        <div className="space-y-3">
          <div>
            <Label className="label-caps text-ink-subtle mb-1.5 block">Lieferant</Label>
            <Select
              value={form.lieferant_id}
              onValueChange={v => setForm(f => ({ ...f, lieferant_id: v }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Lieferant wählen…" />
              </SelectTrigger>
              <SelectContent>
                {lieferanten.map(l => (
                  <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {rechnung.lieferant && (
            <div className="grid grid-cols-2 gap-3 text-xs text-ink-muted">
              <div>
                <span className="label-caps block mb-0.5">USt-IdNr.</span>
                <span className="text-ink font-mono">{rechnung.lieferant.ustid ?? '—'}</span>
              </div>
              <div>
                <span className="label-caps block mb-0.5">Kostengruppe</span>
                <span className="text-ink font-mono">{rechnung.lieferant.auto_kostengruppe ?? '—'}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Rechnungsdaten */}
      <div className="card-base p-5">
        <p className="label-caps mb-4">Rechnungsdaten</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Label className="label-caps text-ink-subtle mb-1.5 block">Rechnungsnummer</Label>
            <Input
              value={form.rechnungsnr}
              onChange={e => setForm(f => ({ ...f, rechnungsnr: e.target.value }))}
              className={`font-mono ${confidenceColor('rechnungsnr')}`}
            />
          </div>

          <div>
            <Label className="label-caps text-ink-subtle mb-1.5 block">Betrag (netto)</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted text-sm">€</span>
              <Input
                value={form.betrag}
                onChange={e => setForm(f => ({ ...f, betrag: e.target.value }))}
                className={`pl-7 font-mono ${confidenceColor('betrag')}`}
                type="number"
                step="0.01"
              />
            </div>
          </div>

          <div>
            <Label className="label-caps text-ink-subtle mb-1.5 block">USt-Satz</Label>
            <Select
              value={form.ust_satz}
              onValueChange={v => setForm(f => ({ ...f, ust_satz: v }))}
            >
              <SelectTrigger className={confidenceColor('ust_satz')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0">0%</SelectItem>
                <SelectItem value="7">7%</SelectItem>
                <SelectItem value="19">19%</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="col-span-2 flex items-center justify-between bg-bg-muted rounded-card-sm px-3 py-2.5">
            <span className="label-caps">Bruttobetrag</span>
            <span className="text-base font-semibold text-ink">€ {brutto.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* Fälligkeiten */}
      <div className="card-base p-5">
        <p className="label-caps mb-4">Fälligkeiten</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="label-caps text-ink-subtle mb-1.5 block">Fälligkeit</Label>
            <Input
              type="date"
              value={form.faelligkeit}
              onChange={e => setForm(f => ({ ...f, faelligkeit: e.target.value }))}
              className={confidenceColor('faelligkeit')}
            />
          </div>

          <div>
            <Label className="label-caps text-ink-subtle mb-1.5 block">Skonto bis</Label>
            <Input
              type="date"
              value={form.skonto_datum}
              onChange={e => setForm(f => ({ ...f, skonto_datum: e.target.value }))}
              className={confidenceColor('skonto_datum')}
            />
          </div>

          {form.skonto_datum && (
            <>
              <div>
                <Label className="label-caps text-ink-subtle mb-1.5 block">Skonto %</Label>
                <div className="relative">
                  <Input
                    type="number"
                    step="0.5"
                    value={form.skonto_prozent}
                    onChange={e => setForm(f => ({ ...f, skonto_prozent: e.target.value }))}
                    className="font-mono"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted text-sm">%</span>
                </div>
              </div>
              <div>
                <Label className="label-caps text-ink-subtle mb-1.5 block">Skonto-Betrag</Label>
                <div className="h-10 flex items-center px-3 bg-bg-muted rounded-card-sm text-sm font-mono text-ink">
                  € {skontoWert.toFixed(2)}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Status & OCR-Datum */}
      <div className="card-base p-5">
        <div className="flex items-center justify-between mb-4">
          <p className="label-caps">Status & Verarbeitung</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="label-caps text-ink-subtle mb-1.5 block">Status</Label>
            <Select
              value={form.status}
              onValueChange={v => setForm(f => ({ ...f, status: v as RechnungStatus }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="eingegangen">Neu</SelectItem>
                <SelectItem value="bezahlt">Bezahlt</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="label-caps text-ink-subtle mb-1.5 block">Erfasst am</Label>
            <div className="h-10 flex items-center px-3 bg-bg-muted rounded-card-sm text-sm text-ink-muted">
              {formatDate(rechnung.created_at)}
            </div>
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex flex-col gap-2 pb-8">
        {form.status !== 'bezahlt' && (
          <button
            onClick={handleStatusAdvance}
            disabled={isPending}
            className="flex items-center justify-center gap-2 w-full py-2.5 rounded-card-sm bg-accent-500 hover:bg-accent-600 text-white text-sm font-medium transition-colors disabled:opacity-40"
          >
            <CreditCard size={15} /> Als bezahlt markieren
          </button>
        )}
        <button
          onClick={handleSave}
          disabled={isPending}
          className="flex items-center justify-center gap-2 w-full py-2.5 rounded-card-sm border border-border hover:bg-bg-muted text-sm font-medium text-ink transition-colors disabled:opacity-40"
        >
          Änderungen speichern
        </button>
        <button
          disabled={isPending || isDeleting}
          onClick={() => setConfirmOpen(true)}
          className="flex items-center justify-center gap-2 w-full py-2.5 rounded-card-sm text-sm text-status-danger hover:bg-status-danger/5 transition-colors disabled:opacity-40"
        >
          <X size={14} /> Ablehnen
        </button>

        <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <DialogContent className="max-w-sm p-7 bg-white border border-border shadow-xl">
            <div className="flex flex-col items-center text-center gap-5">
              <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center">
                <AlertTriangle size={26} className="text-red-500" />
              </div>
              <div>
                <p className="text-lg font-semibold text-gray-900">Rechnung ablehnen?</p>
                <p className="text-sm text-gray-500 mt-1.5">
                  Die Rechnung wird unwiderruflich gelöscht.
                </p>
              </div>
              <div className="flex gap-3 w-full">
                <button
                  onClick={() => setConfirmOpen(false)}
                  className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Abbrechen
                </button>
                <button
                  disabled={isDeleting}
                  onClick={() => deleteRechnung(rechnung.id, {
                    onSuccess: () => {
                      toast.success('Rechnung abgelehnt und gelöscht')
                      navigate('/')
                    },
                    onError: () => toast.error('Löschen fehlgeschlagen'),
                  })}
                  className="flex-1 py-2.5 rounded-xl bg-red-500 text-white text-sm font-medium hover:bg-red-600 transition-colors disabled:opacity-40"
                >
                  {isDeleting ? 'Wird gelöscht…' : 'Ja, löschen'}
                </button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}
