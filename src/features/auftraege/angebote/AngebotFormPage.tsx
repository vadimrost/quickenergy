import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Trash2, ArrowRightLeft } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { PageTitle } from '@/components/shared/PageTitle'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DokumentForm, type DokumentFormValues } from '@/features/auftraege/shared/DokumentForm'
import { PdfButton } from '@/features/auftraege/shared/PdfButton'
import { PdfLivePreview } from '@/features/auftraege/shared/PdfLivePreview'
import { berechneSummen, emptyPosition } from '@/features/auftraege/shared/positionenUtils'
import { useAngebot, useUpsertAngebot, useUpdateAngebotStatus, useDeleteAngebot } from './useAngebote'
import { useConvertAngebotToAb } from '../auftragsbestatigungen/useAuftragsbestatigungen'
import type { AngebotStatus } from '@/types/database'

const DEFAULT_KOPF = `Sehr geehrte Damen und Herren,

herzlichen Dank für Ihre Anfrage. Es freut uns, Ihnen das gewünschte, unverbindliche Angebot unterbreiten zu dürfen.`

const DEFAULT_FUSS = `Für etwaige Rückfragen stehen wir Ihnen jederzeit gerne zur Verfügung.
Wir schätzen Ihr Vertrauen und bedanken uns herzlich dafür.

Mit freundlichen Grüßen,
Quick Energy`

const STATUS_OPTIONS: { value: AngebotStatus; label: string }[] = [
  { value: 'entwurf',      label: 'Entwurf'       },
  { value: 'offen',        label: 'Offen'          },
  { value: 'berechnet',    label: 'Berechnet'      },
  { value: 'teilberechnet', label: 'Teilberechnet' },
  { value: 'abgelehnt',   label: 'Abgelehnt'      },
]

const STATUS_CLS: Record<AngebotStatus, string> = {
  entwurf:       'bg-gray-100 text-gray-700 hover:bg-gray-200',
  offen:         'bg-blue-50 text-blue-700 hover:bg-blue-100',
  berechnet:     'bg-green-50 text-green-700 hover:bg-green-100',
  teilberechnet: 'bg-amber-50 text-amber-700 hover:bg-amber-100',
  abgelehnt:     'bg-red-50 text-red-700 hover:bg-red-100',
}

