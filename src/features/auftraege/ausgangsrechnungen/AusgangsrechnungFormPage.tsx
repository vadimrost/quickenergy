import { useState, useEffect } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { ArrowLeft, CheckCircle, Trash2, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { PageTitle } from '@/components/shared/PageTitle'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { DokumentForm, type DokumentFormValues } from '@/features/auftraege/shared/DokumentForm'
import { PdfButton } from '@/features/auftraege/shared/PdfButton'
import { PdfLivePreview } from '@/features/auftraege/shared/PdfLivePreview'
import { berechneSummen, emptyPosition } from '@/features/auftraege/shared/positionenUtils'
import {
  useAusgangsrechnung,
  useUpsertAusgangsrechnung,
  useUpdateAusgangsrechnungStatus,
  useBezahltMarkieren,
  useDeleteAusgangsrechnung,
} from './useAusgangsrechnungen'
import type { AusgangsrechnungTyp, AusgangsrechnungStatus, Kunde } from '@/types/database'
import type { PositionDraft } from '@/features/auftraege/shared/positionenUtils'

import { DEFAULT_KOPF, DEFAULT_FUSS } from '@/features/auftraege/shared/dokumentDefaults'

const TYP_OPTIONS: { value: AusgangsrechnungTyp; label: string }[] = [
  { value: 'rechnung',        label: 'Rechnung'        },
  { value: 'teilrechnung',    label: 'Teilrechnung'    },
  { value: 'schlussrechnung', label: 'Schlussrechnung' },
  { value: 'stornorechnung',  label: 'Stornorechnung'  },
]

const STATUS_OPTIONS: { value: AusgangsrechnungStatus; label: string }[] = [
  { value: 'entwurf',     label: 'Entwurf'     },
  { value: 'offen',       label: 'Offen'       },
  { value: 'teilbezahlt', label: 'Teilbezahlt' },
  { value: 'bezahlt',     label: 'Bezahlt'     },
  { value: 'storniert',   label: 'Storniert'   },
]

const STATUS_CLS: Record<AusgangsrechnungStatus, string> = {
  entwurf:     'bg-gray-100 text-gray-700 hover:bg-gray-200',
  offen:       'bg-blue-50 text-blue-700 hover:bg-blue-100',
  teilbezahlt: 'bg-amber-50 text-amber-700 hover:bg-amber-100',
  bezahlt:     'bg-green-50 text-green-700 hover:bg-green-100',
  storniert:   'bg-red-50 text-red-700 hover:bg-red-100',
}

type StornoZu = {
  id: string
  rechnungsnummer: string
  kunde?: Kunde | null
  positionen?: PositionDraft[]
  rabattGesamt?: number
}

type LocationState = {
  ab_id?: string
  prefill?: {
    kunde?: Kunde | null
    betreff?: string | null
    positionen?: PositionDraft[]
    rabattGesamt?: number
  }
  storno_zu?: StornoZu
} | null

export function AusgangsrechnungFormPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const fromState = (location.state as LocationState)
  const fromAb = fromState?.ab_id ? fromState : null
  const fromStorno = fromState?.storno_zu ?? null
  const isEdit = !!id && id !== 'neu'

  const { data: existing } = useAusgangsrechnung(isEdit ? id : undefined)
  const { mutate: upsert, isPending } = useUpsertAusgangsrechnung()
  const { mutate: updateStatus, isPending: statusPending } = useUpdateAusgangsrechnungStatus()
  const { mutate: bezahltMarkieren, isPending: bezahltPending } = useBezahltMarkieren()
  const { mutate: deleteRechnung, isPending: deletePending } = useDeleteAusgangsrechnung()

  // Determine initial typ from navigation source
  const initialTyp: AusgangsrechnungTyp = fromStorno ? 'stornorechnung' : 'rechnung'

  const [values, setValues] = useState<DokumentFormValues>({
    kunde: fromStorno?.kunde ?? fromAb?.prefill?.kunde ?? null,
    betreff: fromStorno ? `Storno zu ${fromStorno.rechnungsnummer}` : (fromAb?.prefill?.betreff ?? ''),
    datum: new Date().toISOString().split('T')[0],
    kopftext: DEFAULT_KOPF,
    fusstext: DEFAULT_FUSS,
    positionen: (fromStorno?.positionen?.length ? fromStorno.positionen
      : fromAb?.prefill?.positionen?.length ? fromAb.prefill.positionen
      : [emptyPosition(0)]),
    rabattGesamt: fromStorno?.rabattGesamt ?? fromAb?.prefill?.rabattGesamt ?? 0,
  })

  const [typ, setTyp] = useState<AusgangsrechnungTyp>(initialTyp)
  const [leistungsdatum, setLeistungsdatum] = useState(new Date().toISOString().split('T')[0])
  const [leistungVon, setLeistungVon] = useState('')
  const [leistungBis, setLeistungBis] = useState('')
  const [zahlungsziel, setZahlungsziel] = useState('14')
  const [teilProzent, setTeilProzent] = useState('')
  const [rechnungsnummer, setRechnungsnummer] = useState('')

  // Bezahlt dialog
  const [bezahltOpen, setBezahltOpen] = useState(false)
  const [bezahltAm, setBezahltAm] = useState(new Date().toISOString().split('T')[0])
  const [bezahltBetrag, setBezahltBetrag] = useState('')

  useEffect(() => {
    if (existing) {
      setValues({
        kunde: existing.kunde ?? null,
        betreff: existing.betreff ?? '',
        datum: existing.rechnungsdatum,
        kopftext: existing.kopftext ?? DEFAULT_KOPF,
        fusstext: existing.fusstext ?? DEFAULT_FUSS,
        positionen: existing.positionen?.length ? existing.positionen : [emptyPosition(0)],
        rabattGesamt: existing.rabatt_gesamt_prozent,
      })
      setTyp(existing.typ)
      setLeistungsdatum(existing.leistungsdatum ?? '')
      setLeistungVon(existing.leistungszeitraum_von ?? '')
      setLeistungBis(existing.leistungszeitraum_bis ?? '')
      setZahlungsziel(String(existing.zahlungsziel_tage))
      setTeilProzent(existing.teilrechnungs_prozent ? String(existing.teilrechnungs_prozent) : '')
      setBezahltBetrag(String(existing.summe_brutto ?? ''))
      setRechnungsnummer(existing.rechnungsnummer ?? '')
    }
  }, [existing])

  function handleSave() {
    if (!values.kunde) { toast.error('Bitte einen Kunden auswählen'); return }
    if (!leistungsdatum && !leistungVon) {
      toast.error('Leistungsdatum oder Leistungszeitraum ist Pflicht (§11 UStG)')
      return
    }

    const summen = berechneSummen(values.positionen, values.rabattGesamt)
    const zahlungsTage = parseInt(zahlungsziel) || 14
    const faellig = new Date(values.datum)
    faellig.setDate(faellig.getDate() + zahlungsTage)

    upsert({
      rechnung: {
        id: isEdit ? id : undefined,
        typ,
        ...(isEdit && rechnungsnummer ? { rechnungsnummer } : {}),
        kunde_id: values.kunde.id,
        auftragsbestaetigung_id: existing?.auftragsbestaetigung_id ?? (fromAb?.ab_id || null),
        storno_zu_rechnung_id: existing?.storno_zu_rechnung_id ?? (fromStorno?.id ?? null),
        betreff: values.betreff || null,
        rechnungsdatum: values.datum,
        leistungsdatum: leistungsdatum || null,
        leistungszeitraum_von: leistungVon || null,
        leistungszeitraum_bis: leistungBis || null,
        zahlungsziel_tage: zahlungsTage,
        faelligkeitsdatum: faellig.toISOString().split('T')[0],
        teilrechnungs_prozent: teilProzent ? parseFloat(teilProzent) : null,
        kopftext: values.kopftext,
        fusstext: values.fusstext,
        rabatt_gesamt_prozent: values.rabattGesamt,
        summe_netto_20: summen.netto_20,
        summe_netto_10: summen.netto_10,
        summe_netto_0: summen.netto_0,
        ust_20: summen.ust_20,
        ust_10: summen.ust_10,
        summe_brutto: summen.brutto,
        status: existing?.status ?? 'entwurf',
      },
      positionen: values.positionen,
    }, {
      onSuccess: (newId) => {
        // If this is a new Storno, mark the original as storniert
        if (!isEdit && fromStorno?.id) {
          updateStatus({ id: fromStorno.id, status: 'storniert' })
        }
        toast.success(isEdit ? 'Rechnung gespeichert' : 'Rechnung erstellt')
        navigate(`/ausgangsrechnungen/${newId}`)
      },
      onError: e => toast.error(String(e)),
    })
  }

  function handleStatusChange(status: AusgangsrechnungStatus) {
    if (!id || !existing) return
    if (status === 'bezahlt') { setBezahltOpen(true); return }
    updateStatus({ id, status }, {
      onSuccess: () => toast.success(`Status: ${STATUS_OPTIONS.find(s => s.value === status)?.label}`),
      onError: e => toast.error(String(e)),
    })
  }

  function handleBezahltConfirm() {
    if (!id) return
    bezahltMarkieren({
      id,
      bezahlt_am: bezahltAm,
      bezahlt_betrag: parseFloat(bezahltBetrag) || 0,
    }, {
      onSuccess: () => { toast.success('Rechnung als bezahlt markiert'); setBezahltOpen(false) },
      onError: e => toast.error(String(e)),
    })
  }

  function handleDelete() {
    if (!id || !window.confirm('Rechnung wirklich löschen?')) return
    deleteRechnung(id, {
      onSuccess: () => { toast.success('Rechnung gelöscht'); navigate('/ausgangsrechnungen') },
      onError: e => toast.error(String(e)),
    })
  }

  function handleCreateStorno() {
    if (!existing || !window.confirm(
      `Stornorechnung für ${existing.rechnungsnummer} erstellen?\n\nDie originale Rechnung wird als "Storniert" markiert.`
    )) return
    navigate('/ausgangsrechnungen/neu', {
      state: {
        storno_zu: {
          id: id!,
          rechnungsnummer: existing.rechnungsnummer,
          kunde: existing.kunde,
          positionen: existing.positionen,
          rabattGesamt: existing.rabatt_gesamt_prozent,
        },
      },
    })
  }

  let titleSuffix = ''
  if (!isEdit && fromStorno) titleSuffix = ` (Storno zu ${fromStorno.rechnungsnummer})`
  else if (!isEdit && fromAb) titleSuffix = ` (aus AB)`

  const canStorno = isEdit && existing &&
    existing.status !== 'storniert' &&
    existing.typ !== 'stornorechnung'

  return (
    <div className="xl:flex xl:gap-6 xl:items-start">
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/ausgangsrechnungen')} className="text-ink-muted hover:text-ink transition-colors">
              <ArrowLeft size={18} />
            </button>
            <PageTitle
              title={isEdit ? 'Rechnung bearbeiten' : `Neue Rechnung${titleSuffix}`}
              subtitle={existing?.rechnungsnummer}
            />
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Status */}
            {isEdit && existing && (
              <Select
                value={existing.status}
                onValueChange={v => handleStatusChange(v as AusgangsrechnungStatus)}
                disabled={statusPending || bezahltPending}
              >
                <SelectTrigger className={cn(
                  'h-8 px-3 text-xs font-medium rounded-full border-0 w-auto gap-1.5 focus:ring-0',
                  STATUS_CLS[existing.status]
                )}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map(s => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {/* Bezahlt markieren */}
            {isEdit && existing && (existing.status === 'offen' || existing.status === 'teilbezahlt') && (
              <Button variant="outline" size="sm" onClick={() => setBezahltOpen(true)}>
                <CheckCircle size={13} className="mr-1.5 text-green-600" />
                Bezahlt markieren
              </Button>
            )}

            {/* Storno erstellen */}
            {canStorno && (
              <Button variant="outline" size="sm" onClick={handleCreateStorno}
                className="text-red-600 border-red-200 hover:bg-red-50">
                <RotateCcw size={13} className="mr-1.5" />
                Storno erstellen
              </Button>
            )}

            {/* Löschen */}
            {isEdit && (
              <Button variant="ghost" size="sm" onClick={handleDelete} disabled={deletePending}
                className="text-red-500 hover:text-red-700 hover:bg-red-50 px-2">
                <Trash2 size={14} />
              </Button>
            )}

            {/* PDF */}
            {isEdit && existing && (existing.positionen?.length ?? 0) > 0 && (
              <PdfButton typ="rechnung" doc={existing} />
            )}
          </div>
        </div>

        <DokumentForm
          titel="Rechnungs"
          nummer={isEdit ? rechnungsnummer : undefined}
          onNummerChange={isEdit ? setRechnungsnummer : undefined}
          values={values}
          onChange={patch => setValues(v => ({ ...v, ...patch }))}
          onSave={handleSave}
          onCancel={() => navigate('/ausgangsrechnungen')}
          saving={isPending}
          extraFelder={
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-medium text-ink-muted mb-1 block">Typ</label>
                  <Select value={typ} onValueChange={v => setTyp(v as AusgangsrechnungTyp)}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TYP_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-medium text-ink-muted mb-1 block">Zahlungsziel (Tage)</label>
                  <Input type="number" min={0} value={zahlungsziel} onChange={e => setZahlungsziel(e.target.value)} className="h-8 text-sm" />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-ink-muted mb-1 block">
                  Leistungsdatum <span className="text-red-500">*</span>
                  <span className="text-ink-muted font-normal ml-1">(§11 UStG Pflicht)</span>
                </label>
                <Input type="date" value={leistungsdatum} onChange={e => setLeistungsdatum(e.target.value)} className="h-8 text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-medium text-ink-muted mb-1 block">oder Zeitraum von</label>
                  <Input type="date" value={leistungVon} onChange={e => setLeistungVon(e.target.value)} className="h-8 text-sm" />
                </div>
                <div>
                  <label className="text-xs font-medium text-ink-muted mb-1 block">bis</label>
                  <Input type="date" value={leistungBis} onChange={e => setLeistungBis(e.target.value)} className="h-8 text-sm" />
                </div>
              </div>
              {typ === 'teilrechnung' && (
                <div>
                  <label className="text-xs font-medium text-ink-muted mb-1 block">Teilrechnung Prozentsatz (%)</label>
                  <Input type="number" min={0} max={100} value={teilProzent} onChange={e => setTeilProzent(e.target.value)} placeholder="z.B. 30" className="h-8 text-sm" />
                </div>
              )}
            </div>
          }
        />
      </div>

      <div className="hidden xl:flex xl:flex-1 sticky top-0 -mt-8 -mb-8 -mr-10 h-screen">
        <PdfLivePreview
          typ="rechnung"
          values={values}
          rechnungTyp={typ}
          leistungsdatum={leistungsdatum}
          leistungVon={leistungVon}
          leistungBis={leistungBis}
          zahlungsziel={zahlungsziel}
          teilProzent={teilProzent}
          existingNr={existing?.rechnungsnummer}
          className="border-l border-border rounded-none shadow-none flex-1"
        />
      </div>

      {/* Bezahlt markieren Dialog */}
      <Dialog open={bezahltOpen} onOpenChange={setBezahltOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Rechnung als bezahlt markieren</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-xs font-medium text-ink-muted mb-1 block">Zahlungseingang am</label>
              <Input type="date" value={bezahltAm} onChange={e => setBezahltAm(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium text-ink-muted mb-1 block">Bezahlter Betrag (€)</label>
              <Input
                type="number" step="0.01"
                value={bezahltBetrag}
                onChange={e => setBezahltBetrag(e.target.value)}
                placeholder={String(existing?.summe_brutto ?? '')}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBezahltOpen(false)}>Abbrechen</Button>
            <Button onClick={handleBezahltConfirm} disabled={bezahltPending || !bezahltAm || !bezahltBetrag}
              className="bg-green-600 hover:bg-green-700 text-white">
              <CheckCircle size={14} className="mr-1.5" />
              Bestätigen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
