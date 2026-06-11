import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Building2, User, AlertTriangle, Search, ChevronUp, ChevronDown, Upload, CheckCircle, Loader2, FileText, FileSpreadsheet } from 'lucide-react'
import { differenceInDays, parseISO, format } from 'date-fns'
import { de } from 'date-fns/locale'
import { toast } from 'sonner'
import { PageTitle } from '@/components/shared/PageTitle'
import { SectionCard } from '@/components/shared/SectionCard'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { ErrorState } from '@/components/shared/ErrorState'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { formatEuro, formatDate, cn } from '@/lib/utils'
import { fileToBase64, normalizeDate, geminiOcrAusgangsrechnung } from '@/lib/gemini-ocr'
import { buildArRows, writeBmdExcel } from '@/lib/bmd-export'
import { DEFAULT_KOPF, DEFAULT_FUSS } from '@/features/auftraege/shared/dokumentDefaults'
import { supabase } from '@/lib/supabase'
import { useAusgangsrechnungen } from './useAusgangsrechnungen'
import type { Ausgangsrechnung, AusgangsrechnungStatus } from '@/types/database'

type Tab = 'alle' | AusgangsrechnungStatus

const TABS: { key: Tab; label: string }[] = [
  { key: 'alle', label: 'Alle' },
  { key: 'entwurf', label: 'Entwurf' },
  { key: 'offen', label: 'Offen' },
  { key: 'teilbezahlt', label: 'Teilbezahlt' },
  { key: 'bezahlt', label: 'Bezahlt' },
  { key: 'storniert', label: 'Storniert' },
]

const STATUS_VARIANT: Record<AusgangsrechnungStatus, Parameters<typeof StatusBadge>[0]['variant']> = {
  entwurf: 'neutral',
  offen: 'info',
  teilbezahlt: 'warning',
  bezahlt: 'done',
  storniert: 'danger',
}

const TYP_LABEL: Record<string, string> = {
  rechnung: 'Rechnung',
  teilrechnung: 'Teilrechnung',
  schlussrechnung: 'Schlussrechnung',
  stornorechnung: 'Storno',
}

function kundenName(r: Ausgangsrechnung): string {
  if (!r.kunde) return '—'
  return r.kunde.firmenname || `${r.kunde.vorname ?? ''} ${r.kunde.nachname ?? ''}`.trim() || '—'
}

function summeNetto(r: Ausgangsrechnung): number {
  return (r.summe_netto_20 ?? 0) + (r.summe_netto_10 ?? 0) + (r.summe_netto_0 ?? 0)
}

function ustLabel(r: Ausgangsrechnung): string {
  const has20 = (r.ust_20 ?? 0) > 0
  const has10 = (r.ust_10 ?? 0) > 0
  if (has20 && has10) return '10% / 20%'
  if (has20) return '20%'
  if (has10) return '10%'
  return '—'
}

function FaelligkeitCell({ date, status }: { date: string | null; status: AusgangsrechnungStatus }) {
  if (!date || status === 'bezahlt' || status === 'storniert') return <span className="text-ink-muted">—</span>
  const days = differenceInDays(parseISO(date), new Date())
  if (days < 0) return <span className="text-status-danger font-medium flex items-center gap-1">{formatDate(date)} <AlertTriangle size={10} /></span>
  if (days <= 3) return <span className="text-status-warning font-medium">{formatDate(date)}</span>
  return <span className="text-ink-muted">{formatDate(date)}</span>
}

// ─── PDF Upload Dialog ────────────────────────────────────────────────────────

type FileStatus = 'pending' | 'uploading' | 'ocr' | 'saving' | 'done' | 'error'
interface FileEntry { id: string; name: string; status: FileStatus; error?: string; info?: string }

async function findOrCreateKunde(name: string | null | undefined): Promise<string | null> {
  if (!name?.trim()) return null
  const trimmed = name.trim()
  const { data: existing } = await supabase
    .from('kunden')
    .select('id')
    .ilike('firmenname', trimmed)
    .limit(1)
    .maybeSingle()
  if (existing) return existing.id
  const { data: created } = await supabase
    .from('kunden')
    .insert({ firmenname: trimmed })
    .select('id')
    .single()
  return created?.id ?? null
}