export function AngebotFormPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const isEdit = !!id && id !== 'neu'

  const { data: existing } = useAngebot(isEdit ? id : undefined)
  const { mutate: upsert, isPending } = useUpsertAngebot()
  const { mutate: updateStatus, isPending: statusPending } = useUpdateAngebotStatus()
  const { mutate: deleteAngebot, isPending: deletePending } = useDeleteAngebot()
  const { mutate: convertToAb, isPending: convertPending } = useConvertAngebotToAb()

  const [values, setValues] = useState<DokumentFormValues>({
    kunde: null,
    betreff: '',
    datum: new Date().toISOString().split('T')[0],
    kopftext: DEFAULT_KOPF,
    fusstext: DEFAULT_FUSS,
    positionen: [emptyPosition(0)],
    rabattGesamt: 0,
  })

  const [gueltigBis, setGueltigBis] = useState('')
  const [referenz, setReferenz] = useState('')

  useEffect(() => {
    if (existing) {
      setValues({
        kunde: existing.kunde ?? null,
        betreff: existing.betreff ?? '',
        datum: existing.angebotsdatum,
        kopftext: existing.kopftext ?? DEFAULT_KOPF,
        fusstext: existing.fusstext ?? DEFAULT_FUSS,
        positionen: existing.positionen?.length ? existing.positionen : [emptyPosition(0)],
        rabattGesamt: existing.rabatt_gesamt_prozent,
      })
      setGueltigBis(existing.gueltig_bis ?? '')
      setReferenz(existing.referenz_bestellnr ?? '')
    }
  }, [existing])

  function handleSave() {
    if (!values.kunde) { toast.error('Bitte einen Kunden auswählen'); return }
    if (values.positionen.length === 0) { toast.error('Mindestens eine Position erforderlich'); return }

    const summen = berechneSummen(values.positionen, values.rabattGesamt)

    upsert({
      angebot: {
        id: isEdit ? id : undefined,
        kunde_id: values.kunde.id,
        betreff: values.betreff || null,
        angebotsdatum: values.datum,
        gueltig_bis: gueltigBis || null,
        referenz_bestellnr: referenz || null,
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
        toast.success(isEdit ? 'Angebot gespeichert' : 'Angebot erstellt')
        navigate(`/angebote/${newId}`)
      },
      onError: e => toast.error(String(e)),
    })
  }

  function handleStatusChange(status: AngebotStatus) {
    if (!id || !existing) return
    updateStatus({ id, status }, {
      onSuccess: () => toast.success(`Status: ${STATUS_OPTIONS.find(s => s.value === status)?.label}`),
      onError: e => toast.error(String(e)),
    })
  }

  function handleDelete() {
    if (!id || !window.confirm('Angebot wirklich löschen?')) return
    deleteAngebot(id, {
      onSuccess: () => { toast.success('Angebot gelöscht'); navigate('/angebote') },
      onError: e => toast.error(String(e)),
    })
  }

  function handleConvert() {
    if (!existing || !window.confirm('Angebot in Auftragsbestätigung umwandeln?\n\nEine neue AB wird erstellt und dieses Angebot als "Berechnet" markiert.')) return
    convertToAb(existing, {
      onSuccess: (abId) => {
        toast.success('Auftragsbestätigung erstellt')
        navigate(`/auftraege/${abId}`)
      },
      onError: e => toast.error(String(e)),
    })
  }

  const canConvert = isEdit && existing &&
    !existing.auftragsbestaetigung_id &&
    existing.status !== 'abgelehnt' &&
    (existing.positionen?.length ?? 0) > 0

  return (
    <div className="xl:flex xl:gap-6 xl:items-start">
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/angebote')} className="text-ink-muted hover:text-ink transition-colors">
              <ArrowLeft size={18} />
            </button>
            <PageTitle
              title={isEdit ? 'Angebot bearbeiten' : 'Neues Angebot'}
              subtitle={existing?.angebotsnummer}
            />
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Status */}
            {isEdit && existing && (
              <Select
                value={existing.status}
                onValueChange={v => handleStatusChange(v as AngebotStatus)}
                disabled={statusPending}
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

            {/* In AB umwandeln */}
            {canConvert && (
              <Button variant="outline" size="sm" onClick={handleConvert} disabled={convertPending}>
                <ArrowRightLeft size={13} className="mr-1.5" />
                In AB umwandeln
              </Button>
            )}

            {/* Löschen */}
            {isEdit && existing?.status === 'entwurf' && (
              <Button variant="ghost" size="sm" onClick={handleDelete} disabled={deletePending}
                className="text-red-500 hover:text-red-700 hover:bg-red-50 px-2">
                <Trash2 size={14} />
              </Button>
            )}

            {/* PDF */}
            {isEdit && existing && (existing.positionen?.length ?? 0) > 0 && (
              <PdfButton typ="angebot" doc={existing} />
            )}
          </div>
        </div>

        <DokumentForm
          titel="Angebots"
          nummer={existing?.angebotsnummer}
          values={values}
          onChange={patch => setValues(v => ({ ...v, ...patch }))}
          onSave={handleSave}
          onCancel={() => navigate('/angebote')}
          saving={isPending}
          extraFelder={
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-medium text-ink-muted mb-1 block">Gültig bis</label>
                <Input type="date" value={gueltigBis} onChange={e => setGueltigBis(e.target.value)} className="text-sm" />
              </div>
              <div>
                <label className="text-xs font-medium text-ink-muted mb-1 block">Referenz / Bestellnummer</label>
                <Input value={referenz} onChange={e => setReferenz(e.target.value)} placeholder="Optional" className="text-sm" />
              </div>
            </div>
          }
        />
      </div>

      <div className="hidden xl:flex xl:flex-1 sticky top-0 -mt-8 -mb-8 -mr-10 h-screen">
        <PdfLivePreview
          typ="angebot"
          values={values}
          gueltigBis={gueltigBis}
          referenz={referenz}
          existingNr={existing?.angebotsnummer}
          className="border-l border-border rounded-none shadow-none flex-1"
        />
      </div>
    </div>
  )
}
