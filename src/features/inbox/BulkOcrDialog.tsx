import { useState, useCallback } from 'react'
import { CheckCircle, XCircle, Loader2, KeyRound, Sparkles, SkipForward } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import type { Rechnung } from '@/types/database'

type ResultStatus = 'pending' | 'processing' | 'done' | 'error' | 'skipped'

interface OcrResult {
  id: string
  name: string
  status: ResultStatus
  updated: string[]
  error?: string
}

function normalizeDate(raw: string | null | undefined): string | null {
  if (!raw) return null
  const s = String(raw).trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  if (s.includes('.')) {
    const parts = s.split('.')
    if (parts.length === 3) {
      const [d, m, y] = parts
      return `${y.trim()}-${m.trim().padStart(2, '0')}-${d.trim().padStart(2, '0')}`
    }
  }
  const p = new Date(s)
  return isNaN(p.getTime()) ? null : p.toISOString().split('T')[0]
}

async function pdfUrlToBase64(url: string): Promise<string> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`PDF nicht ladbar (${res.status})`)
  const blob = await res.blob()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve((reader.result as string).split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

const CARD_MAP: Record<string, string> = {
  '1380': 'spesen_philipp_1380',
  '0744': 'spesen_philipp_0744',
  '6362': 'firmenkarte_6362',
  '0660': 'firmenkarte_0660',
}

function resolveCard(lastFour: string | null | undefined): string | null {
  if (!lastFour) return null
  return CARD_MAP[String(lastFour).trim()] ?? null
}

async function geminiOcr(base64: string, apiKey: string): Promise<Record<string, any>> {
  const prompt = `Analysiere diese Rechnung und extrahiere alle Felder als JSON.

KATEGORIEN (invoice_type):
- "tanken_diesel" → Tankquittung mit Diesel
- "tanken_super"  → Tankquittung mit Benzin/Super/E10/E5
- "bewirtung"     → Restaurant, Café, Essen, Bewirtung
- "dienstleistung" → alles andere (IT, Handwerk, Beratung, etc.)

MEHRWERTSTEUER bei Bewirtung:
- net_amount_10: Nettobetrag für Positionen mit 10% MwSt (Speisen)
- net_amount_20: Nettobetrag für Positionen mit 20% MwSt (Getränke, Sonstiges)
- net_amount_0:  Betrag ohne MwSt (z.B. Trinkgeld)
- Wenn keine Aufschlüsselung vorhanden: nur net_amount füllen, rest null
- Bei anderen Kategorien: nur net_amount, die drei Einzelfelder auf null setzen

KARTE: card_last_four = letzte 4 Ziffern der Kreditkarte falls auf Beleg sichtbar, sonst null.
DATUM: immer Format YYYY-MM-DD.`

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { inline_data: { mime_type: 'application/pdf', data: base64 } },
            { text: prompt },
          ],
        }],
        generationConfig: {
          response_mime_type: 'application/json',
          response_schema: {
            type: 'OBJECT',
            properties: {
              invoice_date:   { type: 'STRING', nullable: true },
              due_date:       { type: 'STRING', nullable: true },
              invoice_number: { type: 'STRING', nullable: true },
              net_amount:     { type: 'NUMBER', nullable: true },
              tax_rate:       { type: 'NUMBER', nullable: true },
              net_amount_10:  { type: 'NUMBER', nullable: true },
              net_amount_20:  { type: 'NUMBER', nullable: true },
              net_amount_0:   { type: 'NUMBER', nullable: true },
              invoice_type:   { type: 'STRING', nullable: true },
              card_last_four: { type: 'STRING', nullable: true },
            },
          },
        },
      }),
    }
  )
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message ?? `Gemini Fehler ${res.status}`)
  }
  const data = await res.json()
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text
  return typeof text === 'string' ? JSON.parse(text) : (text ?? {})
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
  const [apiKey, setApiKey] = useState(import.meta.env.VITE_GEMINI_API_KEY ?? '')
  const [limit, setLimit] = useState<number>(5)
  const [running, setRunning] = useState(false)
  const [done, setDone] = useState(false)
  const [results, setResults] = useState<OcrResult[]>([])

  const allToProcess = rechnungen.filter(needsProcessing)
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
        const ocr = await geminiOcr(base64, apiKey.trim())

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

        if (ocr.net_amount && (!r.betrag || r.betrag === 0)) {
          updates.betrag = Number(ocr.net_amount)
          updated.push('Betrag')
        }

        if (ocr.tax_rate && (!r.ust_satz || r.ust_satz === 0)) {
          updates.ust_satz = Number(ocr.tax_rate)
          updated.push('USt.')
        }

        // Kategorie
        const validTypes = ['bewirtung', 'dienstleistung', 'tanken_diesel', 'tanken_super']
        if (ocr.invoice_type && validTypes.includes(ocr.invoice_type) && !r.rechnungstyp) {
          updates.rechnungstyp = ocr.invoice_type
          updated.push('Kategorie')
        }

        // MwSt-Aufschlüsselung (nur bei Bewirtung)
        const typ = (updates.rechnungstyp ?? r.rechnungstyp)
        if (typ === 'bewirtung') {
          if (ocr.net_amount_10 != null && !r.betrag_10) {
            updates.betrag_10 = Number(ocr.net_amount_10)
            updated.push('Netto 10%')
          }
          if (ocr.net_amount_20 != null && !r.betrag_20) {
            updates.betrag_20 = Number(ocr.net_amount_20)
            updated.push('Netto 20%')
          }
          if (ocr.net_amount_0 != null && !r.betrag_0) {
            updates.betrag_0 = Number(ocr.net_amount_0)
            updated.push('Trinkgeld 0%')
          }
        }

        const resolvedCard = resolveCard(ocr.card_last_four)
        if (resolvedCard && !r.karte) {
          updates.karte = resolvedCard
          updated.push('Karte')
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
                <label className="label-caps block mb-1.5">Gemini API Key</label>
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
                  <span className="text-xs text-ink-muted">Fehlende Felder gesucht</span>
                  <span className="text-xs text-ink-muted">Datum · Nr. · Kategorie · MwSt · Karte</span>
                </div>
                {allToProcess.length === 0 && (
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
