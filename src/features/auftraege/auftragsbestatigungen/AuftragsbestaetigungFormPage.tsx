import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Trash2, FilePlus } from 'lucide-react'
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
import {
  useAuftragsbestaetigung,
  useUpsertAuftragsbestaetigung,
  useUpdateAuftragsbestaetigungStatus,
  useDeleteAuftragsbestaetigung,
} from './useAuftragsbestatigungen'
import type { AuftragsbestaetigungStatus } from '@/types/database'

const DEFAULT_KOPF = `Sehr geehrte Damen und Herren,

vielen Dank für Ihren Auftrag. Wir bestätigen hiermit die Bestellung mit folgendem Inhalt:`

const DEFAULT_FUSS = `Für etwaige Rückfragen stehen wir Ihnen jederzeit gerne zur Verfügung.
Wir schätzen Ihr Vertrauen und bedanken uns herzlich dafür.

Mit freundlichen Grüßen,
Quick Energy`

const STATUS_OPTIONS: { value: AuftragsbestaetigungStatus; label: string }[] = [
  { value: 'entwurf',       label: 'Entwurf'       },
  { value: 'erhalten',      label: 'Erhalten'       },
  { value: 'teilberechnet', label: 'Teilberechnet'  },
  { value: 'berechnet',     label: 'Berechnet'      },
  { value: 'abgelehnt',     label: 'Abgelehnt'      },
  { value: 'archiv',        label: 'Archiv'         },
]

const STATUS_CLS: Record<AuftragsbestaetigungStatus, string> = {
  entwurf:       'bg-gray-100 text-gray-700 hover:bg-gray-200',
  erhalten:      'bg-blue-50 text-blue-700 hover:bg-blue-100',
  teilberechnet: 'bg-amber-50 text-amber-700 hover:bg-amber-100',
  berechnet:     'bg-green-50 text-green-700 hover:bg-green-100',
  abgelehnt:     'bg-red-50 text-red-700 hover:bg-red-100',
  archiv:        'bg-gray-100 text-gray-500 hover:bg-gray-200',
}

export function AuftragsbestaetigungFormPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const isEdit = !!id && id !== 'neu'

  const { data: existing } = useAuftragsbestaetigung(isEdit ? id : undefined)
  const { mutate: upsert, isPending } = useUpsertAuftragsbestaetigung()
  const { mutate: updateStatus, isPending: statusPending } = useUpdateAuftragsbestaetigungStatus()
  const { mutate: deleteAb, isPending: deletePending } = useDeleteAuftragsbestaetigung()

  const [values, setValues] = useState<DokumentFormValues>({
    kunde: null,
    betreff: '',
    datum: new Date().toISOString().split('T')[0],
    kopftext: DEFAULT_KOPF,
    fusstext: DEFAULT_FUSS,
    positionen: [emptyPosition(0)],
    rabattGesamt: 0,
  })
  const [lieferdatum, setLieferdatum] = useState('')
  const [zahlungsziel, setZahlungsziel] = useState('14')

  useEffect(() => {
    if (existing) {
      setValues({
        kunde: existing.kunde ?? null,
        betreff: existing.betreff ?? '',
        datum: existing.ab_datum,
        kopftext: existing.kopftext ?? DEFAULT_KOPF,
        fusstext: existing.fusstext ?? DEFAULT_FUSS,
        positionen: existing.positionen?.length ? existing.positionen : [emptyPosition(0)],
        rabattGesamt: existing.rabatt_gesamt_prozent,
      })
      setLieferdatum(existing.lieferdatum ?? '')
      setZahlungsziel(String(existing.zahlungsziel_tage))
    }
  }, [existing])

  function handleSave() {
    if (!values.kunde) { toast.error('Bitte einen Kunden auswählen'); return }
    if (!lieferdatum) { toast.error('Lieferdatum / Leistungsdatum ist erforderlich (§11 UStG)'); return }

    const summen = berechneSummen(values.positionen, values.rabattGesamt)

    upsert({
      ab: {
        id: isEdit ? id : undefined,
        kunde_id: values.kunde.id,
        betreff: values.betreff || null,
        ab_datum: values.datum,
        lieferdatum: lieferdatum || null,
        zahlungsziel_tage: parseInt(zahlungsziel) || 14,
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
        toast.success(isEdit ? 'Auftragsbestätigung gespeichert' : 'Auftragsbestätigung erstellt')
        navigate(`/auftraege/${newId}`)
      },
      onError: e => toast.error(String(e)),
    })
  }

  function handleStatusChange(status: AuftragsbestaetigungStatus) {
    if (!id || !existing) return
    updateStatus({ id, status }, {
      onSuccess: () => toast.success(`Status: ${STATUS_OPTIONS.find(s => s.value === status)?.label}`),
      onError: e => toast.error(String(e)),
    })
  }

  function handleDelete() {
    if (!id || !window.confirm('Auftragsbestätigung wirklich löschen?')) return
    deleteAb(id, {
      onSuccess: () => { toast.success('Auftragsbestätigung gelöscht'); navigate('/auftraege') },
      onError: e => toast.error(String(e)),
    })
  }

  function handleCreateRechnung() {
    if (!existing) return
    navigate('/ausgangsrechnungen/neu', {
      state: {
        ab_id: id,
        prefill: {
          kunde: existing.kunde,
          betreff: existing.betreff,
          positionen: existing.positionen,
          rabattGesamt: existing.rabatt_gesamt_prozent,
        },
      },
    })
  }

  return (
    <div className="xl:flex xl:gap-6 xl:items-start">
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/auftraege')} className="text-ink-muted hover:text-ink transition-colors">
              <ArrowLeft size={18} />
            </button>
            <PageTitle
              title={isEdit ? 'Auftragsbestätigung bearbeiten' : 'Neue Auftragsbestätigung'}
              subtitle={existing?.ab_nummer}
            />
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Status */}
            {isEdit && existing && (
              <Select
                value={existing.status}
                onValueChange={v => handleStatusChange(v as AuftragsbestaetigungStatus)}
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

            {/* Rechnung erstellen */}
            {isEdit && existing && (
              <Button variant="outline" size="sm" onClick={handleCreateRechnung}>
                <FilePlus size={13} className="mr-1.5" />
                Rechnung erstellen
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
              <PdfButton typ="auftragsbestaetigung" doc={existing} />
            )}
          </div>
        </div>

        <DokumentForm
          titel="Auftragsbestätigungs"
          nummer={existing?.ab_nummer}
          values={values}
          onChange={patch => setValues(v => ({ ...v, ...patch }))}
          onSave={handleSave}
          onCancel={() => navigate('/auftraege')}
          saving={isPending}
          extraFelder={
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-medium text-ink-muted mb-1 block">
                  Lieferdatum <span className="text-red-500">*</span>
                  <span className="text-ink-muted font-normal ml-1">(§11 UStG)</span>
                </label>
                <Input
                  type="date"
                  value={lieferdatum}
                  onChange={e => setLieferdatum(e.target.value)}
                  className="text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-ink-muted mb-1 block">Zahlungsziel (Tage)</label>
                <Input
                  type="number"
                  min={0}
                  value={zahlungsziel}
                  onChange={e => setZahlungsziel(e.target.value)}
                  className="text-sm"
                />
              </div>
            </div>
          }
        />
      </div>

      <div className="hidden xl:block w-[420px] shrink-0 sticky top-4" style={{ height: 'calc(100vh - 140px)' }}>
        <PdfLivePreview
          typ="auftragsbestaetigung"
          values={values}
          lieferdatum={lieferdatum}
          zahlungsziel={zahlungsziel}
          existingNr={existing?.ab_nummer}
        />
      </div>
    </div>
  )
}
