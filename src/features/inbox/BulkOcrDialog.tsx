import { useState, useCallback } from 'react'
import { CheckCircle, XCircle, Loader2, KeyRound, Sparkles, SkipForward } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { normalizeDate, pdfUrlToBase64, resolveCard, geminiOcr, effectiveNetto } from '@/lib/gemini-ocr'
import { useKategorien } from '@/features/kategorien/useKategorien'
import type { Rechnung, Rechnungstyp } from '@/types/database'

type ResultStatus = 'pending' | 'processing' | 'done' | 'error' | 'skipped'

interface OcrResult {
  id: string
  name: string
  status: ResultStatus
  updated: string[]
  error?: string
}

function isPlaceholderNr(nr: string) {
  return /^(EMAIL|BELEG)-/.test(nr)
}

function needsProcessing(r: Rechnung) {
  if (!r.pdf_url || r.pdf_url === 'demo') return false
  return (
    r.rechnungsdatum === null ||
    r.faelligkeit === null ||
    r.rechnungstyp === null ||
    isPlaceholderNr(r.rechnungsnr)
  )
}

export function BulkOcrDialog({ open, onClose, rechnungen, onRefresh }: {
  open: boolean
  onClose: () => void
  rechnungen: Rechnung[]
  onRefresh: () => void
}) {
  const [apiKey, setApiKey] = useState(import.meta.env.VITE_OPENROUTER_API_KEY ?? '')
  const [limit, setLimit] = useState<number>(5)
  const [forceAll, setForceAll] = useState(false)
  const { data: kategorien = [] } = useKategorien()
  const [running, setRunning] = useState(false)
  const [done, setDone] = useState(false)
  const [results, setResults] = useState<OcrResult[]>([])

  const allToProcess = rechnungen
    .filter(r => forceAll ? r.pdf_url && r.pdf_url !== 'demo' : needsProcessing(r))
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
  const toProcess = limit === 0 ? allToProcess : allToProcess.slice(0, limit)

  const updateResult = useCallback((id: string, patch: Partial<OcrResult>) => {
    setResults(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r))
  }, [])

  const handleStart = async () => {
    if (!apiKey.trim()) return
    setRunning(true)
    setDone(false)

    const initial: OcrResult[] = toProcess.map(r => ({
      id: r.id,
      name: r.lieferant?.name ?? (r.ocr_json as any)?.supplier_name ?? r.rechnungsnr,
      status: 'pending',
      updated: [],
    }))
    setResults(initial)

    for (const r of toProcess) {
      updateResult(r.id, { status: 'processing' })

      try {
        const base64 = await pdfUrlToBase64(r.pdf_url!)
        const ocr = await geminiOcr(base64, apiKey.trim(), kategorien)

        const updates: Partial<Rechnung> = {}
        const updated: string[] = []

        const rechnungsdatum = normalizeDate(ocr.invoice_date)
        if (rechnungsdatum && !r.rechnungsdatum) {
          updates.rechnungsdatum = rechnungsdatum
          updated.push('Rechnungsdatum')
        }

        const faelligkeit = normalizeDate(ocr.due_date)
        if (faelligkeit && !r.faelligkeit) {
          updates.faelligkeit = faelligkeit
          updated.push('Fälligkeit')
        }

        if (ocr.invoice_number && isPlaceholderNr(r.rechnungsnr)) {
          updates.rechnungsnr = String(ocr.invoice_number)
          updated.push('Rechnungs-Nr.')
        }

        const netto = effectiveNetto(ocr)
        if (netto && (!r.betrag || r.betrag === 0)) {
          updates.betrag = netto
          updated.push('Betrag')
        }

        if (ocr.is_proforma) {
          updates.ust_satz = 0
          updates.betrag_10 = null; updates.betrag_20 = null; updates.betrag_0 = null
          updates.mwst_10 = null;   updates.mwst_20 = null
          updated.push('Proforma (0% USt.)')
        } else {
          if (ocr.tax_rate && (!r.ust_satz || r.ust_satz === 0)) {
            updates.ust_satz = Number(ocr.tax_rate)
            updated.push('USt.')
          }
          if (ocr.net_amount_10 != null && (forceAll || !r.betrag_10)) {
            updates.betrag_10 = Number(ocr.net_amount_10); updated.push('Netto 10%')
          }
          if (ocr.net_amount_20 != null && (forceAll || !r.betrag_20)) {
            updates.betrag_20 = Number(ocr.net_amount_20); updated.push('Netto 20%')
          }
          if (ocr.net_amount_0 != null && (forceAll || !r.betrag_0)) {
            updates.betrag_0 = Number(ocr.net_amount_0); updated.push('Trinkgeld 0%')
          }
          if (ocr.tax_amount_10 != null && (forceAll || !r.mwst_10)) updates.mwst_10 = Number(ocr.tax_amount_10)
          if (ocr.tax_amount_20 != null && (forceAll || !r.mwst_20)) updates.mwst_20 = Number(ocr.tax_amount_20)
        }

        // Kategorie
        const validTypes = ['bewirtung', 'dienstleistung', 'tanken_diesel', 'tanken_super']
        if (ocr.invoice_type && validTypes.includes(ocr.invoice_type) && (forceAll || !r.rechnungstyp)) {
          updates.rechnungstyp = ocr.invoice_type as Rechnungstyp
          updated.push('Kategorie')
        }

        // Dokumenttyp-Prüfung (Steuerberaterin): Angebot/Mahnung/Lieferschein/unvollständig
        if (ocr.document_kind && (forceAll || !r.dokument_art)) {
          updates.dokument_art = ocr.document_kind
          let hinweis: string | null = null
          if (ocr.document_kind === 'angebot') hinweis = 'Angebot erkannt – keine Eingangsrechnung. Nicht als ER buchen.'
          else if (ocr.document_kind === 'mahnung') hinweis = 'Mahnung erkannt – Original-Rechnung bereits erfasst? Nicht doppelt buchen.'
          else if (ocr.document_kind === 'lieferschein') hinweis = 'Lieferschein erkannt – keine Rechnung.'
          else if (ocr.seiten_vollstaendig === false) hinweis = 'Dokument evtl. unvollständig – fehlende Seiten prüfen.'
          updates.pruef_hinweis = hinweis
          if (hinweis) updated.push('Prüf-Hinweis')
        }

        const resolvedCard = resolveCard(ocr.card_last_four)
        if (resolvedCard && (forceAll || !r.karte)) {
          updates.karte = resolvedCard
          updated.push('Karte')
        }

        // Lieferant aktualisieren wenn OCR einen Namen gefunden hat und noch keiner gesetzt ist
        if (ocr.supplier_name && !r.lieferant_id) {
          const name = ocr.supplier_name.trim()
          const { data: existing } = await supabase
            .from('lieferanten').select('id').ilike('name', name).maybeSingle()
          const lieferantId = existing?.id ?? (
            await supabase.from('lieferanten').insert({ name }).select('id').single()
          ).data?.id
          if (lieferantId) {
            updates.lieferant_id = lieferantId as any
            updated.push('Lieferant')
          }
        }

        if (Object.keys(updates).length > 0) {
          const { error } = await supabase.from('rechnungen').update(updates).eq('id', r.id)
          if (error) throw new Error(error.message)
          updateResult(r.id, { status: 'done', updated })
        } else {
          updateResult(r.id, { status: 'skipped', updated: [] })
        }
      } catch (err) {
        updateResult(r.id, {
          status: 'error',
          error: err instanceof Error ? err.message : 'Unbekannter Fehler',
        })
      }

      // Kurze Pause gegen Rate-Limit
      await new Promise(res => setTimeout(res, 800))
    }

    setRunning(false)
    setDone(true)
    onRefresh()
  }

  const handleClose = () => {
    if (running) return
    setResults([])
    setDone(false)
    onClose()
  }

  const doneCount  = results.filter(r => r.status === 'done').length
  const errorCount = results.filter(r => r.status === 'error').length

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) handleClose() }}>
      <DialogContent className="max-w-md bg-white border border-border shadow-xl">
        <DialogHeader>
          <div className="flex items-center gap-2.5 mb-1">
            <div className="w-8 h-8 rounded-card-sm bg-bg-muted flex items-center justify-center">
              <Sparkles size={15} className="text-ink-muted" />
            </div>
            <DialogTitle className="text-base font-semibold text-ink">Felder ergänzen</DialogTitle>
          </div>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          {/* API Key */}
          {!running && !done && (
            <>
              <div>
                <label className="label-caps block mb-1.5">OpenRouter API Key</label>
                <div className="relative">
                  <KeyRound size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle" />
                  <input
                    type="password"
                    value={apiKey}
                    onChange={e => setApiKey(e.target.value)}
                    placeholder="AIza…"
                    className="w-full pl-9 pr-4 h-9 text-sm border border-border rounded-card-sm bg-bg-surface text-ink focus:outline-none focus:ring-1 focus:ring-accent-400 font-mono"
                  />
                </div>
                <p className="text-xs text-ink-muted mt-1.5">Wird nur für diese Sitzung verwendet, nicht gespeichert.</p>
              </div>

              <div>
                <label className="label-caps block mb-1.5">Anzahl Rechnungen</label>
                <div className="grid grid-cols-4 gap-1.5">
                  {[5, 10, 20, 0].map(n => (
                    <button
                      key={n}
                      onClick={() => setLimit(n)}
                      className={cn(
                        'h-8 rounded-card-sm text-sm font-medium border transition-colors',
                        limit === n
                          ? 'bg-ink text-white border-ink'
                          : 'border-border text-ink-muted hover:bg-bg-muted'
                      )}
                    >
                      {n === 0 ? 'Alle' : n}
                    </button>
                  ))}
                </div>
              </div>

              {/* Überschreiben-Toggle */}
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <div
                  onClick={() => setForceAll(v => !v)}
                  className={cn(
                    'w-8 h-4.5 rounded-full transition-colors relative flex-shrink-0',
                    forceAll ? 'bg-ink' : 'bg-border'
                  )}
                  style={{ height: '18px', width: '32px' }}
                >
                  <div className={cn(
                    'absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white shadow transition-transform',
                    forceAll ? 'translate-x-4' : 'translate-x-0.5'
                  )} />
                </div>
                <span className="text-xs text-ink-muted">
                  Bestehende Felder überschreiben
                  {forceAll && <span className="ml-1 text-ink font-medium">(alle PDFs)</span>}
                </span>
              </label>

              <div className="rounded-card border border-border p-3.5 space-y-1.5 bg-bg-muted/30">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-ink-muted">Werden verarbeitet</span>
                  <span className="text-xs font-semibold text-ink">
                    {toProcess.length}
                    {limit !== 0 && allToProcess.length > limit && (
                      <span className="text-ink-subtle font-normal"> von {allToProcess.length}</span>
                    )}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-ink-muted">Modus</span>
                  <span className="text-xs text-ink-muted">{forceAll ? 'Alle Felder neu' : 'Nur fehlende Felder'}</span>
                </div>
                {allToProcess.length === 0 && !forceAll && (
                  <p className="text-xs text-status-active font-medium pt-1">Alle Felder bereits befüllt ✓</p>
                )}
              </div>
            </>
          )}

          {/* Progress list */}
          {results.length > 0 && (
            <div className="rounded-card border border-border overflow-hidden">
              {done && (
                <div className="px-3.5 py-2 bg-bg-muted border-b border-border flex items-center justify-between">
                  <span className="text-xs font-medium text-ink">{doneCount} aktualisiert</span>
                  {errorCount > 0 && <span className="text-xs text-status-danger">{errorCount} Fehler</span>}
                </div>
              )}
              <div className="max-h-52 overflow-y-auto divide-y divide-border/50">
                {results.map(r => (
                  <div key={r.id} className="flex items-start gap-2.5 px-3.5 py-2.5">
                    <div className="mt-0.5 flex-shrink-0">
                      {r.status === 'pending'    && <div className="w-3.5 h-3.5 rounded-full bg-border" />}
                      {r.status === 'processing' && <Loader2 size={14} className="animate-spin text-accent-500" />}
                      {r.status === 'done'       && <CheckCircle size={14} className="text-status-active" />}
                      {r.status === 'error'      && <XCircle size={14} className="text-status-danger" />}
                      {r.status === 'skipped'    && <SkipForward size={14} className="text-ink-subtle" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-ink truncate">{r.name}</p>
                      {r.status === 'done' && r.updated.length > 0 && (
                        <p className="text-xs text-status-active">{r.updated.join(', ')}</p>
                      )}
                      {r.status === 'skipped' && (
                        <p className="text-xs text-ink-subtle">Keine neuen Felder</p>
                      )}
                      {r.status === 'error' && (
                        <p className="text-xs text-status-danger truncate">{r.error}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={handleClose}
              disabled={running}
              className="flex-1 h-9 rounded-card-sm border border-border text-sm text-ink-muted hover:bg-bg-muted transition-colors disabled:opacity-40"
            >
              {done ? 'Schließen' : 'Abbrechen'}
            </button>
            {!done && (
              <button
                onClick={handleStart}
                disabled={running || !apiKey.trim() || toProcess.length === 0}
                className="flex-1 inline-flex items-center justify-center gap-1.5 h-9 rounded-card-sm bg-ink hover:bg-ink/80 disabled:opacity-40 text-white text-sm font-medium transition-colors"
              >
                {running
                  ? <><Loader2 size={13} className="animate-spin" /> Verarbeite…</>
                  : <><Sparkles size={13} /> Starten</>
                }
              </button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
