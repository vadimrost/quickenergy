import { useState, useRef, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { differenceInDays, parseISO } from 'date-fns'
import { Search, Clock, AlertTriangle, Inbox, CheckCircle, Upload, FileText, Loader2, ChevronDown, Send, Building2 } from 'lucide-react'
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
import { useRechnungen, useUpdateRechnung } from './useRechnungen'
import { useTriggerExport } from '@/features/exports/useExports'
import { formatEuro, formatDate, cn } from '@/lib/utils'
import type { Rechnung, RechnungStatus, ExportZiel } from '@/types/database'

type UploadState = 'idle' | 'dragover' | 'processing' | 'done'

function PdfUploadDialog({ open, onClose, onRefresh }: {
  open: boolean
  onClose: () => void
  onRefresh: () => void
}) {
  const [uploadState, setUploadState] = useState<UploadState>('idle')
  const [fileName, setFileName] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const reset = () => { setUploadState('idle'); setFileName(null) }

  const handleClose = () => { reset(); onClose() }

  const processFile = useCallback(async (file: File) => {
    if (!file.name.endsWith('.pdf')) { toast.error('Nur PDF-Dateien erlaubt.'); return }
    setFileName(file.name)
    setUploadState('processing')

    const webhookUrl = import.meta.env.VITE_N8N_OCR_WEBHOOK_URL as string | undefined
    if (!webhookUrl) {
      setTimeout(() => {
        setUploadState('done')
        toast.success(`${file.name} wird verarbeitet (kein OCR-Webhook konfiguriert)`)
        setTimeout(() => { reset(); onClose(); onRefresh() }, 800)
      }, 1000)
      return
    }

    try {
      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch(webhookUrl, { method: 'POST', body: formData })
      if (!res.ok) throw new Error(`Webhook Fehler: ${res.status}`)

      setUploadState('done')
      toast.success(`${file.name} wurde importiert und verarbeitet`)
      setTimeout(() => { reset(); onClose(); onRefresh() }, 800)
    } catch (err) {
      setUploadState('idle')
      toast.error(`Upload fehlgeschlagen: ${err instanceof Error ? err.message : 'Unbekannter Fehler'}`)
    }
  }, [onClose, onRefresh])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setUploadState('idle')
    const file = e.dataTransfer.files[0]
    if (file) processFile(file)
  }, [processFile])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) processFile(file)
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && handleClose()}>
      <DialogContent className="max-w-lg bg-white border border-border shadow-xl">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold text-ink">Rechnung hochladen</DialogTitle>
        </DialogHeader>

        <div className="pt-2">
          {uploadState === 'processing' ? (
            <div className="flex flex-col items-center justify-center h-52 gap-3 rounded-card bg-bg-muted border border-border">
              <Loader2 size={32} className="text-accent-500 animate-spin" />
              <p className="text-sm font-medium text-ink">OCR wird verarbeitet…</p>
              <p className="text-xs text-ink-muted font-mono truncate max-w-xs">{fileName}</p>
            </div>
          ) : uploadState === 'done' ? (
            <div className="flex flex-col items-center justify-center h-52 gap-3 rounded-card bg-green-50 border border-green-200">
              <CheckCircle size={32} className="text-status-active" />
              <p className="text-sm text-ink font-medium">Import erfolgreich</p>
            </div>
          ) : (
            <div
              onDragOver={e => { e.preventDefault(); setUploadState('dragover') }}
              onDragLeave={() => setUploadState('idle')}
              onDrop={handleDrop}
              onClick={() => inputRef.current?.click()}
              className={cn(
                'relative flex flex-col items-center justify-center h-52 rounded-card border-2 border-dashed cursor-pointer transition-all',
                uploadState === 'dragover'
                  ? 'border-accent-400 bg-accent-50'
                  : 'border-slate-300 bg-slate-50 hover:border-accent-400 hover:bg-accent-50'
              )}
            >
              <input
                ref={inputRef}
                type="file"
                accept=".pdf"
                className="hidden"
                onChange={handleFileChange}
              />
              <div className={cn(
                'w-12 h-12 rounded-xl flex items-center justify-center mb-3 transition-colors',
                uploadState === 'dragover' ? 'bg-accent-100' : 'bg-white border border-slate-200'
              )}>
                <Upload size={22} className={cn('transition-colors', uploadState === 'dragover' ? 'text-accent-500' : 'text-ink-muted')} />
              </div>
              <p className="text-sm font-medium text-ink mb-1">PDF hier ablegen</p>
              <p className="text-xs text-ink-muted">
                oder{' '}
                <span className="text-accent-500 font-semibold underline underline-offset-2">Datei auswählen</span>
              </p>
            </div>
          )}

          <div className="flex justify-between items-center mt-4 pt-3 border-t border-border">
            <div className="flex items-center gap-1.5 text-xs text-ink-muted">
              <FileText size={12} />
              <span>Nur .pdf · max. 25 MB</span>
            </div>
            <button
              onClick={handleClose}
              className="px-4 py-1.5 rounded-card-sm text-sm font-medium text-ink-muted border border-border hover:bg-bg-muted transition-colors"
            >
              Abbrechen
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

