import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { differenceInDays, parseISO, format } from 'date-fns'
import { de } from 'date-fns/locale'
import { Search, Clock, AlertTriangle, Inbox, CheckCircle, Upload, FileText, Loader2, ChevronDown, Building2, FileSpreadsheet, Sparkles } from 'lucide-react'
import * as XLSX from 'xlsx'
import { toast } from 'sonner'
import { PageTitle } from '@/components/shared/PageTitle'
import { StatCard } from '@/components/shared/StatCard'
import { SectionCard } from '@/components/shared/SectionCard'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { ProjectColorDot } from '@/components/shared/ProjectColorDot'
import { EmptyState } from '@/components/shared/EmptyState'
import { ErrorState } from '@/components/shared/ErrorState'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { geminiOcr, fileToBase64, normalizeDate, resolveCard, effectiveNetto } from '@/lib/gemini-ocr'
import { supabase } from '@/lib/supabase'
import { useRechnungen, useUpdateRechnung } from './useRechnungen'
import { BulkOcrDialog } from './BulkOcrDialog'
import { useMitarbeiter } from './useMitarbeiter'
import { useTriggerExport } from '@/features/exports/useExports'
import { formatEuro, formatDate, cn } from '@/lib/utils'
import type { Rechnung, Rechnungstyp, RechnungStatus, ExportZiel } from '@/types/database'

const ACCEPTED_TYPES = '.pdf,.heic,.heif,.jpg,.jpeg,.png,.webp'

type FileStatus = 'pending' | 'converting' | 'uploading' | 'ocr' | 'done' | 'error'
interface FileEntry { id: string; name: string; status: FileStatus; error?: string; supplier?: string }

function isImageFile(file: File): boolean {
  return file.type.startsWith('image/') || /\.(heic|heif|jpe?g|png|webp)$/i.test(file.name)
}

function isHeic(file: File): boolean {
  return file.type === 'image/heic' || file.type === 'image/heif' ||
    /\.(heic|heif)$/i.test(file.name)
}

async function convertImageToPdf(file: File): Promise<File> {
  let imageBlob: Blob = file

  if (isHeic(file)) {
    const heic2any = (await import('heic2any')).default
    const result = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.90 })
    imageBlob = Array.isArray(result) ? result[0] : result
  }

  // Object URL avoids huge base64 strings — much more reliable on mobile Safari
  const objectUrl = URL.createObjectURL(imageBlob)
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image()
    el.onload = () => resolve(el)
    el.onerror = () => reject(new Error('Bild konnte nicht geladen werden'))
    el.src = objectUrl
  })

  // Scale down to max 2480px (A4 @ 300dpi) so mobile memory stays manageable
  const MAX_DIM = 2480
  const scale = Math.min(1, MAX_DIM / Math.max(img.naturalWidth || 1, img.naturalHeight || 1))
  const cw = Math.max(1, Math.round(img.naturalWidth * scale))
  const ch = Math.max(1, Math.round(img.naturalHeight * scale))

  const canvas = document.createElement('canvas')
  canvas.width = cw
  canvas.height = ch
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas nicht verfügbar')
  ctx.drawImage(img, 0, 0, cw, ch)
  URL.revokeObjectURL(objectUrl)

  // canvas.toDataURL is synchronous and avoids an extra FileReader round-trip
  const jpegDataUrl = canvas.toDataURL('image/jpeg', 0.90)
  if (jpegDataUrl === 'data:,') throw new Error('Canvas-Export fehlgeschlagen')

  const { jsPDF } = await import('jspdf')
  const A4_W = 210, A4_H = 297
  const mmPerPx = 25.4 / 96
  let imgW = cw * mmPerPx
  let imgH = ch * mmPerPx
  const orientation = imgW > imgH ? 'l' : 'p'
  const pageW = orientation === 'p' ? A4_W : A4_H
  const pageH = orientation === 'p' ? A4_H : A4_W
  if (imgW > pageW || imgH > pageH) {
    const s = Math.min(pageW / imgW, pageH / imgH)
    imgW *= s; imgH *= s
  }
  const doc = new jsPDF({ orientation, unit: 'mm', format: 'a4' })
  doc.addImage(jpegDataUrl, 'JPEG', (pageW - imgW) / 2, (pageH - imgH) / 2, imgW, imgH)

  const blob = doc.output('blob')
  if (!blob || blob.size < 100) throw new Error('PDF-Erzeugung fehlgeschlagen (leeres Ergebnis)')
  return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.pdf', { type: 'application/pdf' })
}

function FileStatusIcon({ status }: { status: FileStatus }) {
  if (status === 'done')  return <CheckCircle size={14} className="text-status-active flex-shrink-0" />
  if (status === 'error') return <span className="text-status-danger text-xs flex-shrink-0">✕</span>
  return <Loader2 size={14} className="text-accent-500 animate-spin flex-shrink-0" />
}

function fileStatusLabel(status: FileStatus): string {
  switch (status) {
    case 'pending':    return 'Wartend…'
    case 'converting': return 'Konvertierung…'
    case 'uploading':  return 'Hochladen…'
    case 'ocr':        return 'OCR läuft…'
    case 'done':       return 'Fertig'
    default:           return ''
  }
}

async function findOrCreateLieferant(name: string | null | undefined): Promise<string | null> {
  if (!name?.trim()) return null
  const { data: existing } = await supabase
    .from('lieferanten')
    .select('id')
    .ilike('name', name.trim())
    .limit(1)
    .maybeSingle()
  if (existing) return existing.id
  const { data: created } = await supabase
    .from('lieferanten')
    .insert({ name: name.trim(), ustid: null, iban: null, auto_kostengruppe: null, anzahl_rechnungen: 1 })
    .select('id')
    .single()
  return created?.id ?? null
}

