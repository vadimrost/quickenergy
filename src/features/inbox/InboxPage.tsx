import { useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { differenceInDays, parseISO } from 'date-fns'
import { Search, Clock, AlertTriangle, Inbox, CheckCircle, Upload, FileText, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { PageTitle } from '@/components/shared/PageTitle'
import { StatCard } from '@/components/shared/StatCard'
import { SectionCard } from '@/components/shared/SectionCard'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { ProjectColorDot } from '@/components/shared/ProjectColorDot'
import { EmptyState } from '@/components/shared/EmptyState'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useRechnungen, useUpdateRechnung } from './useRechnungen'
import { formatEuro, formatDate, cn } from '@/lib/utils'
import type { Rechnung, RechnungStatus } from '@/types/database'

type UploadState = 'idle' | 'dragover' | 'processing' | 'done'

function PdfUploadDialog({ open, onClose, onImported }: {
  open: boolean
  onClose: () => void
  onImported: (r: Rechnung) => void
}) {
  const [uploadState, setUploadState] = useState<UploadState>('idle')
  const [fileName, setFileName] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const reset = () => { setUploadState('idle'); setFileName(null) }

  const handleClose = () => { reset(); onClose() }

  const processFile = useCallback((file: File) => {
    if (!file.name.endsWith('.pdf')) { toast.error('Nur PDF-Dateien erlaubt.'); return }
    setFileName(file.name)
    setUploadState('processing')
    setTimeout(() => {
      const id = `upload-${Date.now()}`
      const today = new Date()
      const fälligkeit = new Date(today); fälligkeit.setDate(today.getDate() + 14)
      const fmt = (d: Date) => d.toISOString().split('T')[0]
      const newR: Rechnung = {
        id,
        rechnungsnr: `IMPORT-${id.slice(-4).toUpperCase()}`,
        betrag: 0,
        ust_satz: 19,
        faelligkeit: fmt(fälligkeit),
        skonto_datum: null,
        skonto_prozent: null,
        status: 'eingegangen',
        created_at: today.toISOString(),
        lieferant_id: null,
        pdf_url: URL.createObjectURL(new File([], file.name)),
        ocr_json: null,
        lieferant: null,
      }
      setUploadState('done')
      toast.success(`${file.name} wurde importiert`)
      onImported(newR)
      setTimeout(() => { reset(); onClose() }, 800)
    }, 1800)
  }, [onClose, onImported])

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
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold text-ink">Rechnung hochladen</DialogTitle>
        </DialogHeader>

        <div className="pt-2">
          {uploadState === 'processing' ? (
            <div className="flex flex-col items-center justify-center h-44 gap-3">
              <Loader2 size={28} className="text-accent-500 animate-spin" />
              <p className="text-sm text-ink-muted">OCR wird verarbeitet…</p>
              <p className="text-xs text-ink-subtle font-mono truncate max-w-xs">{fileName}</p>
            </div>
          ) : uploadState === 'done' ? (
            <div className="flex flex-col items-center justify-center h-44 gap-3">
              <CheckCircle size={28} className="text-status-active" />
              <p className="text-sm text-ink font-medium">Import erfolgreich</p>
            </div>
          ) : (
            <div
              onDragOver={e => { e.preventDefault(); setUploadState('dragover') }}
              onDragLeave={() => setUploadState('idle')}
              onDrop={handleDrop}
              onClick={() => inputRef.current?.click()}
              className={cn(
                'relative flex flex-col items-center justify-center h-44 rounded-card border-2 border-dashed cursor-pointer transition-colors',
                uploadState === 'dragover'
                  ? 'border-accent-400 bg-accent-50'
                  : 'border-border hover:border-accent-300 hover:bg-bg-muted'
              )}
            >
              <input
                ref={inputRef}
                type="file"
                accept=".pdf"
                className="hidden"
                onChange={handleFileChange}
              />
              <Upload size={24} className={cn('mb-3 transition-colors', uploadState === 'dragover' ? 'text-accent-500' : 'text-ink-subtle')} />
              <p className="text-sm text-ink-muted">
                PDF hier ablegen oder{' '}
                <span className="text-accent-500 font-medium">durchsuchen</span>
              </p>
              <p className="text-xs text-ink-subtle mt-1">Nur .pdf Dateien</p>
            </div>
          )}

          <div className="flex justify-between items-center mt-4">
            <div className="flex items-center gap-1.5 text-xs text-ink-subtle">
              <FileText size={12} />
              <span>PDF, max. 25 MB</span>
            </div>
            <button
              onClick={handleClose}
              className="px-4 py-2 rounded-card-sm text-sm text-ink-muted hover:bg-bg-muted transition-colors"
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
  const [localRechnungen, setLocalRechnungen] = useState<Rechnung[]>([])
  const { data: fetched = [], isLoading } = useRechnungen()
  const allRechnungen = [...localRechnungen, ...fetched]
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
        r.lieferant?.name.toLowerCase().includes(q)
      )
    }
    return true
  })

  return (
    <div>
      <PageTitle title="Rechnungen" subtitle="OCR-verarbeitete Rechnungen zur Prüfung und Buchung" />

      {/* KPI Row */}
      <div className="grid grid-cols-4 gap-5 mb-6">
        <StatCard label="Neu Eingegangen" value={isLoading ? '…' : kpiEingegangen.toString()} sub="Warten auf Zahlung" icon={<Inbox size={16} />} />
        <StatCard label="Bezahlt" value={isLoading ? '…' : kpiBezahlt.toString()} sub="Erfolgreich abgeschlossen" accent icon={<CheckCircle size={16} />} />
        <StatCard label="Heute Fällig" value={isLoading ? '…' : kpiHeuteFaellig.toString()} sub={kpiHeuteFaellig > 0 ? 'Sofortiger Handlungsbedarf' : 'Keine offenen Posten'} icon={<Clock size={16} />} />
        <StatCard label="Skonto-Alarm" value={isLoading ? '…' : kpiSkontoAlarm.toString()} sub="Frist innerhalb 3 Tagen" icon={<AlertTriangle size={16} />} />
      </div>

      <PdfUploadDialog
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onImported={r => setLocalRechnungen(prev => [r, ...prev])}
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
              PDF Import
            </button>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Suchen…"
                className="pl-8 pr-4 h-8 text-sm border border-border rounded-card-sm bg-bg-surface text-ink placeholder:text-ink-subtle focus:outline-none focus:ring-1 focus:ring-accent-400 w-48"
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
        ) : filtered.length === 0 ? (
          <EmptyState title="Keine Rechnungen" description="Keine Einträge für den gewählten Filter." />
        ) : (
          <RechnungenTable rows={filtered} onRowClick={id => navigate(`/buchung/${id}`)} />
        )}
      </SectionCard>
    </div>
  )
}

