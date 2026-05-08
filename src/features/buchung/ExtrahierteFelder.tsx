import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { CreditCard, X, AlertTriangle, ArrowUpFromLine } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { useUpdateRechnung, useDeleteRechnung } from '@/features/inbox/useRechnungen'
import { useTriggerExport } from '@/features/exports/useExports'
import type { Rechnung, RechnungStatus, ExportZiel, Rechnungstyp } from '@/types/database'
import { formatDate, cn } from '@/lib/utils'

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
  const { mutate: updateRechnung, isPending } = useUpdateRechnung()
  const { mutate: deleteRechnung, isPending: isDeleting } = useDeleteRechnung()
  const { mutate: triggerExport, isPending: isExporting } = useTriggerExport()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmingZiel, setConfirmingZiel] = useState<ExportZiel | null>(null)

  const ocrNetto = (rechnung.ocr_json as any)?.invoice_net_amount
  const nettoWert = ocrNetto ?? rechnung.betrag

  const [form, setForm] = useState({
    rechnungsnr: rechnung.rechnungsnr,
    betrag: nettoWert.toString(),
    ust_satz: rechnung.ust_satz.toString(),
    faelligkeit: rechnung.faelligkeit ?? '',
    skonto_datum: rechnung.skonto_datum ?? '',
    skonto_prozent: rechnung.skonto_prozent?.toString() ?? '',
    status: rechnung.status,
    rechnungstyp: rechnung.rechnungstyp ?? '' as Rechnungstyp | '',
    betrag_10: rechnung.betrag_10?.toString() ?? '',
    betrag_20: rechnung.betrag_20?.toString() ?? '',
    betrag_0: rechnung.betrag_0?.toString() ?? '',
  })

  useEffect(() => {
    const ocrNettoVal = (rechnung.ocr_json as any)?.invoice_net_amount
    setForm({
      rechnungsnr: rechnung.rechnungsnr,
      betrag: (ocrNettoVal ?? rechnung.betrag).toString(),
      ust_satz: rechnung.ust_satz.toString(),
      faelligkeit: rechnung.faelligkeit ?? '',
      skonto_datum: rechnung.skonto_datum ?? '',
      skonto_prozent: rechnung.skonto_prozent?.toString() ?? '',
      status: rechnung.status,
      rechnungstyp: rechnung.rechnungstyp ?? '',
      betrag_10: rechnung.betrag_10?.toString() ?? '',
      betrag_20: rechnung.betrag_20?.toString() ?? '',
      betrag_0: rechnung.betrag_0?.toString() ?? '',
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
        status: form.status as RechnungStatus,
        rechnungstyp: (form.rechnungstyp || null) as Rechnungstyp | null,
        betrag_10: form.rechnungstyp === 'bewirtung' && form.betrag_10 ? parseFloat(form.betrag_10) : null,
        betrag_20: form.rechnungstyp === 'bewirtung' && form.betrag_20 ? parseFloat(form.betrag_20) : null,
        betrag_0: form.rechnungstyp === 'bewirtung' && form.betrag_0 ? parseFloat(form.betrag_0) : null,
      },
    })
    toast.success('Rechnung gespeichert')
  }

  const handleExport = (ziel: ExportZiel) => {
    if (confirmingZiel !== ziel) {
      setConfirmingZiel(ziel)
      setTimeout(() => setConfirmingZiel(null), 3000)
      return
    }
    setConfirmingZiel(null)
    triggerExport(
      { rechnungIds: [rechnung.id], ziel },
      {
        onSuccess: () => {
          updateRechnung({ id: rechnung.id, updates: { status: 'gebucht' } })
        },
      }
    )
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

  const confidenceColor = (field: keyof NonNullable<Rechnung['ocr_json']>) => {
    const conf = rechnung.ocr_json?.[field]?.confidence
    if (!conf) return ''
    if (conf >= 0.95) return 'ring-1 ring-status-active/40'
    if (conf >= 0.80) return 'ring-1 ring-status-warning/40'
    return 'ring-1 ring-status-danger/40'
  }

  return (
    <div className="space-y-6">
      {/* Kategorie */}
      <div className="card-base p-5">
        <p className="label-caps mb-4">Kategorie</p>
        <Select
          value={form.rechnungstyp}
          onValueChange={v => setForm(f => ({ ...f, rechnungstyp: v as Rechnungstyp | '' }))}
        >
          <SelectTrigger>
            <SelectValue placeholder="— Kategorie wählen" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="bewirtung">Bewirtung</SelectItem>
            <SelectItem value="dienstleistung">Dienstleistung</SelectItem>
            <SelectItem value="tanken_diesel">Tanken Diesel</SelectItem>
            <SelectItem value="tanken_super">Tanken Super</SelectItem>
          </SelectContent>
        </Select>
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
                <SelectItem value="10">10%</SelectItem>
                <SelectItem value="20">20%</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="col-span-2 flex items-center justify-between bg-bg-muted rounded-card-sm px-3 py-2.5">
            <span className="label-caps">Bruttobetrag</span>
            <span className="text-base font-semibold text-ink">€ {brutto.toFixed(2)}</span>
          </div>

          {/* Bewirtung: USt-Aufschlüsselung */}
          {form.rechnungstyp === 'bewirtung' && (
            <div className="col-span-2 space-y-2 pt-1">
              <p className="label-caps text-ink-subtle">USt-Aufschlüsselung (Bewirtung)</p>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label className="label-caps text-ink-subtle mb-1 block">Netto 10%</Label>
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted text-xs">€</span>
                    <Input
                      type="number" step="0.01"
                      value={form.betrag_10}
                      onChange={e => setForm(f => ({ ...f, betrag_10: e.target.value }))}
                      className="pl-6 font-mono text-xs h-8"
                      placeholder="0.00"
                    />
                  </div>
                </div>
                <div>
                  <Label className="label-caps text-ink-subtle mb-1 block">Netto 20%</Label>
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted text-xs">€</span>
                    <Input
                      type="number" step="0.01"
                      value={form.betrag_20}
                      onChange={e => setForm(f => ({ ...f, betrag_20: e.target.value }))}
                      className="pl-6 font-mono text-xs h-8"
                      placeholder="0.00"
                    />
                  </div>
                </div>
                <div>
                  <Label className="label-caps text-ink-subtle mb-1 block">Trinkgeld 0%</Label>
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted text-xs">€</span>
                    <Input
                      type="number" step="0.01"
                      value={form.betrag_0}
                      onChange={e => setForm(f => ({ ...f, betrag_0: e.target.value }))}
                      className="pl-6 font-mono text-xs h-8"
                      placeholder="0.00"
                    />
                  </div>
                </div>
              </div>
              {(form.betrag_10 || form.betrag_20 || form.betrag_0) && (
                <div className="flex items-center justify-between bg-bg-muted rounded-card-sm px-3 py-2 text-xs">
                  <span className="label-caps">USt. gesamt</span>
                  <span className="font-mono font-semibold text-ink">
                    € {(
                      parseFloat(form.betrag_10 || '0') * 0.10 +
                      parseFloat(form.betrag_20 || '0') * 0.20
                    ).toFixed(2)}
                  </span>
                </div>
              )}
            </div>
          )}
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

      {/* Export */}
      <div className="card-base p-5">
        <p className="label-caps mb-3">Export</p>
        <button
          onClick={() => handleExport('lexoffice')}
          disabled={isExporting}
          className={cn(
            'w-full flex items-center justify-center gap-1.5 py-2.5 rounded-card-sm text-sm font-medium transition-all disabled:opacity-40',
            confirmingZiel === 'lexoffice'
              ? 'bg-status-warning text-white'
              : 'bg-accent-500 hover:bg-accent-600 text-white'
          )}
        >
          <ArrowUpFromLine size={13} />
          {confirmingZiel === 'lexoffice' ? 'Bestätigen?' : '→ sevDesk'}
        </button>
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
