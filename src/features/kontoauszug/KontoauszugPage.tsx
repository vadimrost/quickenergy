import { useState, useRef, useMemo } from 'react'
import { Upload, Loader2, ChevronDown, ChevronUp, CheckCircle2, CircleDot, ArrowRight, X, FileText, Search, TrendingDown, TrendingUp, Link2, Trash2, RefreshCw, AlertCircle, Download } from 'lucide-react'
import { toast } from 'sonner'
import { StatCard } from '@/components/shared/StatCard'
import { EmptyState } from '@/components/shared/EmptyState'
import { SectionCard } from '@/components/shared/SectionCard'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { formatEuro, formatDate, cn } from '@/lib/utils'
import { matchTransaktion } from '@/lib/kontoauszug-matching'
import { useRechnungen } from '@/features/inbox/useRechnungen'
import {
  useKontoauszuege,
  useUploadKontoauszug,
  useAssignTransaktion,
  useRejectMatch,
  useDeleteKontoauszug,
  useRerunAutoMatch,
  useOffeneLohnDienstnehmer,
  type UploadStep,
} from './useKontoauszug'
import type { BankTransaktion, Kontoauszug, Rechnung, LohnDienstnehmer } from '@/types/database'

type Tab = 'matched' | 'open' | 'incoming'

// ── Format helpers ────────────────────────────────────────────────────────────

function fmtIBAN(iban: string | null): string {
  if (!iban) return '—'
  return iban.replace(/(.{4})/g, '$1 ').trim()
}

function fmtKontostand(v: number | null): string {
  if (v === null) return '—'
  return formatEuro(v)
}

function matchLabel(tx: BankTransaktion): string | null {
  const r = tx.rechnungen?.[0]
  if (r) return `${r.rechnungsnr}${r.lieferant?.name ? ` · ${r.lieferant.name}` : ''}`
  const l = tx.lohn_dienstnehmer?.[0]
  if (l) return l.name
  return null
}

// ── Lückenprüfung (Steuerberaterin: Kontoauszüge müssen lückenlos sein) ─────────

interface KontoLuecke {
  iban: string | null
  kontoName: string | null
  vonLuecke: string
  bisLuecke: string
  tage: number
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(iso)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function diffDaysIso(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000)
}

// Findet fehlende Zeiträume zwischen aufeinanderfolgenden Auszügen je IBAN
function computeLuecken(kontoauszuege: Kontoauszug[]): KontoLuecke[] {
  const byIban = new Map<string, Kontoauszug[]>()
  for (const k of kontoauszuege) {
    if (!k.von_datum || !k.bis_datum) continue
    const key = k.konto_iban ?? '—'
    if (!byIban.has(key)) byIban.set(key, [])
    byIban.get(key)!.push(k)
  }

  const luecken: KontoLuecke[] = []
  for (const [iban, list] of byIban) {
    const sorted = [...list].sort((a, b) => (a.von_datum! < b.von_datum! ? -1 : 1))
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1]
      const cur = sorted[i]
      const gapStart = addDaysIso(prev.bis_datum!, 1)
      // Lücke, wenn der nächste Auszug erst nach dem Folgetag des Vorgängers beginnt
      if (cur.von_datum! > gapStart) {
        const gapEnd = addDaysIso(cur.von_datum!, -1)
        luecken.push({
          iban: iban === '—' ? null : iban,
          kontoName: cur.konto_name ?? prev.konto_name ?? null,
          vonLuecke: gapStart,
          bisLuecke: gapEnd,
          tage: diffDaysIso(gapStart, gapEnd) + 1,
        })
      }
    }
  }
  return luecken
}