function fileStatusLabel(s: FileStatus): string {
  switch (s) {
    case 'pending':   return 'Wartend…'
    case 'uploading': return 'Hochladen…'
    case 'ocr':       return 'OCR läuft…'
    case 'saving':    return 'Speichern…'
    case 'done':      return 'Fertig'
    default:          return ''
  }
}

function PdfUploadDialog({ open, onClose, onCreated }: {
  open: boolean
  onClose: () => void
  onCreated: (id: string) => void
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
    const valid = files.filter(f => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'))
    if (!valid.length) { toast.error('Nur PDF-Dateien werden unterstützt.'); return }
    if (!apiKey) { toast.error('Kein Gemini API Key konfiguriert.'); return }

    const newEntries: FileEntry[] = valid.map(f => ({ id: crypto.randomUUID(), name: f.name, status: 'pending' as FileStatus }))
    setEntries(prev => [...prev, ...newEntries])

    for (let i = 0; i < valid.length; i++) {
      const file = valid[i]
      const { id } = newEntries[i]

      // 1. Upload to storage
      updateEntry(id, { status: 'uploading' })
      const storagePath = `ausgangsrechnungen/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
      const { error: storageError } = await supabase.storage
        .from('rechnungen')
        .upload(storagePath, file, { contentType: 'application/pdf', upsert: false })
      if (storageError) {
        updateEntry(id, { status: 'error', error: `Storage: ${storageError.message}` })
        continue
      }

      // 2. OCR
      updateEntry(id, { status: 'ocr' })
      let ocr: Awaited<ReturnType<typeof geminiOcrAusgangsrechnung>> | null = null
      try {
        const base64 = await fileToBase64(file)
        ocr = await geminiOcrAusgangsrechnung(base64, apiKey)
      } catch (err) {
        updateEntry(id, { status: 'error', error: err instanceof Error ? err.message : 'OCR fehlgeschlagen' })
        continue
      }

      // 3. Find or create Kunde
      updateEntry(id, { status: 'saving' })
      const kundeId = await findOrCreateKunde(ocr.customer_name)

      // 4. Build summen from OCR
      const netto20 = ocr.net_amount_20 ?? 0
      const netto10 = ocr.net_amount_10 ?? 0
      const netto0  = ocr.net_amount_0  ?? 0
      const ust20   = ocr.tax_amount_20 ?? Math.round(netto20 * 0.20 * 100) / 100
      const ust10   = ocr.tax_amount_10 ?? Math.round(netto10 * 0.10 * 100) / 100
      const brutto  = ocr.total_brutto  ?? Math.round((netto20 + netto10 + netto0 + ust20 + ust10) * 100) / 100

      const rechnungsdatum = normalizeDate(ocr.invoice_date) ?? new Date().toISOString().split('T')[0]
      const zahlungsTage   = ocr.zahlungsziel_tage || 14
      const faellig = ocr.due_date
        ? (normalizeDate(ocr.due_date) ?? (() => {
            const d = new Date(rechnungsdatum); d.setDate(d.getDate() + zahlungsTage); return d.toISOString().split('T')[0]
          })())
        : (() => {
            const d = new Date(rechnungsdatum); d.setDate(d.getDate() + zahlungsTage); return d.toISOString().split('T')[0]
          })()

      // 5. Insert ausgangsrechnung
      const { data: newRechnung, error: insertErr } = await supabase
        .from('ausgangsrechnungen')
        .insert({
          typ:                'rechnung',
          status:             'entwurf',
          kunde_id:           kundeId,
          betreff:            ocr.subject ?? null,
          rechnungsdatum,
          leistungsdatum:     rechnungsdatum,
          zahlungsziel_tage:  zahlungsTage,
          faelligkeitsdatum:  faellig,
          rabatt_gesamt_prozent: 0,
          kopftext:           DEFAULT_KOPF,
          fusstext:           DEFAULT_FUSS,
          summe_netto_20:     netto20,
          summe_netto_10:     netto10,
          summe_netto_0:      netto0,
          ust_20:             ust20,
          ust_10:             ust10,
          summe_brutto:       brutto,
          mahnstufe:          0,
        })
        .select('id')
        .single()

      if (insertErr) {
        updateEntry(id, { status: 'error', error: insertErr.message })
        continue
      }

      // 6. Insert one placeholder position if we have amounts
      const nettoGesamt = netto20 + netto10 + netto0
      if (nettoGesamt > 0 && newRechnung?.id) {
        const ustSatz = netto20 > 0 ? 20 : netto10 > 0 ? 10 : 0
        await supabase.from('dokument_positionen').insert({
          dokument_id:       newRechnung.id,
          dokument_typ:      'rechnung',
          reihenfolge:       0,
          bezeichnung:       ocr.subject ?? 'Importierte Position',
          beschreibung:      null,
          menge:             1,
          einheit:           'pausch',
          einzelpreis_netto: nettoGesamt,
          ust_satz:          ustSatz,
          rabatt_prozent:    0,
          zeilenbetrag_netto: nettoGesamt,
        })
      }

      updateEntry(id, { status: 'done', info: ocr.customer_name ?? undefined })
      if (newRechnung?.id) onCreated(newRechnung.id)
    }
  }, [updateEntry, onCreated])

  // Auto-close after all done
  useEffect(() => {
    if (!isDone || entries.length === 0) return
    const t = setTimeout(() => { reset(); onClose() }, 1800)
    return () => clearTimeout(t)
  }, [isDone, entries.length, onClose])

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
          <DialogTitle className="text-base font-semibold text-ink">Rechnung importieren (OCR)</DialogTitle>
        </DialogHeader>

        <div className="pt-2">
          <input ref={inputRef} type="file" accept=".pdf" multiple className="hidden" onChange={handleFileChange} />

          {entries.length > 0 && (
            <div className="rounded-card border border-border overflow-hidden mb-3">
              <div className="max-h-48 overflow-y-auto divide-y divide-border/50">
                {entries.map(entry => (
                  <div key={entry.id} className="flex items-center gap-3 px-3.5 py-2.5">
                    {entry.status === 'done'
                      ? <CheckCircle size={14} className="text-status-active flex-shrink-0" />
                      : entry.status === 'error'
                        ? <span className="text-status-danger text-xs flex-shrink-0">✕</span>
                        : <Loader2 size={14} className="text-accent-500 animate-spin flex-shrink-0" />
                    }
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-ink truncate">{entry.name}</p>
                      {entry.status === 'error'
                        ? <p className="text-xs text-status-danger truncate">{entry.error}</p>
                        : <p className="text-xs text-ink-muted">
                            {entry.status === 'done' ? (entry.info ?? 'Fertig') : fileStatusLabel(entry.status)}
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
                    {entries.filter(e => e.status === 'done').length} von {entries.length} erfolgreich — Weiterleitung…
                  </span>
                </div>
              )}
            </div>
          )}

          <div
            onDragOver={e => { e.preventDefault(); setDragover(true) }}
            onDragLeave={() => setDragover(false)}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
            className={cn(
              'flex items-center justify-center gap-3 rounded-card border-2 border-dashed cursor-pointer transition-all',
              entries.length > 0 ? 'h-14' : 'h-44 flex-col',
              dragover ? 'border-accent-400 bg-accent-50' : 'border-slate-300 bg-slate-50 hover:border-accent-400 hover:bg-accent-50'
            )}
          >
            <Upload size={entries.length > 0 ? 16 : 22} className={cn('transition-colors flex-shrink-0', dragover ? 'text-accent-500' : 'text-ink-muted')} />
            {entries.length === 0 ? (
              <div className="text-center">
                <p className="text-sm font-medium text-ink mb-1">PDF hier ablegen</p>
                <p className="text-xs text-ink-muted">oder <span className="text-accent-500 font-semibold underline underline-offset-2">Datei auswählen</span></p>
              </div>
            ) : (
              <p className="text-xs text-ink-muted"><span className="text-accent-500 font-semibold">Weitere PDFs hinzufügen</span></p>
            )}
          </div>

          <div className="flex justify-between items-center mt-4 pt-3 border-t border-border">
            <div className="flex items-center gap-1.5 text-xs text-ink-muted">
              <FileText size={12} />
              <span>Daten werden per OCR ausgelesen und als Entwurf gespeichert</span>
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

// ─── BMD Export Dialog ────────────────────────────────────────────────────────

function BmdExportDialog({ open, onClose, rechnungen }: {
  open: boolean
  onClose: () => void
  rechnungen: Ausgangsrechnung[]
}) {
  const availableMonths = useMemo(() => {
    const months = new Set<string>()
    rechnungen.forEach(r => { if (r.rechnungsdatum) months.add(r.rechnungsdatum.slice(0, 7)) })
    return [...months].sort().reverse()
  }, [rechnungen])

  const currentMonth = format(new Date(), 'yyyy-MM')
  const defaultMonth = availableMonths.includes(currentMonth) ? currentMonth : (availableMonths[0] ?? currentMonth)
  const [month, setMonth] = useState(defaultMonth)

  useEffect(() => {
    if (availableMonths.length > 0 && !availableMonths.includes(month)) setMonth(availableMonths[0])
  }, [availableMonths])

  const monthData = rechnungen.filter(r =>
    r.rechnungsdatum?.startsWith(month) && r.status !== 'entwurf' && r.status !== 'storniert'
  )
  const monthLabel = month ? format(parseISO(`${month}-01`), 'MMMM yyyy', { locale: de }) : ''

  const handleExport = () => {
    const rows = buildArRows(monthData)
    writeBmdExcel(rows, `BMD_AR_${month}.xlsx`)
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="max-w-sm bg-white border border-border shadow-xl">
        <DialogHeader>
          <div className="flex items-center gap-2.5 mb-1">
            <div className="w-8 h-8 rounded-card-sm bg-bg-muted flex items-center justify-center">
              <FileSpreadsheet size={15} className="text-ink-muted" />
            </div>
            <DialogTitle className="text-base font-semibold text-ink">BMD Export — Ausgangsrechnungen</DialogTitle>
          </div>
        </DialogHeader>

        <div className="pt-1 space-y-4">
          <div>
            <label className="label-caps block mb-1.5">Monat</label>
            {availableMonths.length > 0 ? (
              <select
                value={month}
                onChange={e => setMonth(e.target.value)}
                className="w-full h-9 px-3 text-sm border border-border rounded-card-sm bg-bg-surface text-ink focus:outline-none focus:ring-1 focus:ring-accent-400 appearance-none cursor-pointer"
              >
                {availableMonths.map(m => (
                  <option key={m} value={m}>{format(parseISO(`${m}-01`), 'MMMM yyyy', { locale: de })}</option>
                ))}
              </select>
            ) : (
              <div className="w-full h-9 px-3 flex items-center text-sm border border-border rounded-card-sm bg-bg-muted text-ink-subtle">
                Keine Rechnungen mit Datum vorhanden
              </div>
            )}
          </div>

          <div className="rounded-card border border-border bg-bg-muted/40 p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-ink-muted">Zeitraum</span>
              <span className="text-xs font-medium text-ink">{monthLabel}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-ink-muted">Rechnungen (ohne Entwürfe/Storno)</span>
              <span className="text-xs font-medium text-ink">{monthData.length}</span>
            </div>
            <div className="flex items-center justify-between border-t border-border/50 pt-2">
              <span className="text-xs text-ink-muted">Format</span>
              <span className="text-xs font-medium text-ink">BMD NTCS Buchungsjournal</span>
            </div>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <button onClick={onClose} className="flex-1 h-9 rounded-card-sm border border-border text-sm text-ink-muted hover:bg-bg-muted transition-colors">
              Abbrechen
            </button>
            <button
              onClick={handleExport}
              disabled={monthData.length === 0}
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

// ─── Main Page ────────────────────────────────────────────────────────────────

export function AusgangsrechnungPage() {
  const navigate = useNavigate()
  const { data: rechnungen = [], isLoading, isError, refetch } = useAusgangsrechnungen()
  const [tab, setTab] = useState<Tab>('alle')
  const [search, setSearch] = useState('')
  const [datumSort, setDatumSort] = useState<'asc' | 'desc' | null>(null)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [bmdOpen, setBmdOpen] = useState(false)

  const today = new Date()

  const byTab = tab === 'alle' ? rechnungen : rechnungen.filter(r => r.status === tab)
  const bySearch = search
    ? byTab.filter(r => {
        const q = search.toLowerCase()
        return (
          r.rechnungsnummer?.toLowerCase().includes(q) ||
          r.betreff?.toLowerCase().includes(q) ||
          r.kunde?.firmenname?.toLowerCase().includes(q) ||
          (`${r.kunde?.vorname ?? ''} ${r.kunde?.nachname ?? ''}`).toLowerCase().includes(q)
        )
      })
    : byTab

  const filtered = datumSort
    ? [...bySearch].sort((a, b) => {
        const aD = a.rechnungsdatum ?? '', bD = b.rechnungsdatum ?? ''
        if (!aD && !bD) return 0
        if (!aD) return 1
        if (!bD) return -1
        return datumSort === 'asc' ? aD.localeCompare(bD) : bD.localeCompare(aD)
      })
    : bySearch

  const ueberfaellig = rechnungen.filter(r =>
    r.status === 'offen' && r.faelligkeitsdatum && differenceInDays(parseISO(r.faelligkeitsdatum), today) < 0
  ).length

  function handleCreated(id: string) {
    void refetch()
    setTimeout(() => navigate(`/ausgangsrechnungen/${id}`), 400)
  }

  return (
    <div>
      <PageTitle
        title="Ausgangsrechnungen"
        subtitle={`${rechnungen.length} Rechnungen gesamt`}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setBmdOpen(true)}>
              <FileSpreadsheet size={14} className="mr-1.5" /> BMD Export
            </Button>
            <Button variant="outline" onClick={() => setUploadOpen(true)}>
              <Upload size={14} className="mr-1.5" /> PDF Import
            </Button>
            <Button onClick={() => navigate('/ausgangsrechnungen/neu')}>
              <Plus size={14} className="mr-1.5" /> Rechnung erstellen
            </Button>
          </div>
        }
      />

      {ueberfaellig > 0 && (
        <div className="mb-4 flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 text-sm text-red-700">
          <AlertTriangle size={14} />
          <span><strong>{ueberfaellig}</strong> überfällige {ueberfaellig === 1 ? 'Rechnung' : 'Rechnungen'} — bitte prüfen!</span>
        </div>
      )}

      <PdfUploadDialog
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onCreated={handleCreated}
      />
      <BmdExportDialog
        open={bmdOpen}
        onClose={() => setBmdOpen(false)}
        rechnungen={rechnungen}
      />

      <SectionCard
        title="Rechnungen"
        actions={
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle" />
            <Input
              placeholder="Nr., Kunde, Betreff…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8 h-8 text-sm w-48"
            />
          </div>
        }
      >
        {/* Tabs */}
        <div className="flex items-center gap-1 flex-wrap mb-5 -mt-1">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                'px-3.5 h-7 rounded-pill text-label uppercase transition-colors',
                tab === t.key ? 'bg-ink text-white' : 'text-ink-muted hover:bg-bg-muted'
              )}
            >
              {t.label}
              {t.key !== 'alle' && (
                <span className="ml-1.5 opacity-70">
                  ({rechnungen.filter(r => r.status === t.key).length})
                </span>
              )}
            </button>
          ))}
        </div>

        {isLoading && <div className="py-8 text-center text-sm text-ink-muted">Laden…</div>}
        {isError && <ErrorState description="Rechnungen konnten nicht geladen werden." onRetry={refetch} />}
        {!isLoading && !isError && filtered.length === 0 && (
          <div className="py-12 text-center text-sm text-ink-muted">
            {search ? 'Keine Treffer für diese Suche' : 'Keine Rechnungen vorhanden'}
          </div>
        )}

        {!isLoading && !isError && filtered.length > 0 && (
          <>
            {/* Mobile card list */}
            <div className="md:hidden space-y-2">
              {filtered.map(r => (
                <div
                  key={r.id}
                  onClick={() => navigate(`/ausgangsrechnungen/${r.id}`)}
                  className="rounded-card border border-border/50 bg-bg-surface p-4 cursor-pointer hover:bg-bg-hover transition-colors"
                >
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {r.kunde?.firmenname
                        ? <Building2 size={12} className="text-ink-muted flex-shrink-0" />
                        : <User size={12} className="text-ink-muted flex-shrink-0" />
                      }
                      <span className="text-sm font-medium text-ink truncate">{kundenName(r)}</span>
                    </div>
                    <StatusBadge variant={STATUS_VARIANT[r.status]} label={r.status.charAt(0).toUpperCase() + r.status.slice(1)} />
                  </div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-mono text-ink-muted">{r.rechnungsnummer || '—'}</span>
                    {r.typ !== 'rechnung' && (
                      <span className="text-xs text-ink-subtle bg-bg-muted px-1.5 py-0.5 rounded">{TYP_LABEL[r.typ]}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-ink">{formatEuro(r.summe_brutto)}</span>
                    <span className="text-xs text-ink-muted">{ustLabel(r)} USt.</span>
                    <span className="text-xs text-ink-muted">{formatDate(r.rechnungsdatum)}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    {(['Kunde', 'Rechnungs-Nr.', 'Datum', 'Fällig', 'Netto', 'USt.', 'Brutto', 'Status'] as const).map(h => (
                      <th
                        key={h}
                        className={cn(
                          'label-caps pb-3 border-b border-border/50 text-left font-normal',
                          (h === 'Netto' || h === 'Brutto') && 'text-right'
                        )}
                      >
                        {h === 'Datum' ? (
                          <button
                            onClick={() => setDatumSort(s => s === null ? 'desc' : s === 'desc' ? 'asc' : null)}
                            className="inline-flex items-center gap-1 hover:text-ink transition-colors"
                          >
                            Datum
                            {datumSort === 'asc'
                              ? <ChevronUp size={12} className="text-ink" />
                              : datumSort === 'desc'
                                ? <ChevronDown size={12} className="text-ink" />
                                : <ChevronDown size={12} className="opacity-30" />}
                          </button>
                        ) : h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(r => (
                    <tr
                      key={r.id}
                      onClick={() => navigate(`/ausgangsrechnungen/${r.id}`)}
                      className="h-14 border-b border-border/50 last:border-0 hover:bg-bg-hover cursor-pointer transition-colors"
                    >
                      <td>
                        <div className="flex items-center gap-2">
                          {r.kunde?.firmenname
                            ? <Building2 size={12} className="text-ink-muted flex-shrink-0" />
                            : <User size={12} className="text-ink-muted flex-shrink-0" />
                          }
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-ink truncate max-w-[180px]">{kundenName(r)}</div>
                            {r.betreff && <div className="text-xs text-ink-muted truncate max-w-[180px]">{r.betreff}</div>}
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className="flex flex-col gap-0.5">
                          <span className="text-sm font-mono text-ink-muted">{r.rechnungsnummer || '—'}</span>
                          {r.typ !== 'rechnung' && (
                            <span className="text-xs text-ink-subtle">{TYP_LABEL[r.typ]}</span>
                          )}
                        </div>
                      </td>
                      <td className="text-sm text-ink-muted">
                        {r.rechnungsdatum ? formatDate(r.rechnungsdatum) : '—'}
                      </td>
                      <td className="text-sm">
                        <FaelligkeitCell date={r.faelligkeitsdatum} status={r.status} />
                      </td>
                      <td className="text-right">
                        <span className="text-sm text-ink-muted">{formatEuro(summeNetto(r))}</span>
                      </td>
                      <td className="text-sm text-ink-muted pl-4">
                        {ustLabel(r)}
                      </td>
                      <td className="text-right pr-4">
                        <span className="text-sm font-semibold text-ink">{formatEuro(r.summe_brutto)}</span>
                      </td>
                      <td>
                        <StatusBadge variant={STATUS_VARIANT[r.status]} label={r.status.charAt(0).toUpperCase() + r.status.slice(1)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </SectionCard>
    </div>
  )
}