type FilterTab = 'alle' | RechnungStatus

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
  const [search, setSearch] = useState('')
  const [uploadOpen, setUploadOpen] = useState(false)
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

  const filtered = allRechnungen.filter(r => {
    if (activeTab !== 'alle' && r.status !== activeTab) return false
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
        <StatCard label="Heute Fällig" value={isLoading ? '…' : kpiHeuteFaellig.toString()} sub={kpiHeuteFaellig > 0 ? 'Sofortiger Handlungsbedarf' : 'Keine offenen Posten'} icon={<Clock size={16} />} />
        <StatCard label="Skonto-Alarm" value={isLoading ? '…' : kpiSkontoAlarm.toString()} sub="Frist innerhalb 3 Tagen" icon={<AlertTriangle size={16} />} />
      </div>

      <PdfUploadDialog
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onRefresh={() => void refetch()}
      />

      {/* Table section */}
      <SectionCard
        title="Rechnungen"
        actions={
          <div className="flex items-center gap-2">
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
                className="pl-8 pr-4 h-8 text-sm border border-border rounded-card-sm bg-bg-surface text-ink placeholder:text-ink-subtle focus:outline-none focus:ring-1 focus:ring-accent-400 w-36 sm:w-48"
              />
            </div>
          </div>
        }
      >
        {/* Filter tabs */}
        <div className="flex items-center gap-1 mb-5 -mt-1">
          {TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                'px-3.5 h-7 rounded-pill text-label uppercase transition-colors',
                activeTab === tab.key
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
          <RechnungenTable rows={filtered} onRowClick={id => navigate(`/buchung/${id}`)} />
        )}
      </SectionCard>
    </div>
  )
}

function getBrutto(r: Rechnung): number {
  const netto = (r.ocr_json as any)?.invoice_net_amount ?? r.betrag
  return netto * (1 + r.ust_satz / 100)
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
        onClick={e => onExport(e, rechnungId, 'datev')}
        className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-ink hover:bg-bg-muted transition-colors text-left"
      >
        <Send size={13} className="text-ink-muted flex-shrink-0" />
        Zu DATEV schicken
      </button>
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

function RechnungenTable({ rows, onRowClick }: { rows: Rechnung[]; onRowClick: (id: string) => void }) {
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const { mutate: updateRechnung } = useUpdateRechnung()
  const { mutate: triggerExport } = useTriggerExport()

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

  return (
    <>
      {/* Mobile card list */}
      <div className="md:hidden space-y-2">
        {rows.map(r => (
          <div
            key={r.id}
            onClick={() => onRowClick(r.id)}
            className="p-4 rounded-card border border-border/50 bg-bg-surface hover:bg-bg-hover cursor-pointer transition-colors"
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
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-mono text-ink-muted mb-1">{r.rechnungsnr}</div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-ink">{formatEuro(getBrutto(r))}</span>
                  <span className="text-xs text-ink-muted">{r.ust_satz}% USt.</span>
                  {r.faelligkeit && (
                    <span className="text-xs"><FaelligkeitCell date={r.faelligkeit} /></span>
                  )}
                </div>
              </div>
              {r.status !== 'bezahlt' && (
                <button
                  onClick={(e) => handleBezahlt(e, r.id)}
                  className="inline-flex items-center gap-1 px-3 h-7 rounded-card-sm bg-status-active/10 text-status-active hover:bg-status-active/20 text-xs font-medium transition-colors flex-shrink-0"
                >
                  <CheckCircle size={12} />
                  Bezahlt
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              {['Lieferant', 'Rechnungs-Nr.', 'Betrag', 'USt.', 'Fälligkeit', 'Status', 'Aktionen'].map(h => (
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
                className="h-14 border-b border-border/50 last:border-0 hover:bg-bg-hover cursor-pointer transition-colors"
              >
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
                <td>
                  <StatusBadge
                    variant={STATUS_VARIANT[r.status]}
                    label={STATUS_LABEL[r.status]}
                  />
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