function RechnungenTable({ rows, onRowClick }: { rows: Rechnung[]; onRowClick: (id: string) => void }) {
  const { mutate: updateRechnung } = useUpdateRechnung()

  const handleBezahlt = (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    updateRechnung(
      { id, updates: { status: 'bezahlt' } },
      { onSuccess: () => toast.success('Rechnung als bezahlt markiert') }
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr>
            {['Lieferant', 'Rechnungs-Nr.', 'Betrag', 'USt.', 'Fälligkeit', 'Status', ''].map(h => (
              <th key={h} className={cn('label-caps pb-3 border-b border-border/50 text-left font-normal', h === 'Betrag' && 'text-right')}>
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
                    {r.lieferant?.name ?? '—'}
                  </span>
                </div>
              </td>
              <td className="text-sm font-mono text-ink-muted">{r.rechnungsnr}</td>
              <td className="text-right">
                <span className="text-sm font-semibold text-ink">{formatEuro(r.betrag)}</span>
              </td>
              <td className="text-sm text-ink-muted">{r.ust_satz}%</td>
              <td className="text-sm"><FaelligkeitCell date={r.faelligkeit} /></td>
              <td>
                <StatusBadge
                  variant={STATUS_VARIANT[r.status]}
                  label={STATUS_LABEL[r.status]}
                />
              </td>
              <td className="text-right">
                {r.status === 'eingegangen' && (
                  <button
                    onClick={(e) => handleBezahlt(e, r.id)}
                    className="inline-flex items-center gap-1.5 px-3 h-7 rounded-card-sm bg-status-active/10 text-status-active hover:bg-status-active/20 text-xs font-medium transition-colors"
                  >
                    <CheckCircle size={12} />
                    Bezahlt
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