function PdfUploadDialog({ open, onClose, onRefresh }: {
  open: boolean
  onClose: () => void
  onRefresh: () => void
}) {
  const [entries, setEntries] = useState<FileEntry[]>([])
  const [dragover, setDragover] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const isDone = entries.length > 0 && entries.every(e => e.status === 'done' || e.status === 'error')
  const isBusy = entries.length > 0 && !isDone

  const reset = () => setEntries([])
  const handleClose = () => { if (!isBusy) { reset(); onClose() } }

  const updateEntry = useCallback((id: string, patch: Partial<FileEntry>) => {
    setEntries(prev => prev.map(e => e.id === id ? { ...e, ...patch } : e))
  }, [])

  const processFiles = useCallback(async (files: File[]) => {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY as string | undefined
    const valid = files.filter(f =>
      f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf') || isImageFile(f)
    )
    if (!valid.length) { toast.error('Keine gültigen Dateien (PDF, HEIC, JPG, PNG, WEBP).'); return }
    if (!apiKey) { toast.error('Kein Gemini API Key konfiguriert – Rechnungen werden ohne OCR hochgeladen.') }

    const newEntries: FileEntry[] = valid.map(f => ({
      id: crypto.randomUUID(), name: f.name, status: 'pending',
    }))
    setEntries(prev => [...prev, ...newEntries])

    // Sequenziell verarbeiten (Gemini Rate-Limit)
    for (let i = 0; i < valid.length; i++) {
      const file = valid[i]
      const { id } = newEntries[i]
      let pdfFile = file

      // 1. Bild → PDF
      if (isImageFile(file)) {
        updateEntry(id, { status: 'converting' })
        try {
          pdfFile = await convertImageToPdf(file)
        } catch (err) {
          updateEntry(id, { status: 'error', error: err instanceof Error ? err.message : 'Konvertierung fehlgeschlagen' })
          continue
        }
      }

      // 2. Upload → Supabase Storage
      updateEntry(id, { status: 'uploading' })
      const storagePath = `${Date.now()}_${pdfFile.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
      const { error: storageError } = await supabase.storage
        .from('rechnungen')
        .upload(storagePath, pdfFile, { contentType: 'application/pdf', upsert: false })
      if (storageError) {
        updateEntry(id, { status: 'error', error: `Storage: ${storageError.message}` })
        continue
      }
      const { data: { publicUrl } } = supabase.storage.from('rechnungen').getPublicUrl(storagePath)

      // 3. Gemini OCR
      updateEntry(id, { status: 'ocr' })
      let ocr: Awaited<ReturnType<typeof geminiOcr>> | null = null
      if (apiKey) {
        try {
          const base64 = await fileToBase64(pdfFile)
          ocr = await geminiOcr(base64, apiKey)
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'OCR fehlgeschlagen'
          updateEntry(id, { status: 'error', error: `OCR: ${msg}` })
          continue
        }
      }

      // 4. Lieferant suchen / anlegen
      const lieferantId = await findOrCreateLieferant(ocr?.supplier_name)

      // 5. Rechnung einfügen
      const validTypes = ['bewirtung', 'dienstleistung', 'tanken_diesel', 'tanken_super']
      const rechnungstyp = ocr?.invoice_type && validTypes.includes(ocr.invoice_type)
        ? ocr.invoice_type as any
        : null

      const { error: insertError } = await supabase.from('rechnungen').insert({
        pdf_url:       publicUrl,
        rechnungsnr:   ocr?.invoice_number?.trim() || `BELEG-${Date.now()}`,
        betrag:        (ocr ? effectiveNetto(ocr) : null) ?? 0,
        ust_satz:      ocr?.tax_rate          ?? 20,
        faelligkeit:   normalizeDate(ocr?.due_date),
        rechnungsdatum: normalizeDate(ocr?.invoice_date),
        rechnungstyp,
        betrag_10:     ocr?.net_amount_10  ?? null,
        betrag_20:     ocr?.net_amount_20  ?? null,
        betrag_0:      ocr?.net_amount_0   ?? null,
        mwst_10:       ocr?.tax_amount_10  ?? null,
        mwst_20:       ocr?.tax_amount_20  ?? null,
        karte:         resolveCard(ocr?.card_last_four),
        status:        'eingegangen',
        lieferant_id:  lieferantId,
        mitarbeiter:   null,
        skonto_datum:  null,
        skonto_prozent: null,
        ocr_json:      ocr as any ?? null,
      })

      if (insertError) {
        updateEntry(id, { status: 'error', error: insertError.message })
        continue
      }

      updateEntry(id, { status: 'done', supplier: ocr?.supplier_name ?? undefined })
      await new Promise(r => setTimeout(r, 500))
    }

    onRefresh()
  }, [updateEntry, onRefresh])

  // Auto-close nach 1.5s wenn alles fertig
  useEffect(() => {
    if (!isDone) return
    const t = setTimeout(() => { reset(); onClose(); }, 1500)
    return () => clearTimeout(t)
  }, [isDone, onClose])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragover(false)
    processFiles(Array.from(e.dataTransfer.files))
  }, [processFiles])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    if (files.length) processFiles(files)
    e.target.value = ''
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && handleClose()}>
      <DialogContent className="max-w-lg bg-white border border-border shadow-xl">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold text-ink">Rechnungen hochladen</DialogTitle>
        </DialogHeader>

        <div className="pt-2">
          <input ref={inputRef} type="file" accept={ACCEPTED_TYPES} multiple className="hidden" onChange={handleFileChange} />

          {/* Dateiliste */}
          {entries.length > 0 && (
            <div className="rounded-card border border-border overflow-hidden mb-3">
              <div className="max-h-48 overflow-y-auto divide-y divide-border/50">
                {entries.map(entry => (
                  <div key={entry.id} className="flex items-center gap-3 px-3.5 py-2.5">
                    <FileStatusIcon status={entry.status} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-ink truncate">{entry.name}</p>
                      {entry.error
                        ? <p className="text-xs text-status-danger truncate">{entry.error}</p>
                        : <p className="text-xs text-ink-muted">
                            {entry.status !== 'done' && fileStatusLabel(entry.status)}
                            {entry.status === 'done' && (entry.supplier ?? 'Fertig')}
                          </p>
                      }
                    </div>
                  </div>
                ))}
              </div>
              {isDone && (
                <div className="px-3.5 py-2 bg-green-50 border-t border-green-200 flex items-center gap-2">
                  <CheckCircle size={13} className="text-status-active" />
                  <span className="text-xs font-medium text-status-active">
                    {entries.filter(e => e.status === 'done').length} von {entries.length} erfolgreich
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Drop-Zone — immer sichtbar */}
          <div
            onDragOver={e => { e.preventDefault(); setDragover(true) }}
            onDragLeave={() => setDragover(false)}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
            className={cn(
              'flex items-center justify-center gap-3 rounded-card border-2 border-dashed cursor-pointer transition-all',
              entries.length > 0 ? 'h-14' : 'h-52 flex-col',
              dragover ? 'border-accent-400 bg-accent-50' : 'border-slate-300 bg-slate-50 hover:border-accent-400 hover:bg-accent-50'
            )}
          >
            <Upload size={entries.length > 0 ? 16 : 22} className={cn('transition-colors flex-shrink-0', dragover ? 'text-accent-500' : 'text-ink-muted')} />
            {entries.length === 0 ? (
              <div className="text-center">
                <p className="text-sm font-medium text-ink mb-1">Dateien hier ablegen</p>
                <p className="text-xs text-ink-muted">oder <span className="text-accent-500 font-semibold underline underline-offset-2">Dateien auswählen</span></p>
              </div>
            ) : (
              <p className="text-xs text-ink-muted">
                <span className="text-accent-500 font-semibold">Weitere Dateien hinzufügen</span>
              </p>
            )}
          </div>

          <div className="flex justify-between items-center mt-4 pt-3 border-t border-border">
            <div className="flex items-center gap-1.5 text-xs text-ink-muted">
              <FileText size={12} />
              <span>PDF, HEIC, JPG, PNG, WEBP</span>
            </div>
            <button
              onClick={handleClose}
              disabled={isBusy}
              className="px-4 py-1.5 rounded-card-sm text-sm font-medium text-ink-muted border border-border hover:bg-bg-muted transition-colors disabled:opacity-40"
            >
              {isDone ? 'Schließen' : 'Abbrechen'}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

type FilterTab = 'alle' | RechnungStatus | 'duplikate'

const RECHNUNGSTYP_LABEL: Record<Rechnungstyp, string> = {
  bewirtung: 'Bewirtung',
  dienstleistung: 'Dienstleistung',
  tanken_diesel: 'Tank Diesel',
  tanken_super: 'Tank Super',
}

const KARTEN: { label: string; value: string }[] = [
  { label: 'Spesen Philipp ···1380', value: 'spesen_philipp_1380' },
  { label: 'Spesen Philipp ···0744', value: 'spesen_philipp_0744' },
  { label: 'Firmenkarte ···6362', value: 'firmenkarte_6362' },
  { label: 'Firmenkarte ···0660', value: 'firmenkarte_0660' },
]

const TABS: { key: FilterTab; label: string }[] = [
  { key: 'alle', label: 'Alle' },
  { key: 'eingegangen', label: 'Neu' },
  { key: 'bezahlt', label: 'Bezahlt' },
]

const STATUS_VARIANT: Record<RechnungStatus, Parameters<typeof StatusBadge>[0]['variant']> = {
  eingegangen: 'info',
  geprüft: 'warning',
  gebucht: 'active',
  bezahlt: 'done',
}
const STATUS_LABEL: Record<RechnungStatus, string> = {
  eingegangen: 'Neu',
  geprüft: 'In Prüfung',
  gebucht: 'Gebucht',
  bezahlt: 'Bezahlt',
}

function isoToday() {
  return new Date().toISOString().split('T')[0]
}

function FaelligkeitCell({ date }: { date: string | null }) {
  if (!date) return <span className="text-ink-muted">—</span>
  const days = differenceInDays(parseISO(date), new Date())
  if (days < 0) return <span className="text-status-danger font-medium">{formatDate(date)} <span className="text-xs">(überfällig)</span></span>
  if (days <= 3) return <span className="text-status-warning font-medium">{formatDate(date)}</span>
  return <span className="text-ink">{formatDate(date)}</span>
}


export function InboxPage() {
  const [activeTab, setActiveTab] = useState<FilterTab>('alle')
  const [kpiFilter, setKpiFilter] = useState<'heute_faellig' | 'skonto_alarm' | null>(null)
  const [search, setSearch] = useState('')
  const [uploadOpen, setUploadOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [bulkOcrOpen, setBulkOcrOpen] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const { data: allRechnungen = [], isLoading, isError, refetch } = useRechnungen()
  const navigate = useNavigate()

  const today = isoToday()

  const kpiEingegangen = allRechnungen.filter(r => r.status === 'eingegangen').length
  const kpiBezahlt = allRechnungen.filter(r => r.status === 'bezahlt').length
  const kpiHeuteFaellig = allRechnungen.filter(r => r.faelligkeit && r.faelligkeit <= today && r.status !== 'bezahlt').length
  const kpiSkontoAlarm = allRechnungen.filter(r => {
    if (!r.skonto_datum) return false
    const d = differenceInDays(parseISO(r.skonto_datum), new Date())
    return d >= 0 && d <= 3
  }).length

  // Compute IDs involved in duplicate pairs (score ≥ 0.5)
  const duplikateIds = useMemo(() => {
    const ids = new Set<string>()
    for (let i = 0; i < allRechnungen.length; i++) {
      for (let j = i + 1; j < allRechnungen.length; j++) {
        const a = allRechnungen[i], b = allRechnungen[j]
        let score = 0
        if (a.rechnungsnr === b.rechnungsnr) score += 0.60
        else {
          const aP = a.rechnungsnr.replace(/\d+$/, ''), bP = b.rechnungsnr.replace(/\d+$/, '')
          if (aP.length > 2 && aP === bP) score += 0.10
        }
        if (a.betrag === b.betrag && a.betrag > 0) score += 0.30
        if (a.ust_satz === b.ust_satz) score += 0.10
        if (score >= 0.5) { ids.add(a.id); ids.add(b.id) }
      }
    }
    return ids
  }, [allRechnungen])

  const filtered = allRechnungen.filter(r => {
    if (kpiFilter === 'heute_faellig') {
      if (!(r.faelligkeit && r.faelligkeit <= today && r.status !== 'bezahlt')) return false
    } else if (kpiFilter === 'skonto_alarm') {
      if (!r.skonto_datum) return false
      const d = differenceInDays(parseISO(r.skonto_datum), new Date())
      if (!(d >= 0 && d <= 3)) return false
    } else {
      if (activeTab === 'duplikate') { if (!duplikateIds.has(r.id)) return false }
      else if (activeTab !== 'alle' && r.status !== activeTab) return false
    }
    if (search) {
      const q = search.toLowerCase()
      return (
        r.rechnungsnr.toLowerCase().includes(q) ||
        (r.lieferant?.name ?? (r.ocr_json as any)?.supplier_name ?? '').toLowerCase().includes(q)
      )
    }
    return true
  })

  return (
    <div>
      <PageTitle title="Rechnungen" subtitle="OCR-verarbeitete Rechnungen zur Prüfung und Buchung" />

      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-5 mb-6">
        <StatCard label="Neu Eingegangen" value={isLoading ? '…' : kpiEingegangen.toString()} sub="Warten auf Zahlung" icon={<Inbox size={16} />} />
        <StatCard label="Bezahlt" value={isLoading ? '…' : kpiBezahlt.toString()} sub="Erfolgreich abgeschlossen" accent icon={<CheckCircle size={16} />} />
        <StatCard
          label="Heute Fällig"
          value={isLoading ? '…' : kpiHeuteFaellig.toString()}
          sub={kpiHeuteFaellig > 0 ? 'Sofortiger Handlungsbedarf' : 'Keine offenen Posten'}
          icon={<Clock size={16} />}
          active={kpiFilter === 'heute_faellig'}
          onClick={() => setKpiFilter(f => f === 'heute_faellig' ? null : 'heute_faellig')}
        />
        <StatCard
          label="Skonto-Alarm"
          value={isLoading ? '…' : kpiSkontoAlarm.toString()}
          sub="Frist innerhalb 3 Tagen"
          icon={<AlertTriangle size={16} />}
          active={kpiFilter === 'skonto_alarm'}
          onClick={() => setKpiFilter(f => f === 'skonto_alarm' ? null : 'skonto_alarm')}
        />
      </div>

      <PdfUploadDialog
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onRefresh={() => void refetch()}
      />
      <ExcelExportDialog
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        rechnungen={allRechnungen}
      />
      <BulkOcrDialog
        open={bulkOcrOpen}
        onClose={() => { setBulkOcrOpen(false); setSelectedIds(new Set()) }}
        rechnungen={selectedIds.size > 0 ? allRechnungen.filter(r => selectedIds.has(r.id)) : allRechnungen}
        onRefresh={() => void refetch()}
      />

      {/* Table section */}
      <SectionCard
        title="Rechnungen"
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => setBulkOcrOpen(true)}
              className={cn(
                'inline-flex items-center gap-1.5 h-8 px-3 rounded-card-sm text-xs font-medium transition-colors',
                selectedIds.size > 0
                  ? 'bg-ink text-white hover:bg-ink/80'
                  : 'border border-border/60 text-ink-muted hover:bg-bg-muted'
              )}
            >
              <Sparkles size={13} />
              <span className="hidden sm:inline">OCR{selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}</span>
            </button>
            <button
              onClick={() => setExportOpen(true)}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-card-sm border border-border/60 text-ink-muted hover:bg-bg-muted text-xs font-medium transition-colors"
            >
              <FileSpreadsheet size={13} />
              <span className="hidden sm:inline">Excel</span>
            </button>
            <button
              onClick={() => setUploadOpen(true)}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-card-sm bg-accent-500 hover:bg-accent-600 text-white text-xs font-medium transition-colors"
            >
              <Upload size={13} />
              <span className="hidden sm:inline">PDF Import</span>
            </button>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Suchen…"
                className="pl-8 pr-4 h-8 text-sm border border-border rounded-card-sm bg-bg-surface text-ink placeholder:text-ink-subtle focus:outline-none focus:ring-1 focus:ring-accent-400 w-24 sm:w-36 md:w-48"
              />
            </div>
          </div>
        }
      >
        {/* Filter tabs */}
        <div className="flex items-center justify-between gap-2 mb-5 -mt-1">
          <div className="flex items-center gap-1">
            {TABS.map(tab => (
              <button
                key={tab.key}
                onClick={() => { setActiveTab(tab.key); setKpiFilter(null) }}
                className={cn(
                  'px-3.5 h-7 rounded-pill text-label uppercase transition-colors',
                  activeTab === tab.key && !kpiFilter
                    ? 'bg-ink text-white'
                    : 'text-ink-muted hover:bg-bg-muted'
                )}
              >
                {tab.label}
                {tab.key !== 'alle' && (
                  <span className="ml-1.5 opacity-70">
                    {allRechnungen.filter(r => r.status === tab.key).length}
                  </span>
                )}
              </button>
            ))}
            {duplikateIds.size > 0 && (
              <button
                onClick={() => { setActiveTab('duplikate'); setKpiFilter(null) }}
                className={cn(
                  'px-3.5 h-7 rounded-pill text-label uppercase transition-colors flex items-center gap-1.5',
                  activeTab === 'duplikate' && !kpiFilter
                    ? 'bg-status-warning text-white'
                    : 'text-status-warning border border-status-warning/30 hover:bg-status-warning/10'
                )}
              >
                Duplikate
                <span className="opacity-80">{duplikateIds.size}</span>
              </button>
            )}
          </div>
          {kpiFilter && (
            <button
              onClick={() => setKpiFilter(null)}
              className="flex-shrink-0 flex items-center gap-1.5 px-2.5 h-7 rounded-pill bg-ink text-white text-label uppercase"
            >
              {kpiFilter === 'heute_faellig' ? 'Fällig' : 'Skonto'}
              <span className="text-white/70 text-xs">✕</span>
            </button>
          )}
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-14 w-full" />)}
          </div>
        ) : isError ? (
          <ErrorState onRetry={() => void refetch()} />
        ) : filtered.length === 0 ? (
          <EmptyState title="Keine Rechnungen" description="Keine Einträge für den gewählten Filter." />
        ) : (
          <RechnungenTable
            rows={filtered}
            onRowClick={id => navigate(`/buchung/${id}`)}
            selectedIds={selectedIds}
            onToggle={id => setSelectedIds(prev => {
              const next = new Set(prev)
              next.has(id) ? next.delete(id) : next.add(id)
              return next
            })}
            onToggleAll={ids => setSelectedIds(prev =>
              ids.every(id => prev.has(id)) ? new Set() : new Set(ids)
            )}
          />
        )}
      </SectionCard>
    </div>
  )
}

function getBrutto(r: Rechnung): number {
  const netto = (r.ocr_json as any)?.invoice_net_amount ?? r.betrag
  return netto * (1 + r.ust_satz / 100)
}


function ExcelExportDialog({ open, onClose, rechnungen }: {
  open: boolean
  onClose: () => void
  rechnungen: Rechnung[]
}) {
  const currentMonth = format(new Date(), 'yyyy-MM')
  const [month, setMonth] = useState(currentMonth)

  const monthRechnungen = rechnungen.filter(r => r.rechnungsdatum?.startsWith(month))

  const handleExport = () => {
    if (monthRechnungen.length === 0) {
      toast.error('Keine Rechnungen für diesen Monat.')
      return
    }

    const rows = monthRechnungen.map(r => {
      const netto = (r.ocr_json as any)?.invoice_net_amount ?? r.betrag
      const isBewirtung = r.rechnungstyp === 'bewirtung'

      // For Bewirtung: sum up the individual buckets if available
      const netto10 = r.betrag_10 ?? null
      const netto20 = r.betrag_20 ?? null
      const netto0  = r.betrag_0  ?? null
      const mwst10  = netto10 != null ? Math.round(netto10 * 0.10 * 100) / 100 : null
      const mwst20  = netto20 != null ? Math.round(netto20 * 0.20 * 100) / 100 : null

      // Total brutto: prefer breakdown sum, fall back to single rate
      const bruttoFromBreakdown = isBewirtung && (netto10 != null || netto20 != null || netto0 != null)
        ? (netto10 ?? 0) + (mwst10 ?? 0) + (netto20 ?? 0) + (mwst20 ?? 0) + (netto0 ?? 0)
        : null
      const mwstSingle = netto * (r.ust_satz / 100)
      const brutto = bruttoFromBreakdown ?? (netto + mwstSingle)

      const karteLabel = KARTEN.find(k => k.value === r.karte)?.label ?? r.karte ?? ''
      const kategorieLabel = r.rechnungstyp ? RECHNUNGSTYP_LABEL[r.rechnungstyp] : ''

      return {
        'Lieferant': r.lieferant?.name ?? (r.ocr_json as any)?.supplier_name ?? '',
        'Rechnungs-Nr.': r.rechnungsnr,
        'Kategorie': kategorieLabel,
        'Rechnungsdatum': r.rechnungsdatum ? format(parseISO(r.rechnungsdatum), 'dd.MM.yyyy', { locale: de }) : '',
        'Netto gesamt (€)': Math.round(netto * 100) / 100,
        'USt. (%)': isBewirtung && (netto10 != null || netto20 != null) ? '10% / 20%' : r.ust_satz,
        'MwSt. gesamt (€)': bruttoFromBreakdown != null
          ? Math.round(((mwst10 ?? 0) + (mwst20 ?? 0)) * 100) / 100
          : Math.round(mwstSingle * 100) / 100,
        'Brutto (€)': Math.round(brutto * 100) / 100,
        // Bewirtung breakdown
        'Netto 10% (€)': netto10 ?? '',
        'MwSt. 10% (€)': mwst10 ?? '',
        'Netto 20% (€)': netto20 ?? '',
        'MwSt. 20% (€)': mwst20 ?? '',
        'Trinkgeld 0% (€)': netto0 ?? '',
        'Mitarbeiter': r.mitarbeiter ?? '',
        'Karte': karteLabel,
        'PDF': r.pdf_url && r.pdf_url !== 'demo' ? r.pdf_url : '',
      }
    })

    const ws = XLSX.utils.json_to_sheet(rows)

    // Make PDF column cells proper hyperlinks
    const pdfColIndex = Object.keys(rows[0] ?? {}).indexOf('PDF')
    if (pdfColIndex >= 0) {
      rows.forEach((row, rowIdx) => {
        const url = (row as any)['PDF']
        if (!url) return
        const cellAddr = XLSX.utils.encode_cell({ c: pdfColIndex, r: rowIdx + 1 })
        if (ws[cellAddr]) {
          ws[cellAddr].l = { Target: url, Tooltip: 'PDF öffnen' }
        }
      })
    }

    ws['!cols'] = [
      { wch: 24 }, { wch: 18 }, { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 14 },
      { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 12 },
      { wch: 13 }, { wch: 12 }, { wch: 13 }, { wch: 12 }, { wch: 14 },
      { wch: 14 }, { wch: 18 }, { wch: 22 }, { wch: 60 },
    ]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Rechnungen')
    const monthLabel = format(parseISO(`${month}-01`), 'yyyy-MM', { locale: de })
    XLSX.writeFile(wb, `Rechnungen_${monthLabel}.xlsx`)
    toast.success(`${monthRechnungen.length} Rechnungen exportiert`)
    onClose()
  }

  const monthLabel = month ? format(parseISO(`${month}-01`), 'MMMM yyyy', { locale: de }) : ''
  const totalBrutto = monthRechnungen.reduce((sum, r) => sum + getBrutto(r), 0)

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="max-w-sm bg-white border border-border shadow-xl">
        <DialogHeader>
          <div className="flex items-center gap-2.5 mb-1">
            <div className="w-8 h-8 rounded-card-sm bg-bg-muted flex items-center justify-center">
              <FileSpreadsheet size={15} className="text-ink-muted" />
            </div>
            <DialogTitle className="text-base font-semibold text-ink">Excel Export</DialogTitle>
          </div>
        </DialogHeader>

        <div className="pt-1 space-y-4">
          {/* Monat */}
          <div>
            <label className="label-caps block mb-1.5">Monat</label>
            <input
              type="month"
              value={month}
              onChange={e => setMonth(e.target.value)}
              className="w-full h-9 px-3 text-sm border border-border rounded-card-sm bg-bg-surface text-ink focus:outline-none focus:ring-1 focus:ring-accent-400"
            />
          </div>

          {/* Vorschau */}
          <div className={cn(
            'rounded-card border p-3.5 space-y-2 transition-colors',
            monthRechnungen.length > 0 ? 'border-border bg-bg-muted/40' : 'border-border/50 bg-bg-muted/20'
          )}>
            <div className="flex items-center justify-between">
              <span className="text-xs text-ink-muted">Zeitraum</span>
              <span className="text-xs font-medium text-ink">{monthLabel}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-ink-muted">Rechnungen</span>
              <span className="text-xs font-medium text-ink">{monthRechnungen.length}</span>
            </div>
            {monthRechnungen.length > 0 && (
              <div className="flex items-center justify-between border-t border-border/50 pt-2 mt-1">
                <span className="text-xs text-ink-muted">Gesamt Brutto</span>
                <span className="text-sm font-semibold text-ink">{formatEuro(totalBrutto)}</span>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={onClose}
              className="flex-1 h-9 rounded-card-sm border border-border text-sm text-ink-muted hover:bg-bg-muted transition-colors"
            >
              Abbrechen
            </button>
            <button
              onClick={handleExport}
              disabled={monthRechnungen.length === 0}
              className="flex-1 inline-flex items-center justify-center gap-1.5 h-9 rounded-card-sm bg-ink hover:bg-ink/80 disabled:opacity-40 text-white text-sm font-medium transition-colors"
            >
              <FileSpreadsheet size={13} />
              Herunterladen
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function ActionMenu({
  rechnungId,
  status,
  onClose,
  onBezahlt,
  onExport,
}: {
  rechnungId: string
  status: RechnungStatus
  onClose: () => void
  onBezahlt: (e: React.MouseEvent, id: string) => void
  onExport: (e: React.MouseEvent, id: string, ziel: ExportZiel) => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  return (
    <div
      ref={ref}
      className="absolute right-0 top-full mt-1 z-50 w-52 rounded-card border border-border bg-white shadow-lg py-1"
      onClick={e => e.stopPropagation()}
    >
      <button
        onClick={e => onExport(e, rechnungId, 'lexoffice')}
        className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-ink hover:bg-bg-muted transition-colors text-left"
      >
        <Building2 size={13} className="text-ink-muted flex-shrink-0" />
        Zu sevDesk schicken
      </button>
      {status !== 'bezahlt' && (
        <>
          <div className="my-1 border-t border-border/50" />
          <button
            onClick={e => onBezahlt(e, rechnungId)}
            className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-status-active hover:bg-bg-muted transition-colors text-left"
          >
            <CheckCircle size={13} className="flex-shrink-0" />
            Als bezahlt markieren
          </button>
        </>
      )}
    </div>
  )
}

function RechnungenTable({ rows, onRowClick, selectedIds, onToggle, onToggleAll }: {
  rows: Rechnung[]
  onRowClick: (id: string) => void
  selectedIds: Set<string>
  onToggle: (id: string) => void
  onToggleAll: (ids: string[]) => void
}) {
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const { mutate: updateRechnung } = useUpdateRechnung()
  const { mutate: triggerExport } = useTriggerExport()
  const { data: mitarbeiter = [] } = useMitarbeiter()

  const handleBezahlt = (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    setOpenMenu(null)
    updateRechnung(
      { id, updates: { status: 'bezahlt' } },
      { onSuccess: () => toast.success('Rechnung als bezahlt markiert') }
    )
  }

  const handleExport = (e: React.MouseEvent, id: string, ziel: ExportZiel) => {
    e.stopPropagation()
    setOpenMenu(null)
    triggerExport({ rechnungIds: [id], ziel })
  }

  const handleMitarbeiter = (e: React.ChangeEvent<HTMLSelectElement>, id: string) => {
    const value = e.target.value || null
    updateRechnung(
      { id, updates: { mitarbeiter: value } },
      { onError: (err: Error) => toast.error(`Zuweisung fehlgeschlagen: ${err.message}`) }
    )
  }

  const handleKarte = (e: React.ChangeEvent<HTMLSelectElement>, id: string) => {
    const value = e.target.value || null
    updateRechnung(
      { id, updates: { karte: value } },
      { onError: (err: Error) => toast.error(`Kartenzuweisung fehlgeschlagen: ${err.message}`) }
    )
  }

  return (
    <>
      {/* Mobile card list */}
      <div className="md:hidden space-y-2">
        {rows.map(r => (
          <div
            key={r.id}
            className="rounded-card border border-border/50 bg-bg-surface overflow-hidden"
          >
            {/* Clickable main info */}
            <div
              onClick={() => onRowClick(r.id)}
              className="p-4 cursor-pointer hover:bg-bg-hover transition-colors"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <ProjectColorDot id={r.id} />
                  <span className="text-sm font-medium text-ink truncate">
                    {r.lieferant?.name ?? (r.ocr_json as any)?.supplier_name ?? '—'}
                  </span>
                </div>
                <StatusBadge variant={STATUS_VARIANT[r.status]} label={STATUS_LABEL[r.status]} />
              </div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-mono text-ink-muted">{r.rechnungsnr}</span>
                {r.rechnungstyp && (
                  <span className="text-xs text-ink-subtle bg-bg-muted px-1.5 py-0.5 rounded">
                    {RECHNUNGSTYP_LABEL[r.rechnungstyp]}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold text-ink">{formatEuro(getBrutto(r))}</span>
                <span className="text-xs text-ink-muted">{r.ust_satz}% USt.</span>
                {r.faelligkeit && (
                  <span className="text-xs"><FaelligkeitCell date={r.faelligkeit} /></span>
                )}
              </div>
            </div>

            {/* Action bar — nicht navigierbar */}
            <div
              onClick={e => e.stopPropagation()}
              className="px-3 py-2.5 border-t border-border/50 bg-bg-muted/40 space-y-2"
            >
              {/* Zeile 1: Mitarbeiter + Karte */}
              <div className="grid grid-cols-2 gap-1.5">
                <select
                  value={r.mitarbeiter ?? ''}
                  onChange={e => handleMitarbeiter(e, r.id)}
                  className="w-full h-8 pl-3 pr-7 text-xs rounded-card-sm border border-border/60 bg-white text-ink focus:outline-none focus:ring-1 focus:ring-accent-400 appearance-none"
                >
                  <option value="">— Mitarbeiter</option>
                  {mitarbeiter.map(m => (
                    <option key={m.id} value={m.name}>{m.name}</option>
                  ))}
                </select>
                <select
                  value={r.karte ?? ''}
                  onChange={e => handleKarte(e, r.id)}
                  className="w-full h-8 pl-3 pr-7 text-xs rounded-card-sm border border-border/60 bg-white text-ink focus:outline-none focus:ring-1 focus:ring-accent-400 appearance-none"
                >
                  <option value="">— Karte</option>
                  {KARTEN.map(k => (
                    <option key={k.value} value={k.value}>{k.label}</option>
                  ))}
                </select>
              </div>

              {/* Zeile 2: Aktionen gleichmäßig verteilt */}
              <div className={cn('grid gap-1.5', r.status !== 'bezahlt' ? 'grid-cols-2' : 'grid-cols-1')}>
                <button
                  onClick={e => handleExport(e, r.id, 'lexoffice')}
                  className="inline-flex items-center justify-center gap-1 h-8 rounded-card-sm border border-border/60 text-ink-muted hover:bg-bg-muted text-xs font-medium transition-colors"
                >
                  <Building2 size={11} />
                  sevDesk
                </button>
                {r.status !== 'bezahlt' && (
                  <button
                    onClick={e => handleBezahlt(e, r.id)}
                    className="inline-flex items-center justify-center gap-1 h-8 rounded-card-sm bg-status-active/10 text-status-active hover:bg-status-active/20 text-xs font-medium transition-colors"
                  >
                    <CheckCircle size={11} />
                    Bezahlt
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              <th className="pb-3 border-b border-border/50 w-8 pr-2">
                <input
                  type="checkbox"
                  className="rounded border-border cursor-pointer"
                  checked={rows.length > 0 && rows.every(r => selectedIds.has(r.id))}
                  onChange={() => onToggleAll(rows.map(r => r.id))}
                />
              </th>
              {['Lieferant', 'Rechnungs-Nr.', 'Betrag', 'USt.', 'Fälligkeit', 'Kategorie', 'Status', 'Mitarbeiter', 'Karte', 'Aktionen', ''].map(h => (
                <th key={h} className={cn(
                  'label-caps pb-3 border-b border-border/50 text-left font-normal',
                  h === 'Betrag' && 'text-right',
                  h === 'USt.' && 'pl-6'
                )}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr
                key={r.id}
                onClick={() => onRowClick(r.id)}
                className={cn(
                  'h-14 border-b border-border/50 last:border-0 hover:bg-bg-hover cursor-pointer transition-colors',
                  selectedIds.has(r.id) && 'bg-accent-50'
                )}
              >
                <td onClick={e => e.stopPropagation()} className="pr-2">
                  <input
                    type="checkbox"
                    className="rounded border-border cursor-pointer"
                    checked={selectedIds.has(r.id)}
                    onChange={() => onToggle(r.id)}
                  />
                </td>
                <td>
                  <div className="flex items-center gap-2.5">
                    <ProjectColorDot id={r.id} />
                    <span className="text-sm font-medium text-ink truncate max-w-[160px]">
                      {r.lieferant?.name ?? (r.ocr_json as any)?.supplier_name ?? '—'}
                    </span>
                  </div>
                </td>
                <td className="text-sm font-mono text-ink-muted">{r.rechnungsnr}</td>
                <td className="text-right">
                  <span className="text-sm font-semibold text-ink">{formatEuro(getBrutto(r))}</span>
                </td>
                <td className="text-sm text-ink-muted pl-6">{r.ust_satz}%</td>
                <td className="text-sm"><FaelligkeitCell date={r.faelligkeit} /></td>
                <td className="text-xs text-ink-muted">
                  {r.rechnungstyp ? RECHNUNGSTYP_LABEL[r.rechnungstyp] : '—'}
                </td>
                <td>
                  <StatusBadge
                    variant={STATUS_VARIANT[r.status]}
                    label={STATUS_LABEL[r.status]}
                  />
                </td>
                <td onClick={e => e.stopPropagation()} className="pr-4">
                  <select
                    value={r.mitarbeiter ?? ''}
                    onChange={e => handleMitarbeiter(e, r.id)}
                    className="h-7 pl-2.5 pr-7 text-xs rounded-card-sm border border-border/60 bg-bg-surface text-ink focus:outline-none focus:ring-1 focus:ring-accent-400 appearance-none cursor-pointer min-w-[130px]"
                  >
                    <option value="">— Zuweisen</option>
                    {mitarbeiter.map(m => (
                      <option key={m.id} value={m.name}>{m.name}</option>
                    ))}
                  </select>
                </td>
                <td onClick={e => e.stopPropagation()} className="pr-4">
                  <select
                    value={r.karte ?? ''}
                    onChange={e => handleKarte(e, r.id)}
                    className="h-7 pl-2.5 pr-7 text-xs rounded-card-sm border border-border/60 bg-bg-surface text-ink focus:outline-none focus:ring-1 focus:ring-accent-400 appearance-none cursor-pointer min-w-[150px]"
                  >
                    <option value="">— Karte</option>
                    {KARTEN.map(k => (
                      <option key={k.value} value={k.value}>{k.label}</option>
                    ))}
                  </select>
                </td>
                <td onClick={e => e.stopPropagation()}>
                  <div className="relative inline-block">
                    <button
                      onClick={e => { e.stopPropagation(); setOpenMenu(openMenu === r.id ? null : r.id) }}
                      className="inline-flex items-center gap-1.5 px-3 h-7 rounded-card-sm border border-border/60 text-ink-muted hover:bg-bg-muted text-xs font-medium transition-colors"
                    >
                      Aktionen
                      <ChevronDown size={12} className={cn('transition-transform', openMenu === r.id && 'rotate-180')} />
                    </button>
                    {openMenu === r.id && (
                      <ActionMenu
                        rechnungId={r.id}
                        status={r.status}
                        onClose={() => setOpenMenu(null)}
                        onBezahlt={handleBezahlt}
                        onExport={handleExport}
                      />
                    )}
                  </div>
                </td>
                <td onClick={e => e.stopPropagation()} className="pl-2">
                  <button
                    onClick={() => {
                      const next = r.flag === null ? 'yellow' : r.flag === 'yellow' ? 'green' : null
                      updateRechnung({ id: r.id, updates: { flag: next } })
                    }}
                    title={r.flag === 'yellow' ? 'Gelb → Grün' : r.flag === 'green' ? 'Grün → Löschen' : 'Flag setzen'}
                    className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-bg-muted transition-colors"
                  >
                    <svg width="13" height="16" viewBox="0 0 13 16" fill="none">
                      <path d="M1 1v14M1 1h8l-2 4 2 4H1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
                        stroke={r.flag ? 'transparent' : '#CBD5E1'}
                        fill={r.flag === 'yellow' ? '#FBBF24' : r.flag === 'green' ? '#22C55E' : 'none'}
                      />
                      {!r.flag && <path d="M1 1h8l-2 4 2 4H1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" stroke="#CBD5E1" fill="none" />}
                    </svg>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
