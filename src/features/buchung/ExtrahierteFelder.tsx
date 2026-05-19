import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { CreditCard, X, AlertTriangle, ArrowUpFromLine, Sparkles, Loader2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { useUpdateRechnung, useDeleteRechnung } from '@/features/inbox/useRechnungen'
import { useTriggerExport } from '@/features/exports/useExports'
import { geminiOcr, pdfUrlToBase64, normalizeDate, resolveCard, effectiveNetto } from '@/lib/gemini-ocr'
import { useKategorien } from '@/features/kategorien/useKategorien'
import { supabase } from '@/lib/supabase'
import type { Rechnung, RechnungStatus, ExportZiel, Rechnungstyp } from '@/types/database'
import { formatDate, cn } from '@/lib/utils'

interface ExtrahierteFelder_Props {
  rechnung: Rechnung
}

const KARTEN: { label: string; value: string }[] = [
  { label: 'Spesen Philipp ···1380', value: 'spesen_philipp_1380' },
  { label: 'Spesen Philipp ···0744', value: 'spesen_philipp_0744' },
  { label: 'Firmenkarte ···6362',    value: 'firmenkarte_6362' },
  { label: 'Firmenkarte ···0660',    value: 'firmenkarte_0660' },
]

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
  const [ocrLoading, setOcrLoading] = useState(false)
  const { data: kategorien = [] } = useKategorien()

  const handleOcr = async () => {
    if (!rechnung.pdf_url || rechnung.pdf_url === 'demo') return
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY
    if (!apiKey) { toast.error('VITE_GEMINI_API_KEY nicht gesetzt'); return }
    setOcrLoading(true)
    try {
      const base64 = await pdfUrlToBase64(rechnung.pdf_url)
      const ocr = await geminiOcr(base64, apiKey, kategorien)
      const updated: string[] = []
      const validTypes = kategorien.map(k => k.wert)
      setForm(f => {
        const next = { ...f }
        if (ocr.invoice_date) { next.rechnungsdatum = normalizeDate(ocr.invoice_date) ?? f.rechnungsdatum; updated.push('Rechnungsdatum') }
        if (ocr.due_date)     { next.faelligkeit    = normalizeDate(ocr.due_date)     ?? f.faelligkeit;    updated.push('Fälligkeit') }
        if (ocr.invoice_number?.trim()) { next.rechnungsnr = ocr.invoice_number.trim(); updated.push('Rechnungs-Nr.') }
        const netto = effectiveNetto(ocr); if (netto) { next.betrag = String(netto); updated.push('Betrag') }

        if (ocr.is_proforma) {
          // Proforma: keine MwSt
          next.ust_satz = '0'
          next.betrag_10 = ''; next.betrag_20 = ''; next.betrag_0 = ''
          next.mwst_10 = '';   next.mwst_20 = ''
          updated.push('Proforma (0% USt.)')
        } else {
          if (ocr.tax_rate)     { next.ust_satz = String(ocr.tax_rate); updated.push('USt.') }
          if (ocr.net_amount_10 != null) { next.betrag_10 = String(ocr.net_amount_10); updated.push('Netto 10%') }
          if (ocr.net_amount_20 != null) { next.betrag_20 = String(ocr.net_amount_20); updated.push('Netto 20%') }
          if (ocr.net_amount_0  != null) { next.betrag_0  = String(ocr.net_amount_0);  updated.push('Trinkgeld') }
          if (ocr.tax_amount_10 != null) { next.mwst_10 = String(ocr.tax_amount_10) }
          if (ocr.tax_amount_20 != null) { next.mwst_20 = String(ocr.tax_amount_20) }
        }

        if (ocr.invoice_type && validTypes.includes(ocr.invoice_type)) {
          next.rechnungstyp = ocr.invoice_type as Rechnungstyp
          updated.push('Kategorie')
        }
        const card = resolveCard(ocr.card_last_four)
        if (card) { next.karte = card; updated.push('Karte') }
        return next
      })

      // Lieferant aktualisieren wenn OCR einen Namen gefunden hat
      if (ocr.supplier_name && !rechnung.lieferant_id) {
        const name = ocr.supplier_name.trim()
        const { data: existing } = await supabase
          .from('lieferanten').select('id').ilike('name', name).maybeSingle()
        const lieferantId = existing?.id ?? (
          await supabase.from('lieferanten').insert({ name }).select('id').single()
        ).data?.id
        if (lieferantId) {
          updateRechnung({ id: rechnung.id, updates: { lieferant_id: lieferantId } as any })
          updated.push('Lieferant')
        }
      }

      toast.success(updated.length > 0 ? `OCR: ${updated.join(', ')}` : 'Keine neuen Felder gefunden')
    } catch (err) {
      toast.error(`OCR fehlgeschlagen: ${err instanceof Error ? err.message : 'Unbekannter Fehler'}`)
    } finally {
      setOcrLoading(false)
    }
  }

  const ocrNetto = (rechnung.ocr_json as any)?.invoice_net_amount
  const nettoWert = ocrNetto ?? rechnung.betrag

  const [form, setForm] = useState({
    rechnungsnr: rechnung.rechnungsnr,
    rechnungsdatum: rechnung.rechnungsdatum ?? '',
    betrag: nettoWert.toString(),
    ust_satz: rechnung.ust_satz.toString(),
    faelligkeit: rechnung.faelligkeit ?? '',
    skonto_datum: rechnung.skonto_datum ?? '',
    skonto_prozent: rechnung.skonto_prozent?.toString() ?? '',
    status: rechnung.status,
    karte: rechnung.karte ?? '',
    rechnungstyp: rechnung.rechnungstyp ?? '' as Rechnungstyp | '',
    betrag_10: rechnung.betrag_10?.toString() ?? '',
    betrag_20: rechnung.betrag_20?.toString() ?? '',
    betrag_0: rechnung.betrag_0?.toString() ?? '',
    mwst_10: rechnung.mwst_10?.toString() ?? '',
    mwst_20: rechnung.mwst_20?.toString() ?? '',
  })

  useEffect(() => {
    const ocrNettoVal = (rechnung.ocr_json as any)?.invoice_net_amount
    setForm({
      rechnungsnr: rechnung.rechnungsnr,
      rechnungsdatum: rechnung.rechnungsdatum ?? '',
      betrag: (ocrNettoVal ?? rechnung.betrag).toString(),
      ust_satz: rechnung.ust_satz.toString(),
      faelligkeit: rechnung.faelligkeit ?? '',
      skonto_datum: rechnung.skonto_datum ?? '',
      skonto_prozent: rechnung.skonto_prozent?.toString() ?? '',
      status: rechnung.status,
      karte: rechnung.karte ?? '',
      rechnungstyp: rechnung.rechnungstyp ?? '',
      betrag_10: rechnung.betrag_10?.toString() ?? '',
      betrag_20: rechnung.betrag_20?.toString() ?? '',
      betrag_0: rechnung.betrag_0?.toString() ?? '',
      mwst_10: rechnung.mwst_10?.toString() ?? '',
      mwst_20: rechnung.mwst_20?.toString() ?? '',
    })
  }, [rechnung])

  const hasBreakdown = parseFloat(form.betrag_10 || '0') > 0 || parseFloat(form.betrag_20 || '0') > 0
  const n10 = parseFloat(form.betrag_10 || '0')
  const n20 = parseFloat(form.betrag_20 || '0')
  const n0  = parseFloat(form.betrag_0  || '0')
  const t10 = form.mwst_10 ? parseFloat(form.mwst_10) : Math.round(n10 * 0.10 * 100) / 100
  const t20 = form.mwst_20 ? parseFloat(form.mwst_20) : Math.round(n20 * 0.20 * 100) / 100
  const breakdownBrutto = Math.round((n10 + t10 + n20 + t20 + n0) * 100) / 100

  // For single-rate: prefer stored MwSt amount over calculated (avoids rounding diff)
  const storedSingleMwst = !hasBreakdown
    ? (form.mwst_20 ? parseFloat(form.mwst_20) : form.mwst_10 ? parseFloat(form.mwst_10) : null)
    : null
  const singleMwst = storedSingleMwst
    ?? Math.round(parseFloat(form.betrag || '0') * parseFloat(form.ust_satz || '0') / 100 * 100) / 100

  const ustSatzNum = parseFloat(form.ust_satz || '0')
  const brutto = hasBreakdown && breakdownBrutto > 0
    ? breakdownBrutto
    : ustSatzNum > 0
      ? Math.round((parseFloat(form.betrag || '0') + singleMwst) * 100) / 100
      : parseFloat(form.betrag || '0')
  const skontoWert = parseFloat(form.betrag || '0') * (parseFloat(form.skonto_prozent || '0') / 100)

  const handleSave = () => {
    updateRechnung({
      id: rechnung.id,
      updates: {
        rechnungsnr: form.rechnungsnr,
        rechnungsdatum: form.rechnungsdatum || null,
        betrag: parseFloat(form.betrag),
        ust_satz: parseFloat(form.ust_satz),
        faelligkeit: form.faelligkeit || null,
        skonto_datum: form.skonto_datum || null,
        skonto_prozent: form.skonto_prozent ? parseFloat(form.skonto_prozent) : null,
        status: form.status as RechnungStatus,
        karte: form.karte || null,
        rechnungstyp: (form.rechnungstyp || null) as Rechnungstyp | null,
        betrag_10: form.betrag_10 ? parseFloat(form.betrag_10) : null,
        betrag_20: form.betrag_20 ? parseFloat(form.betrag_20) : null,
        betrag_0: form.rechnungstyp === 'bewirtung' && form.betrag_0 ? parseFloat(form.betrag_0) : null,
        mwst_10: form.mwst_10 ? parseFloat(form.mwst_10) : null,
        mwst_20: form.mwst_20 ? parseFloat(form.mwst_20) : null,
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
      {/* OCR Button */}
      {rechnung.pdf_url && rechnung.pdf_url !== 'demo' && (
        <button
          onClick={handleOcr}
          disabled={ocrLoading}
          className="w-full inline-flex items-center justify-center gap-2 h-10 rounded-card border border-border/60 text-sm font-medium text-ink-muted hover:bg-bg-muted transition-colors disabled:opacity-40"
        >
          {ocrLoading
            ? <><Loader2 size={14} className="animate-spin" /> OCR läuft…</>
            : <><Sparkles size={14} /> Felder per OCR ergänzen</>
          }
        </button>
      )}

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
          <SelectContent className="bg-white border border-border shadow-md">
            {kategorien.map(k => (
              <SelectItem key={k.wert} value={k.wert}>{k.name}</SelectItem>
            ))}
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

          <div className="col-span-2">
            <Label className="label-caps text-ink-subtle mb-1.5 block">Rechnungsdatum</Label>
            <Input
              type="date"
              value={form.rechnungsdatum}
              onChange={e => setForm(f => ({ ...f, rechnungsdatum: e.target.value }))}
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
              <SelectContent className="bg-white border border-border shadow-md">
                <SelectItem value="0">0%</SelectItem>
                <SelectItem value="10">10%</SelectItem>
                <SelectItem value="19">19%</SelectItem>
                <SelectItem value="20">20%</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* MwSt-Zeile nur wenn keine Aufschlüsselung und USt-Satz gesetzt */}
          {!hasBreakdown && ustSatzNum > 0 && (
            <div className="col-span-2 flex items-center justify-between bg-bg-muted/50 rounded-card-sm px-3 py-2">
              <span className="label-caps">MwSt ({form.ust_satz}%)</span>
              <span className="text-sm font-mono text-status-warning">
                € {singleMwst.toFixed(2)}
              </span>
            </div>
          )}

          <div className="col-span-2 flex items-center justify-between bg-bg-muted rounded-card-sm px-3 py-2.5">
            <span className="label-caps">Bruttobetrag</span>
            <span className="text-base font-semibold text-ink">€ {brutto.toFixed(2)}</span>
          </div>

          {/* MwSt-Aufschlüsselung: Bewirtung + Tanken */}
          {hasBreakdown && (() => {
            const totalNetto  = Math.round((n10 + n20 + n0) * 100) / 100
            const totalMwst   = Math.round((t10 + t20) * 100) / 100
            return (
              <div className="col-span-2 pt-1">
                <p className="label-caps text-ink-subtle mb-2">MwSt-Aufschlüsselung</p>
                {/* Header */}
                <div className="grid grid-cols-4 gap-1 mb-1 px-1">
                  {['Satz', 'Netto', 'MwSt', 'Brutto'].map(h => (
                    <span key={h} className="label-caps text-ink-subtle text-right first:text-left">{h}</span>
                  ))}
                </div>
                {/* 10% row */}
                <div className="grid grid-cols-4 gap-1 items-center mb-1">
                  <span className="text-xs font-medium text-ink">10%</span>
                  <div className="relative">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-ink-muted text-xs">€</span>
                    <Input type="number" step="0.01" value={form.betrag_10}
                      onChange={e => setForm(f => ({ ...f, betrag_10: e.target.value }))}
                      className="pl-5 font-mono text-xs h-8 text-right" placeholder="—" />
                  </div>
                  <div className="h-8 flex items-center justify-end px-2 bg-bg-muted rounded-card-sm text-xs font-mono text-ink-muted">
                    {n10 > 0 ? `€ ${t10.toFixed(2)}` : '—'}
                  </div>
                  <div className="h-8 flex items-center justify-end px-2 bg-bg-muted rounded-card-sm text-xs font-mono text-ink">
                    {n10 > 0 ? `€ ${(n10 + t10).toFixed(2)}` : '—'}
                  </div>
                </div>
                {/* 20% row */}
                <div className="grid grid-cols-4 gap-1 items-center mb-1">
                  <span className="text-xs font-medium text-ink">20%</span>
                  <div className="relative">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-ink-muted text-xs">€</span>
                    <Input type="number" step="0.01" value={form.betrag_20}
                      onChange={e => setForm(f => ({ ...f, betrag_20: e.target.value }))}
                      className="pl-5 font-mono text-xs h-8 text-right" placeholder="—" />
                  </div>
                  <div className="h-8 flex items-center justify-end px-2 bg-bg-muted rounded-card-sm text-xs font-mono text-ink-muted">
                    {n20 > 0 ? `€ ${t20.toFixed(2)}` : '—'}
                  </div>
                  <div className="h-8 flex items-center justify-end px-2 bg-bg-muted rounded-card-sm text-xs font-mono text-ink">
                    {n20 > 0 ? `€ ${(n20 + t20).toFixed(2)}` : '—'}
                  </div>
                </div>
                {/* 0% row — nur Bewirtung */}
                {(form.rechnungstyp === 'bewirtung' || parseFloat(form.betrag_0 || '0') > 0) && (
                  <div className="grid grid-cols-4 gap-1 items-center mb-1">
                    <span className="text-xs font-medium text-ink">0% Tipp</span>
                    <div className="relative">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-ink-muted text-xs">€</span>
                      <Input type="number" step="0.01" value={form.betrag_0}
                        onChange={e => setForm(f => ({ ...f, betrag_0: e.target.value }))}
                        className="pl-5 font-mono text-xs h-8 text-right" placeholder="—" />
                    </div>
                    <div className="h-8 flex items-center justify-end px-2 bg-bg-muted rounded-card-sm text-xs font-mono text-ink-muted">—</div>
                    <div className="h-8 flex items-center justify-end px-2 bg-bg-muted rounded-card-sm text-xs font-mono text-ink">
                      {n0 > 0 ? `€ ${n0.toFixed(2)}` : '—'}
                    </div>
                  </div>
                )}
                {/* Summenzeile */}
                {(n10 > 0 || n20 > 0 || n0 > 0) && (
                  <div className="grid grid-cols-4 gap-1 mt-1 pt-1 border-t border-border/50">
                    <span className="label-caps text-ink">Σ</span>
                    <div className="text-right px-2 text-xs font-mono font-semibold text-ink">€ {totalNetto.toFixed(2)}</div>
                    <div className="text-right px-2 text-xs font-mono font-semibold text-status-warning">€ {totalMwst.toFixed(2)}</div>
                    <div className="text-right px-2 text-xs font-mono font-semibold text-ink">€ {breakdownBrutto.toFixed(2)}</div>
                  </div>
                )}
              </div>
            )
          })()}
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
              <SelectContent className="bg-white border border-border shadow-md">
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

          <div className="col-span-2">
            <Label className="label-caps text-ink-subtle mb-1.5 block">Karte</Label>
            <select
              value={form.karte}
              onChange={e => setForm(f => ({ ...f, karte: e.target.value }))}
              className="w-full h-10 pl-3 pr-8 text-sm border border-input rounded-md bg-background text-ink focus:outline-none focus:ring-1 focus:ring-accent-400 appearance-none"
            >
              <option value="">— Keine Karte</option>
              {KARTEN.map(k => (
                <option key={k.value} value={k.value}>{k.label}</option>
              ))}
            </select>
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
