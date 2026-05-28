import { useState, useRef, useMemo, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Upload, ChevronDown, ChevronUp, Trash2, Users, Building2, Loader2, FileText, FileSpreadsheet } from 'lucide-react'
import * as XLSX from 'xlsx'
import { toast } from 'sonner'
import { StatCard } from '@/components/shared/StatCard'
import { SectionCard } from '@/components/shared/SectionCard'
import { EmptyState } from '@/components/shared/EmptyState'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { supabase } from '@/lib/supabase'
import { fileToBase64 } from '@/lib/gemini-ocr'
import { lohnOcr } from '@/lib/lohn-ocr'
import { useLohnabrechnungen, useDeleteLohnabrechnung } from './useLohn'
import { formatEuro, cn } from '@/lib/utils'
import type { Lohnabrechnung } from '@/types/database'

const MONAT_NAMEN = ['', 'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember']

const TYP_LABEL: Record<string, string> = {
  oegk: 'ÖGK',
  finanzamt: 'Finanzamt',
  kommunalsteuer: 'KommSt',
  dga: 'DGA',
  sonstige: 'Sonstige',
}

const TYP_STYLE: Record<string, string> = {
  oegk: 'bg-blue-50 text-blue-700',
  finanzamt: 'bg-orange-50 text-orange-700',
  kommunalsteuer: 'bg-purple-50 text-purple-700',
  dga: 'bg-green-50 text-green-700',
  sonstige: 'bg-gray-100 text-gray-600',
}

// ── Export Dialog ─────────────────────────────────────────────────────────────