function LueckenWarnung({ luecken }: { luecken: KontoLuecke[] }) {
  if (luecken.length === 0) return null
  return (
    <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-4">
      <div className="flex items-center gap-2 mb-2">
        <AlertCircle size={16} className="text-amber-500 shrink-0" />
        <h3 className="text-sm font-semibold text-amber-800">
          {luecken.length === 1 ? 'Lücke in den Kontoauszügen' : `${luecken.length} Lücken in den Kontoauszügen`}
        </h3>
      </div>
      <p className="text-xs text-amber-700 mb-2.5">
        Für eine lückenlose Buchhaltung müssen alle Zeiträume abgedeckt sein. Bitte fehlende Auszüge nachladen:
      </p>
      <ul className="space-y-1">
        {luecken.map((l, i) => (
          <li key={i} className="text-xs text-amber-800 flex items-start gap-2">
            <span className="text-amber-400 mt-0.5">•</span>
            <span>
              <strong>{formatDate(l.vonLuecke)} – {formatDate(l.bisLuecke)}</strong>
              {' '}fehlt ({l.tage} {l.tage === 1 ? 'Tag' : 'Tage'})
              {l.iban && <span className="text-amber-600"> · {fmtIBAN(l.iban)}</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ── Score bar ─────────────────────────────────────────────────────────────────

function ScoreBar({ score }: { score: number }) {
  const pct = Math.round(score * 100)
  const color = score >= 0.72 ? 'bg-status-active' : score >= 0.55 ? 'bg-yellow-400' : 'bg-ink-subtle'
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-16 h-1.5 bg-bg-muted rounded-full overflow-hidden">
        <div className={cn('h-full rounded-full', color)} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] text-ink-muted tabular-nums">{pct}%</span>
    </div>
  )
}

// ── Assign Dialog ─────────────────────────────────────────────────────────────

function AssignDialog({
  tx,
  rechnungen,
  lohnDienstnehmer,
  onClose,
  onAssign,
  loading,
}: {
  tx: BankTransaktion
  rechnungen: Rechnung[]
  lohnDienstnehmer: LohnDienstnehmer[]
  onClose: () => void
  onAssign: (type: 'rechnung' | 'lohn', id: string) => void
  loading: boolean
}) {
  const [selected, setSelected] = useState<{ type: 'rechnung' | 'lohn'; id: string } | null>(null)
  const [search, setSearch] = useState('')

  const candidates = useMemo(
    () => matchTransaktion(tx, rechnungen, lohnDienstnehmer),
    [tx, rechnungen, lohnDienstnehmer]
  )

  const q = search.toLowerCase().trim()
  const filteredRechnungen = rechnungen.filter(r =>
    !q ||
    r.rechnungsnr?.toLowerCase().includes(q) ||
    (r.lieferant?.name ?? '').toLowerCase().includes(q)
  )
  const filteredLohn = lohnDienstnehmer.filter(l =>
    !q || l.name.toLowerCase().includes(q)
  )

  return (
    <Dialog open onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="max-w-lg bg-white border border-border shadow-xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center gap-2.5 mb-1">
            <div className="w-8 h-8 rounded-card-sm bg-bg-muted flex items-center justify-center">
              <Link2 size={15} className="text-ink-muted" />
            </div>
            <DialogTitle className="text-base font-semibold text-ink">Transaktion zuweisen</DialogTitle>
          </div>
        </DialogHeader>

        {/* Tx summary */}
        <div className="rounded-card border border-border bg-bg-muted/40 p-3 space-y-1 shrink-0">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-status-danger tabular-nums">{formatEuro(tx.betrag)}</span>
            <span className="text-xs text-ink-muted">{formatDate(tx.datum)}</span>
          </div>
          {tx.empfaenger && <p className="text-xs text-ink">{tx.empfaenger}</p>}
          <p className="text-xs text-ink-muted truncate">{tx.buchungstext}</p>
          {tx.referenz && (
            <p className="text-xs font-mono text-ink-muted">{tx.referenz}</p>
          )}
        </div>

        <div className="overflow-y-auto flex-1 space-y-4 pr-0.5">
          {/* Candidates */}
          {candidates.length > 0 && (
            <div>
              <p className="label-caps mb-2">Beste Treffer</p>
              <div className="space-y-1.5">
                {candidates.slice(0, 5).map(c => {
                  const isSelected = selected?.type === c.type && selected.id === c.id
                  return (
                    <button
                      key={c.id}
                      onClick={() => setSelected({ type: c.type, id: c.id })}
                      className={cn(
                        'w-full flex items-center gap-3 px-3 py-2.5 rounded-card border text-left transition-colors',
                        isSelected
                          ? 'border-accent-400 bg-accent-50'
                          : 'border-border bg-bg-surface hover:bg-bg-muted'
                      )}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-ink truncate">{c.label}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-ink-muted tabular-nums">{formatEuro(c.betrag)}</span>
                          {c.datum && <span className="text-xs text-ink-muted">{formatDate(c.datum)}</span>}
                          <span className={cn(
                            'text-[10px] px-1.5 py-0.5 rounded-full font-medium',
                            c.type === 'rechnung' ? 'bg-blue-50 text-blue-600' : 'bg-purple-50 text-purple-600'
                          )}>
                            {c.type === 'rechnung' ? 'Rechnung' : 'Lohn'}
                          </span>
                        </div>
                      </div>
                      <ScoreBar score={c.score} />
                      {isSelected && <CheckCircle2 size={16} className="text-accent-500 shrink-0" />}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Manual search */}
          <div>
            <p className="label-caps mb-2">Alle Rechnungen & Löhne</p>
            <div className="relative mb-2">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Suchen…"
                className="w-full h-8 pl-8 pr-3 text-sm border border-border rounded-card-sm bg-bg-surface focus:outline-none focus:ring-1 focus:ring-accent-400"
              />
            </div>

            <div className="space-y-1">
              {filteredRechnungen.map(r => {
                const isSelected = selected?.type === 'rechnung' && selected.id === r.id
                const name = r.lieferant?.name ?? (r.ocr_json as any)?.supplier_name ?? '—'
                return (
                  <button
                    key={r.id}
                    onClick={() => setSelected({ type: 'rechnung', id: r.id })}
                    className={cn(
                      'w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg border text-left transition-colors',
                      isSelected
                        ? 'border-accent-400 bg-accent-50'
                        : 'border-transparent hover:bg-bg-muted'
                    )}
                  >
                    <div className="min-w-0">
                      <p className="text-sm text-ink truncate">{name}</p>
                      <p className="text-xs text-ink-muted font-mono">{r.rechnungsnr}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-medium text-ink tabular-nums">{formatEuro(r.betrag)}</p>
                      <span className="text-[10px] text-blue-600">Rechnung</span>
                    </div>
                    {isSelected && <CheckCircle2 size={14} className="text-accent-500 shrink-0" />}
                  </button>
                )
              })}

              {filteredLohn.map(l => {
                const isSelected = selected?.type === 'lohn' && selected.id === l.id
                return (
                  <button
                    key={l.id}
                    onClick={() => setSelected({ type: 'lohn', id: l.id })}
                    className={cn(
                      'w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg border text-left transition-colors',
                      isSelected
                        ? 'border-accent-400 bg-accent-50'
                        : 'border-transparent hover:bg-bg-muted'
                    )}
                  >
                    <div className="min-w-0">
                      <p className="text-sm text-ink truncate">{l.name}</p>
                      <p className="text-xs text-ink-muted">Dienstnehmer</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-medium text-ink tabular-nums">{formatEuro(l.betrag)}</p>
                      <span className="text-[10px] text-purple-600">Lohn</span>
                    </div>
                    {isSelected && <CheckCircle2 size={14} className="text-accent-500 shrink-0" />}
                  </button>
                )
              })}

              {filteredRechnungen.length === 0 && filteredLohn.length === 0 && (
                <p className="text-xs text-ink-muted text-center py-3">Keine Einträge gefunden</p>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 pt-3 border-t border-border shrink-0">
          <button
            onClick={onClose}
            className="flex-1 h-9 rounded-card-sm border border-border text-sm text-ink-muted hover:bg-bg-muted transition-colors"
          >
            Abbrechen
          </button>
          <button
            onClick={() => selected && onAssign(selected.type, selected.id)}
            disabled={!selected || loading}
            className="flex-1 inline-flex items-center justify-center gap-1.5 h-9 rounded-card-sm bg-ink hover:bg-ink/80 disabled:opacity-40 text-white text-sm font-medium transition-colors"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />}
            Zuweisen
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── Import Modal (Datei-Auswahl + Progress) ───────────────────────────────────

const UPLOAD_STEPS: { key: UploadStep; label: string; note?: string }[] = [
  { key: 'uploading', label: 'PDF hochladen' },
  { key: 'ocr',       label: 'Transaktionen erkennen', note: 'Gemini OCR — kann bis zu 30 Sekunden dauern' },
  { key: 'saving',    label: 'In Datenbank speichern' },
  { key: 'matching',  label: 'Automatischer Abgleich' },
]
const STEP_ORDER: UploadStep[] = ['uploading', 'ocr', 'saving', 'matching', 'done']

function KontoauszugImportModal({ open, uploadStep, fileName, result, error, onFileSelect, onClose }: {
  open: boolean
  uploadStep: UploadStep | null
  fileName: string
  result?: { total: number; autoMatched: number }
  error?: string
  onFileSelect: (file: File) => void
  onClose: () => void
}) {
  const [dragover, setDragover] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  if (!open) return null

  const isSelecting  = uploadStep === null
  const isDone       = uploadStep === 'done'
  const isError      = uploadStep === 'error'
  const currentIdx   = uploadStep ? STEP_ORDER.indexOf(uploadStep) : -1

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragover(false)
    const f = e.dataTransfer.files[0]
    if (!f) return
    if (f.type !== 'application/pdf' && !f.name.toLowerCase().endsWith('.pdf')) {
      toast.error('Nur PDF-Dateien erlaubt')
      return
    }
    onFileSelect(f)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl border border-border p-7 w-full max-w-sm mx-4">

        {/* ── Phase 1: Datei auswählen ── */}
        {isSelecting && (
          <>
            <p className="text-base font-semibold text-ink mb-5">Kontoauszug importieren</p>

            <input
              ref={inputRef}
              type="file"
              accept=".pdf"
              className="hidden"
              onChange={e => {
                const f = e.target.files?.[0]
                if (f) onFileSelect(f)
                e.target.value = ''
              }}
            />

            <div
              onDragOver={e => { e.preventDefault(); setDragover(true) }}
              onDragLeave={() => setDragover(false)}
              onDrop={handleDrop}
              onClick={() => inputRef.current?.click()}
              className={cn(
                'flex flex-col items-center justify-center gap-3 h-44 rounded-xl border-2 border-dashed cursor-pointer transition-all mb-3',
                dragover
                  ? 'border-accent-400 bg-accent-50'
                  : 'border-slate-200 bg-slate-50 hover:border-accent-400 hover:bg-accent-50'
              )}
            >
              <div className={cn(
                'w-12 h-12 rounded-xl flex items-center justify-center transition-colors',
                dragover ? 'bg-accent-100' : 'bg-white border border-border'
              )}>
                <FileText size={22} className={dragover ? 'text-accent-500' : 'text-ink-muted'} />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-ink">PDF hier ablegen</p>
                <p className="text-xs text-ink-muted mt-0.5">
                  oder <span className="text-accent-500 font-semibold underline underline-offset-2">Datei auswählen</span>
                </p>
              </div>
            </div>

            <p className="text-xs text-ink-muted text-center mb-4">Nur PDF-Dateien · Kontoauszug der Bank</p>

            <button
              onClick={onClose}
              className="w-full h-9 rounded-xl border border-border text-sm text-ink-muted hover:bg-bg-muted transition-colors"
            >
              Abbrechen
            </button>
          </>
        )}

        {/* ── Phase 2: Verarbeitung ── */}
        {!isSelecting && (
          <>
            <div className="text-center mb-6">
              <p className="text-base font-semibold text-ink">Kontoauszug wird verarbeitet</p>
              <p className="text-xs text-ink-muted mt-1 truncate px-4">{fileName}</p>
            </div>

            <div className="space-y-3.5">
              {UPLOAD_STEPS.map(s => {
                const idx   = STEP_ORDER.indexOf(s.key)
                const done  = !isError && currentIdx > idx
                const active = s.key === uploadStep && !isDone && !isError
                const pending = !done && !active
                return (
                  <div key={s.key} className="flex items-start gap-3">
                    <div className="w-5 h-5 flex items-center justify-center shrink-0 mt-0.5">
                      {done    && <CheckCircle2 size={17} className="text-green-500" />}
                      {active  && <Loader2 size={17} className="text-accent-500 animate-spin" />}
                      {pending && <div className="w-4 h-4 rounded-full border-2 border-border/60" />}
                    </div>
                    <div>
                      <p className={cn('text-sm',
                        active  ? 'text-ink font-medium' :
                        done    ? 'text-ink-muted' : 'text-ink-subtle'
                      )}>
                        {s.label}
                      </p>
                      {active && s.note && (
                        <p className="text-xs text-ink-muted mt-0.5">{s.note}</p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            {isDone && result && (
              <div className="mt-5 p-4 rounded-xl bg-green-50 border border-green-100 text-center">
                <CheckCircle2 size={22} className="mx-auto text-green-500 mb-2" />
                <p className="text-sm font-semibold text-green-700">{result.total} Transaktionen importiert</p>
                <p className="text-xs text-green-600 mt-0.5">{result.autoMatched} automatisch zugewiesen</p>
              </div>
            )}

            {isError && error && (
              <div className="mt-5 p-4 rounded-xl bg-red-50 border border-red-100">
                <div className="flex items-center gap-2 mb-1.5">
                  <AlertCircle size={15} className="text-red-500 shrink-0" />
                  <p className="text-sm font-semibold text-red-700">Import fehlgeschlagen</p>
                </div>
                <p className="text-xs text-red-600">{error}</p>
              </div>
            )}

            {(isDone || isError) && (
              <button
                onClick={onClose}
                className="mt-4 w-full h-9 rounded-xl border border-border text-sm text-ink-muted hover:bg-bg-muted transition-colors"
              >
                Schließen
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ── Kontoauszug Card ──────────────────────────────────────────────────────────

function KontoauszugCard({
  konto,
  rechnungen,
  lohnDienstnehmer,
}: {
  konto: Kontoauszug
  rechnungen: Rechnung[]
  lohnDienstnehmer: LohnDienstnehmer[]
}) {
  const [expanded, setExpanded] = useState(false)
  const [activeTab, setActiveTab] = useState<Tab>('open')
  const [assignTx, setAssignTx] = useState<BankTransaktion | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const assignMutation = useAssignTransaktion()
  const rejectMutation = useRejectMatch()
  const deleteMutation = useDeleteKontoauszug()
  const rerunMutation = useRerunAutoMatch()

  const txAll = konto.bank_transaktionen ?? []
  const outgoing = txAll.filter(t => t.betrag < 0)
  const matched = outgoing.filter(t => t.status === 'zugewiesen')
  const open = outgoing.filter(t => t.status !== 'zugewiesen')
  const incoming = txAll.filter(t => t.betrag >= 0)

  const delta = (konto.neuer_kontostand ?? 0) - (konto.alter_kontostand ?? 0)

  async function handleAssign(type: 'rechnung' | 'lohn', targetId: string) {
    if (!assignTx) return
    try {
      await assignMutation.mutateAsync({ tx: assignTx, type, targetId, kontoIban: konto.konto_iban ?? null })
      toast.success('Transaktion zugewiesen')
      setAssignTx(null)
      setActiveTab('matched')
    } catch {
      toast.error('Fehler beim Zuweisen')
    }
  }

  async function handleReject(tx: BankTransaktion) {
    try {
      await rejectMutation.mutateAsync(tx)
      toast.success('Zuweisung aufgehoben')
    } catch {
      toast.error('Fehler beim Aufheben')
    }
  }

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: 'open', label: 'Offen', count: open.length },
    { key: 'matched', label: 'Zugewiesen', count: matched.length },
    { key: 'incoming', label: 'Eingehend', count: incoming.length },
  ]

  return (
    <SectionCard>
      {/* Header */}
      <button
        className="w-full flex items-center justify-between text-left"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent-50 flex items-center justify-center text-accent-600 shrink-0">
            <FileText size={18} />
          </div>
          <div>
            <p className="font-semibold text-ink">
              {konto.auszug_nr ? `Auszug ${konto.auszug_nr}` : 'Kontoauszug'}
              {konto.konto_iban && (
                <span className="ml-2 text-sm font-normal text-ink-muted">···{konto.konto_iban.slice(-4)}</span>
              )}
            </p>
            <p className="text-xs text-ink-muted">
              {konto.von_datum ? formatDate(konto.von_datum) : '?'}
              {' – '}
              {konto.bis_datum ? formatDate(konto.bis_datum) : '?'}
              {' · '}
              {txAll.length} Transaktionen · {matched.length} zugewiesen
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right hidden md:block">
            <p className={cn('text-sm font-semibold tabular-nums', delta < 0 ? 'text-status-danger' : 'text-status-active')}>
              {delta >= 0 ? '+' : ''}{formatEuro(delta)}
            </p>
            <p className="text-xs text-ink-muted">{fmtKontostand(konto.neuer_kontostand)}</p>
          </div>
          <button
            onClick={async e => {
              e.stopPropagation()
              const n = await rerunMutation.mutateAsync(konto)
              if (n > 0) toast.success(`${n} neue Transaktion${n !== 1 ? 'en' : ''} automatisch zugewiesen`)
              else toast.info('Keine neuen Matches gefunden')
            }}
            disabled={rerunMutation.isPending}
            title="Auto-Match erneut ausführen"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-subtle hover:text-accent-600 hover:bg-accent-50 transition-colors"
          >
            {rerunMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          </button>
          {konto.pdf_url && (
            <a
              href={konto.pdf_url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              title="PDF herunterladen"
              className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-subtle hover:text-accent-600 hover:bg-accent-50 transition-colors"
            >
              <Download size={14} />
            </a>
          )}
          <button
            onClick={e => { e.stopPropagation(); setConfirmDelete(true) }}
            disabled={deleteMutation.isPending}
            title="Kontoauszug löschen"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-subtle hover:text-status-danger hover:bg-red-50 transition-colors"
          >
            {deleteMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
          </button>
          {expanded ? <ChevronUp size={18} className="text-ink-muted" /> : <ChevronDown size={18} className="text-ink-muted" />}
        </div>
      </button>

      {expanded && (
        <div className="mt-5 pt-5 border-t border-border">
          {/* Balance strip */}
          <div className="flex items-center gap-2 mb-5 p-3 rounded-xl bg-bg-muted/50 text-sm">
            <span className="text-ink-muted">Alter Kontostand:</span>
            <span className="font-medium text-ink tabular-nums">{fmtKontostand(konto.alter_kontostand)}</span>
            <ArrowRight size={14} className="text-ink-muted" />
            <span className="text-ink-muted">Neuer Kontostand:</span>
            <span className={cn('font-semibold tabular-nums', (konto.neuer_kontostand ?? 0) < 0 ? 'text-status-danger' : 'text-ink')}>
              {fmtKontostand(konto.neuer_kontostand)}
            </span>
            {konto.konto_iban && (
              <>
                <span className="ml-auto text-xs text-ink-muted font-mono hidden sm:block">{fmtIBAN(konto.konto_iban)}</span>
              </>
            )}
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-1 mb-4 border-b border-border">
            {tabs.map(t => (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                className={cn(
                  'px-3 py-1.5 text-sm font-medium rounded-t transition-colors border-b-2 -mb-px',
                  activeTab === t.key
                    ? 'text-accent-600 border-accent-500 bg-accent-50/50'
                    : 'text-ink-muted border-transparent hover:text-ink'
                )}
              >
                {t.label}
                {t.count > 0 && (
                  <span className={cn(
                    'ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full font-medium',
                    activeTab === t.key ? 'bg-accent-100 text-accent-700' : 'bg-bg-muted text-ink-muted'
                  )}>
                    {t.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Tab: Offen */}
          {activeTab === 'open' && (
            open.length === 0 ? (
              <div className="text-center py-8">
                <CheckCircle2 size={28} className="mx-auto text-status-active mb-2" />
                <p className="text-sm text-ink-muted">Alle Transaktionen zugewiesen</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {open.map(tx => (
                  <div key={tx.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-border hover:bg-bg-muted/30 transition-colors">
                    <CircleDot size={14} className="text-yellow-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-status-danger tabular-nums shrink-0">{formatEuro(tx.betrag)}</span>
                        <span className="text-xs text-ink-muted shrink-0">{formatDate(tx.datum)}</span>
                        {tx.empfaenger && <span className="text-sm text-ink truncate">{tx.empfaenger}</span>}
                      </div>
                      <p className="text-xs text-ink-muted truncate mt-0.5">{tx.buchungstext}</p>
                    </div>
                    <button
                      onClick={() => setAssignTx(tx)}
                      className="shrink-0 flex items-center gap-1 px-3 h-7 rounded-lg bg-accent-50 text-accent-600 text-xs font-medium hover:bg-accent-100 transition-colors"
                    >
                      <Link2 size={12} />
                      Zuweisen
                    </button>
                  </div>
                ))}
              </div>
            )
          )}

          {/* Tab: Zugewiesen */}
          {activeTab === 'matched' && (
            matched.length === 0 ? (
              <p className="text-sm text-ink-muted text-center py-8">Noch keine Transaktionen zugewiesen</p>
            ) : (
              <div className="space-y-1.5">
                {matched.map(tx => {
                  const label = matchLabel(tx)
                  return (
                    <div key={tx.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-border bg-green-50/30">
                      <CheckCircle2 size={14} className="text-status-active shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-status-danger tabular-nums shrink-0">{formatEuro(tx.betrag)}</span>
                          <span className="text-xs text-ink-muted shrink-0">{formatDate(tx.datum)}</span>
                          {tx.empfaenger && <span className="text-sm text-ink truncate">{tx.empfaenger}</span>}
                        </div>
                        {label && (
                          <p className="text-xs text-status-active font-medium mt-0.5 truncate">→ {label}</p>
                        )}
                      </div>
                      <button
                        onClick={() => handleReject(tx)}
                        disabled={rejectMutation.isPending}
                        title="Zuweisung aufheben"
                        className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-ink-muted hover:text-status-danger hover:bg-red-50 transition-colors"
                      >
                        {rejectMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <X size={13} />}
                      </button>
                    </div>
                  )
                })}
              </div>
            )
          )}

          {/* Tab: Eingehend */}
          {activeTab === 'incoming' && (
            incoming.length === 0 ? (
              <p className="text-sm text-ink-muted text-center py-8">Keine eingehenden Zahlungen</p>
            ) : (
              <div className="space-y-1.5">
                {incoming.map(tx => (
                  <div key={tx.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-border">
                    <TrendingUp size={14} className="text-status-active shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-status-active tabular-nums shrink-0">{formatEuro(tx.betrag)}</span>
                        <span className="text-xs text-ink-muted shrink-0">{formatDate(tx.datum)}</span>
                        {tx.empfaenger && <span className="text-sm text-ink truncate">{tx.empfaenger}</span>}
                      </div>
                      <p className="text-xs text-ink-muted truncate mt-0.5">{tx.buchungstext}</p>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      )}

      {/* Assign Dialog */}
      {assignTx && (
        <AssignDialog
          tx={assignTx}
          rechnungen={rechnungen}
          lohnDienstnehmer={lohnDienstnehmer}
          onClose={() => setAssignTx(null)}
          onAssign={handleAssign}
          loading={assignMutation.isPending}
        />
      )}

      <Dialog open={confirmDelete} onOpenChange={v => { if (!v) setConfirmDelete(false) }}>
        <DialogContent className="max-w-sm bg-white border border-border shadow-xl">
          <DialogHeader>
            <div className="flex items-center gap-2.5 mb-1">
              <div className="w-8 h-8 rounded-card-sm bg-red-50 flex items-center justify-center">
                <Trash2 size={15} className="text-status-danger" />
              </div>
              <DialogTitle className="text-base font-semibold text-ink">Kontoauszug löschen</DialogTitle>
            </div>
          </DialogHeader>
          <p className="text-sm text-ink-muted pt-1">
            Auszug <span className="font-medium text-ink">{konto.auszug_nr ?? konto.id}</span> wirklich löschen?
            {matched.length > 0 && (
              <span> Die <span className="font-medium text-ink">{matched.length} Zuweisung{matched.length !== 1 ? 'en' : ''}</span> werden rückgängig gemacht.</span>
            )}
          </p>
          <div className="flex items-center gap-2 pt-3">
            <button
              onClick={() => setConfirmDelete(false)}
              className="flex-1 h-9 rounded-card-sm border border-border text-sm text-ink-muted hover:bg-bg-muted transition-colors"
            >
              Abbrechen
            </button>
            <button
              onClick={() => { setConfirmDelete(false); deleteMutation.mutate(konto) }}
              disabled={deleteMutation.isPending}
              className="flex-1 inline-flex items-center justify-center gap-1.5 h-9 rounded-card-sm bg-status-danger hover:opacity-90 disabled:opacity-40 text-white text-sm font-medium transition-colors"
            >
              {deleteMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              Löschen
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </SectionCard>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export function KontoauszugPage() {
  const [importOpen, setImportOpen] = useState(false)
  const [uploadStep, setUploadStep] = useState<UploadStep | null>(null)
  const [uploadFileName, setUploadFileName] = useState('')
  const [uploadResult, setUploadResult] = useState<{ total: number; autoMatched: number } | undefined>()
  const [uploadError, setUploadError] = useState<string | undefined>()

  const { data: kontoauszuege = [], isLoading } = useKontoauszuege()
  const { data: rechnungen = [] } = useRechnungen()
  const { data: offeneLohn = [] } = useOffeneLohnDienstnehmer()
  const uploadMutation = useUploadKontoauszug()

  const offeneRechnungen = rechnungen.filter(r => r.status !== 'bezahlt')

  const totalTx = kontoauszuege.flatMap(k => k.bank_transaktionen ?? [])
  const totalOutgoing = totalTx.filter(t => t.betrag < 0)
  const totalMatched = totalOutgoing.filter(t => t.status === 'zugewiesen').length
  const totalOpen = totalOutgoing.filter(t => t.status !== 'zugewiesen').length
  const totalMatchedEuro = totalOutgoing.filter(t => t.status === 'zugewiesen').reduce((s, t) => s + Math.abs(t.betrag), 0)
  const totalOpenEuro = totalOutgoing.filter(t => t.status !== 'zugewiesen').reduce((s, t) => s + Math.abs(t.betrag), 0)

  const luecken = useMemo(() => computeLuecken(kontoauszuege), [kontoauszuege])

  const handleFileSelect = async (file: File) => {
    setUploadFileName(file.name)
    setUploadResult(undefined)
    setUploadError(undefined)
    setUploadStep('uploading')
    try {
      const result = await uploadMutation.mutateAsync({ file, onStep: setUploadStep })
      const { autoMatched, total } = result as any
      setUploadResult({ total, autoMatched })
    } catch (err) {
      setUploadStep('error')
      setUploadError(err instanceof Error ? err.message : 'Unbekannter Fehler')
    }
  }

  const handleCloseModal = () => {
    const isProcessing = uploadStep !== null && uploadStep !== 'done' && uploadStep !== 'error'
    if (isProcessing) return
    setImportOpen(false)
    setUploadStep(null)
    setUploadResult(undefined)
    setUploadError(undefined)
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-10 w-48"><Skeleton className="h-full w-full" /></div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[0, 1, 2].map(i => <Skeleton key={i} className="h-28 rounded-2xl" />)}
        </div>
      </div>
    )
  }

  return (
    <div>
      <KontoauszugImportModal
        open={importOpen}
        uploadStep={uploadStep}
        fileName={uploadFileName}
        result={uploadResult}
        error={uploadError}
        onFileSelect={handleFileSelect}
        onClose={handleCloseModal}
      />

      {/* Header */}
      <div className="flex items-start justify-between mb-5 md:mb-8">
        <div>
          <h1 className="text-2xl md:text-page-title font-semibold text-ink">Kontoauszüge</h1>
          {kontoauszuege.length > 0 && (
            <p className="text-sm text-ink-muted mt-1 hidden sm:block">
              {kontoauszuege.length} Auszug{kontoauszuege.length !== 1 ? '̈e' : ''} · {totalOutgoing.length} Abbuchungen
            </p>
          )}
        </div>
        <button
          onClick={() => setImportOpen(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-accent-500 text-white text-sm font-medium hover:bg-accent-600 transition-colors"
        >
          <Upload size={16} />
          Importieren
        </button>
      </div>

      {/* Lückenprüfung */}
      <LueckenWarnung luecken={luecken} />

      {/* KPIs */}
      {kontoauszuege.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <StatCard
            label="Zugewiesen"
            value={formatEuro(totalMatchedEuro)}
            sub={`${totalMatched} Transaktionen`}
            accent
            icon={<CheckCircle2 size={16} />}
          />
          <StatCard
            label="Ohne Beleg"
            value={String(totalOpen)}
            sub={`${formatEuro(totalOpenEuro)} nicht zugeordnet`}
            icon={<CircleDot size={16} />}
          />
          <StatCard
            label="Kontoauszüge"
            value={String(kontoauszuege.length)}
            sub={`${totalOutgoing.length} Abbuchungen gesamt`}
            icon={<TrendingDown size={16} />}
          />
        </div>
      )}

      {/* List */}
      {kontoauszuege.length === 0 ? (
        <EmptyState
          icon={<FileText size={24} />}
          title="Noch keine Kontoauszüge"
          description="Lade einen Kontoauszug als PDF hoch — Transaktionen werden automatisch mit Rechnungen und Löhnen abgeglichen."
        />
      ) : (
        <div className="space-y-3">
          {kontoauszuege.map(konto => (
            <KontoauszugCard
              key={konto.id}
              konto={konto}
              rechnungen={offeneRechnungen}
              lohnDienstnehmer={offeneLohn}
            />
          ))}
        </div>
      )}
    </div>
  )
}