function LohnExportDialog({ open, onClose, abrechnungen }: {
  open: boolean
  onClose: () => void
  abrechnungen: Lohnabrechnung[]
}) {
  const options = useMemo(() =>
    abrechnungen.map(a => ({
      id: a.id,
      label: `${MONAT_NAMEN[a.monat]} ${a.jahr}`,
      value: `${a.jahr}-${String(a.monat).padStart(2, '0')}`,
      abr: a,
    })),
    [abrechnungen]
  )

  const [selectedId, setSelectedId] = useState(options[0]?.id ?? '')

  useEffect(() => {
    if (options.length > 0 && !options.find(o => o.id === selectedId)) {
      setSelectedId(options[0].id)
    }
  }, [options])

  const selected = abrechnungen.find(a => a.id === selectedId)
  const dienstnehmer    = selected?.lohn_dienstnehmer    ?? []
  const koerperschaften = selected?.lohn_koerperschaften ?? []

  const handleExport = () => {
    if (!selected) { toast.error('Kein Monat ausgewählt'); return }

    const label = `${MONAT_NAMEN[selected.monat]}_${selected.jahr}`

    // Sheet 1: Dienstnehmer
    const dnRows = dienstnehmer.map(d => ({
      'Nr.':          d.ma_nr ?? '',
      'Name':         d.name,
      'Zahlungsart':  d.zahlungsart === 'barzahlung' ? 'Barzahlung' : 'Überweisung',
      'IBAN':         d.iban ?? '',
      'Betrag (€)':   d.betrag,
    }))
    dnRows.push({
      'Nr.':         '',
      'Name':        'Summe Dienstnehmer',
      'Zahlungsart': '',
      'IBAN':        '',
      'Betrag (€)':  selected.gesamt_dienstnehmer,
    } as any)

    const wsDn = XLSX.utils.json_to_sheet(dnRows)
    wsDn['!cols'] = [{ wch: 6 }, { wch: 26 }, { wch: 14 }, { wch: 26 }, { wch: 12 }]

    // Sheet 2: Körperschaften
    const kRows = koerperschaften.map(k => ({
      'Bezeichnung': k.bezeichnung,
      'Typ':         k.typ ? (TYP_LABEL[k.typ] ?? k.typ) : '',
      'BIC':         k.swift_bic ?? '',
      'IBAN':        k.iban ?? '',
      'Betrag (€)':  k.betrag,
    }))
    kRows.push(
      { 'Bezeichnung': 'Summe Körperschaften', 'Typ': '', 'BIC': '', 'IBAN': '', 'Betrag (€)': selected.gesamt_koerperschaften } as any,
      { 'Bezeichnung': 'GESAMTKOSTEN',         'Typ': '', 'BIC': '', 'IBAN': '', 'Betrag (€)': selected.gesamt_total         } as any,
    )

    const wsK = XLSX.utils.json_to_sheet(kRows)
    wsK['!cols'] = [{ wch: 36 }, { wch: 14 }, { wch: 14 }, { wch: 26 }, { wch: 12 }]

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, wsDn, 'Dienstnehmer')
    XLSX.utils.book_append_sheet(wb, wsK, 'Körperschaften')
    XLSX.writeFile(wb, `Lohnkosten_${label}.xlsx`)

    toast.success(`${label} exportiert`)
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
            <DialogTitle className="text-base font-semibold text-ink">Excel Export</DialogTitle>
          </div>
        </DialogHeader>

        <div className="pt-1 space-y-4">
          {/* Monat */}
          <div>
            <label className="label-caps block mb-1.5">Monat</label>
            {options.length > 0 ? (
              <select
                value={selectedId}
                onChange={e => setSelectedId(e.target.value)}
                className="w-full h-9 px-3 text-sm border border-border rounded-card-sm bg-bg-surface text-ink focus:outline-none focus:ring-1 focus:ring-accent-400 appearance-none cursor-pointer"
              >
                {options.map(o => (
                  <option key={o.id} value={o.id}>{o.label}</option>
                ))}
              </select>
            ) : (
              <div className="w-full h-9 px-3 flex items-center text-sm border border-border rounded-card-sm bg-bg-muted text-ink-subtle">
                Keine Abrechnungen vorhanden
              </div>
            )}
          </div>

          {/* Vorschau */}
          {selected && (
            <div className="rounded-card border border-border bg-bg-muted/40 p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-ink-muted">Dienstnehmer</span>
                <span className="text-xs font-medium text-ink">{dienstnehmer.length} Personen · {formatEuro(selected.gesamt_dienstnehmer)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-ink-muted">Körperschaften</span>
                <span className="text-xs font-medium text-ink">{koerperschaften.length} Positionen · {formatEuro(selected.gesamt_koerperschaften)}</span>
              </div>
              <div className="flex items-center justify-between border-t border-border/50 pt-2 mt-1">
                <span className="text-xs text-ink-muted">Gesamtkosten</span>
                <span className="text-sm font-semibold text-ink">{formatEuro(selected.gesamt_total)}</span>
              </div>
            </div>
          )}

          {/* Buttons */}
          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={onClose}
              className="flex-1 h-9 rounded-card-sm border border-border text-sm text-ink-muted hover:bg-bg-muted transition-colors"
            >
              Abbrechen
            </button>
            <button
              onClick={handleExport}
              disabled={!selected}
              className="flex-1 inline-flex items-center justify-center gap-1.5 h-9 rounded-card-sm bg-ink hover:bg-ink/80 disabled:opacity-40 text-white text-sm font-medium transition-colors"
            >
              <FileSpreadsheet size={14} />
              Exportieren
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export function LohnPage() {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [processing, setProcessing] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const qc = useQueryClient()
  const { data: abrechnungen = [], isLoading } = useLohnabrechnungen()
  const deleteMutation = useDeleteLohnabrechnung()

  const totalLohnkosten   = abrechnungen.reduce((s, a) => s + a.gesamt_total, 0)
  const totalDienstnehmer = abrechnungen.reduce((s, a) => s + a.gesamt_dienstnehmer, 0)
  const totalAbgaben      = abrechnungen.reduce((s, a) => s + a.gesamt_koerperschaften, 0)

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''

    const apiKey = import.meta.env.VITE_GEMINI_API_KEY as string | undefined
    if (!apiKey) { toast.error('Kein Gemini API Key konfiguriert'); return }

    setProcessing(true)
    try {
      toast.info('PDF wird hochgeladen…')
      const storagePath = `lohn_${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
      const { error: storageError } = await supabase.storage
        .from('rechnungen')
        .upload(storagePath, file, { contentType: 'application/pdf', upsert: false })
      if (storageError) throw new Error(`Storage: ${storageError.message}`)
      const { data: { publicUrl } } = supabase.storage.from('rechnungen').getPublicUrl(storagePath)

      toast.info('KI analysiert das Dokument…')
      const base64 = await fileToBase64(file)
      const ocr = await lohnOcr(base64, apiKey)

      if (!ocr.monat || !ocr.jahr) throw new Error('Monat/Jahr konnte nicht erkannt werden')

      const { data: abrechnung, error: abrError } = await supabase
        .from('lohnabrechnungen')
        .insert({
          monat:                  ocr.monat,
          jahr:                   ocr.jahr,
          gesamt_dienstnehmer:    ocr.gesamt_dienstnehmer    ?? 0,
          gesamt_koerperschaften: ocr.gesamt_koerperschaften ?? 0,
          gesamt_total:           ocr.gesamt_total           ?? 0,
          pdf_url:                publicUrl,
        })
        .select()
        .single()
      if (abrError) throw new Error(`DB: ${abrError.message}`)

      if (ocr.dienstnehmer.length > 0) {
        const { error } = await supabase.from('lohn_dienstnehmer').insert(
          ocr.dienstnehmer.map(d => ({ ...d, abrechnung_id: abrechnung.id }))
        )
        if (error) console.warn('Dienstnehmer insert:', error.message)
      }

      if (ocr.koerperschaften.length > 0) {
        const { error } = await supabase.from('lohn_koerperschaften').insert(
          ocr.koerperschaften.map(k => ({ ...k, abrechnung_id: abrechnung.id }))
        )
        if (error) console.warn('Körperschaften insert:', error.message)
      }

      await qc.invalidateQueries({ queryKey: ['lohnabrechnungen'] })
      toast.success(`${MONAT_NAMEN[ocr.monat]} ${ocr.jahr} erfolgreich importiert`)
      setExpandedId(abrechnung.id)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Fehler beim Importieren')
    } finally {
      setProcessing(false)
    }
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
      {/* Header */}
      <div className="flex items-start justify-between mb-5 md:mb-8">
        <div>
          <h1 className="text-2xl md:text-page-title font-semibold text-ink">Lohnkosten</h1>
          {abrechnungen.length > 0 && (
            <p className="text-sm text-ink-muted mt-1 hidden sm:block">
              {abrechnungen.length} Abrechnung{abrechnungen.length !== 1 ? 'en' : ''} importiert
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {abrechnungen.length > 0 && (
            <button
              onClick={() => setExportOpen(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl border border-border text-sm font-medium text-ink hover:bg-bg-muted transition-colors"
            >
              <FileSpreadsheet size={16} />
              <span className="hidden sm:inline">Excel</span>
            </button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf"
            className="hidden"
            onChange={handleFileChange}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={processing}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-accent-500 text-white text-sm font-medium hover:bg-accent-600 disabled:opacity-50 transition-colors"
          >
            {processing
              ? <Loader2 size={16} className="animate-spin" />
              : <Upload size={16} />
            }
            {processing ? 'Wird verarbeitet…' : 'Importieren'}
          </button>
        </div>
      </div>

      {/* KPIs */}
      {abrechnungen.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <StatCard
            label="Gesamte Lohnkosten"
            value={formatEuro(totalLohnkosten)}
            sub={`${abrechnungen.length} Monat${abrechnungen.length !== 1 ? 'e' : ''}`}
            accent
          />
          <StatCard label="Nettolöhne"       value={formatEuro(totalDienstnehmer)} icon={<Users size={16} />} />
          <StatCard label="Abgaben & Steuern" value={formatEuro(totalAbgaben)}      icon={<Building2 size={16} />} />
        </div>
      )}

      {/* Month list */}
      {abrechnungen.length === 0 ? (
        <EmptyState
          icon={<FileText size={24} />}
          title="Noch keine Lohnabrechnungen"
          description="Importiere ein Auszahlungsjournal als PDF — die KI extrahiert alle Daten automatisch."
        />
      ) : (
        <div className="space-y-3">
          {abrechnungen.map(abr => {
            const isExpanded      = expandedId === abr.id
            const dienstnehmer    = abr.lohn_dienstnehmer    ?? []
            const koerperschaften = abr.lohn_koerperschaften ?? []

            return (
              <SectionCard key={abr.id}>
                <button
                  className="w-full flex items-center justify-between text-left"
                  onClick={() => setExpandedId(isExpanded ? null : abr.id)}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-accent-50 flex items-center justify-center text-accent-600 shrink-0">
                      <FileText size={18} />
                    </div>
                    <div>
                      <p className="font-semibold text-ink">{MONAT_NAMEN[abr.monat]} {abr.jahr}</p>
                      <p className="text-sm text-ink-muted">
                        {dienstnehmer.length} Dienstnehmer · {formatEuro(abr.gesamt_total)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-base font-semibold text-ink hidden md:block">
                      {formatEuro(abr.gesamt_total)}
                    </span>
                    <button
                      onClick={e => {
                        e.stopPropagation()
                        if (confirm(`${MONAT_NAMEN[abr.monat]} ${abr.jahr} löschen?`)) {
                          deleteMutation.mutate(abr.id)
                        }
                      }}
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-subtle hover:text-status-danger hover:bg-red-50 transition-colors"
                    >
                      <Trash2 size={15} />
                    </button>
                    {isExpanded
                      ? <ChevronUp  size={18} className="text-ink-muted" />
                      : <ChevronDown size={18} className="text-ink-muted" />
                    }
                  </div>
                </button>

                {isExpanded && (
                  <div className="mt-5 pt-5 border-t border-border space-y-5">
                    {/* Mini KPIs */}
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      <div className="bg-bg-muted rounded-xl p-3">
                        <p className="label-caps mb-1">Nettolöhne</p>
                        <p className="text-base font-semibold text-ink">{formatEuro(abr.gesamt_dienstnehmer)}</p>
                      </div>
                      <div className="bg-bg-muted rounded-xl p-3">
                        <p className="label-caps mb-1">Abgaben</p>
                        <p className="text-base font-semibold text-ink">{formatEuro(abr.gesamt_koerperschaften)}</p>
                      </div>
                      <div className="bg-accent-50 rounded-xl p-3 col-span-2 md:col-span-1">
                        <p className="label-caps mb-1">Gesamt</p>
                        <p className="text-base font-semibold text-accent-600">{formatEuro(abr.gesamt_total)}</p>
                      </div>
                    </div>

                    {/* Dienstnehmer */}
                    {dienstnehmer.length > 0 && (
                      <div>
                        <p className="label-caps mb-3">Dienstnehmer</p>
                        <div className="rounded-xl border border-border overflow-hidden">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="bg-bg-muted text-ink-muted text-xs">
                                <th className="text-left px-4 py-2 font-medium">Nr.</th>
                                <th className="text-left px-4 py-2 font-medium">Name</th>
                                <th className="text-left px-4 py-2 font-medium hidden md:table-cell">Zahlung</th>
                                <th className="text-right px-4 py-2 font-medium">Betrag</th>
                              </tr>
                            </thead>
                            <tbody>
                              {dienstnehmer.map((d, i) => (
                                <tr key={d.id} className={cn('border-t border-border', i % 2 !== 0 && 'bg-bg-muted/30')}>
                                  <td className="px-4 py-2.5 text-ink-muted tabular-nums">{d.ma_nr ?? '—'}</td>
                                  <td className="px-4 py-2.5 font-medium text-ink">{d.name}</td>
                                  <td className="px-4 py-2.5 text-ink-muted capitalize hidden md:table-cell">{d.zahlungsart}</td>
                                  <td className="px-4 py-2.5 text-right font-semibold text-ink tabular-nums">{formatEuro(d.betrag)}</td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot>
                              <tr className="border-t-2 border-border bg-bg-muted">
                                <td colSpan={3} className="px-4 py-2.5 text-xs font-medium text-ink-muted">Summe Dienstnehmer</td>
                                <td className="px-4 py-2.5 text-right font-bold text-ink tabular-nums">{formatEuro(abr.gesamt_dienstnehmer)}</td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Körperschaften */}
                    {koerperschaften.length > 0 && (
                      <div>
                        <p className="label-caps mb-3">Körperschaften & Abgaben</p>
                        <div className="rounded-xl border border-border overflow-hidden">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="bg-bg-muted text-ink-muted text-xs">
                                <th className="text-left px-4 py-2 font-medium">Bezeichnung</th>
                                <th className="text-left px-4 py-2 font-medium hidden md:table-cell">Typ</th>
                                <th className="text-right px-4 py-2 font-medium">Betrag</th>
                              </tr>
                            </thead>
                            <tbody>
                              {koerperschaften.map((k, i) => (
                                <tr key={k.id} className={cn('border-t border-border', i % 2 !== 0 && 'bg-bg-muted/30')}>
                                  <td className="px-4 py-2.5 font-medium text-ink">{k.bezeichnung}</td>
                                  <td className="px-4 py-2.5 hidden md:table-cell">
                                    {k.typ && (
                                      <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', TYP_STYLE[k.typ] ?? TYP_STYLE.sonstige)}>
                                        {TYP_LABEL[k.typ] ?? k.typ}
                                      </span>
                                    )}
                                  </td>
                                  <td className="px-4 py-2.5 text-right font-semibold text-ink tabular-nums">{formatEuro(k.betrag)}</td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot>
                              <tr className="border-t-2 border-border bg-bg-muted">
                                <td colSpan={2} className="px-4 py-2.5 text-xs font-medium text-ink-muted">Summe Abgaben</td>
                                <td className="px-4 py-2.5 text-right font-bold text-ink tabular-nums">{formatEuro(abr.gesamt_koerperschaften)}</td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      </div>
                    )}

                    {abr.pdf_url && (
                      <a
                        href={abr.pdf_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-sm text-accent-600 hover:underline"
                      >
                        <FileText size={14} />
                        Original PDF öffnen
                      </a>
                    )}
                  </div>
                )}
              </SectionCard>
            )
          })}
        </div>
      )}

      <LohnExportDialog
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        abrechnungen={abrechnungen}
      />
    </div>
  )
}
