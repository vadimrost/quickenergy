import { useState, useEffect, useRef, useMemo } from 'react'
import { Loader2 } from 'lucide-react'
import { DocumentHtmlPreview } from './DocumentHtmlPreview'
import { berechneSummen } from './positionenUtils'
import { useFirmaStammdaten } from '@/features/einstellungen/useFirmaStammdaten'
import type { Angebot, Auftragsbestaetigung, Ausgangsrechnung, AusgangsrechnungTyp } from '@/types/database'
import type { DokumentFormValues } from './DokumentForm'

export type PdfLivePreviewProps =
  | { typ: 'angebot'; values: DokumentFormValues; gueltigBis: string; referenz: string; existingNr?: string }
  | { typ: 'auftragsbestaetigung'; values: DokumentFormValues; lieferdatum: string; zahlungsziel: string; existingNr?: string }
  | { typ: 'rechnung'; values: DokumentFormValues; rechnungTyp: AusgangsrechnungTyp; leistungsdatum: string; leistungVon: string; leistungBis: string; zahlungsziel: string; teilProzent: string; existingNr?: string }

function buildAngebotDoc(p: Extract<PdfLivePreviewProps, { typ: 'angebot' }>): Angebot {
  const s = berechneSummen(p.values.positionen, p.values.rabattGesamt)
  return {
    id: 'preview', angebotsnummer: p.existingNr ?? 'AN-XXXX', status: 'entwurf',
    kunde_id: p.values.kunde?.id ?? null, betreff: p.values.betreff || null,
    angebotsdatum: p.values.datum, gueltig_bis: p.gueltigBis || null,
    referenz_bestellnr: p.referenz || null,
    kopftext: p.values.kopftext, fusstext: p.values.fusstext,
    rabatt_gesamt_prozent: p.values.rabattGesamt,
    summe_netto_20: s.netto_20, summe_netto_10: s.netto_10, summe_netto_0: s.netto_0,
    ust_20: s.ust_20, ust_10: s.ust_10, summe_brutto: s.brutto,
    auftragsbestaetigung_id: null, created_at: '',
    kunde: p.values.kunde ?? null,
    positionen: p.values.positionen.map((pos, i) => ({
      ...pos, id: `pre-${i}`, dokument_id: 'preview', dokument_typ: 'angebot' as const, created_at: '',
    })),
  }
}

function buildAbDoc(p: Extract<PdfLivePreviewProps, { typ: 'auftragsbestaetigung' }>): Auftragsbestaetigung {
  const s = berechneSummen(p.values.positionen, p.values.rabattGesamt)
  return {
    id: 'preview', ab_nummer: p.existingNr ?? 'AB-XXXX', status: 'entwurf',
    kunde_id: p.values.kunde?.id ?? null, angebot_id: null,
    betreff: p.values.betreff || null, ab_datum: p.values.datum,
    lieferdatum: p.lieferdatum || null, zahlungsziel_tage: parseInt(p.zahlungsziel) || 14,
    kopftext: p.values.kopftext, fusstext: p.values.fusstext,
    rabatt_gesamt_prozent: p.values.rabattGesamt,
    summe_netto_20: s.netto_20, summe_netto_10: s.netto_10, summe_netto_0: s.netto_0,
    ust_20: s.ust_20, ust_10: s.ust_10, summe_brutto: s.brutto,
    created_at: '', kunde: p.values.kunde ?? null,
    positionen: p.values.positionen.map((pos, i) => ({
      ...pos, id: `pre-${i}`, dokument_id: 'preview', dokument_typ: 'auftragsbestaetigung' as const, created_at: '',
    })),
  }
}

function buildRechnungDoc(p: Extract<PdfLivePreviewProps, { typ: 'rechnung' }>): Ausgangsrechnung {
  const s = berechneSummen(p.values.positionen, p.values.rabattGesamt)
  const zahlungsTage = parseInt(p.zahlungsziel) || 14
  const faellig = new Date(p.values.datum)
  faellig.setDate(faellig.getDate() + zahlungsTage)
  return {
    id: 'preview', rechnungsnummer: p.existingNr ?? 'RE-XXXX', status: 'entwurf',
    typ: p.rechnungTyp, kunde_id: p.values.kunde?.id ?? null,
    auftragsbestaetigung_id: null, storno_zu_rechnung_id: null,
    betreff: p.values.betreff || null, rechnungsdatum: p.values.datum,
    leistungsdatum: p.leistungsdatum || null,
    leistungszeitraum_von: p.leistungVon || null, leistungszeitraum_bis: p.leistungBis || null,
    zahlungsziel_tage: zahlungsTage, faelligkeitsdatum: faellig.toISOString().split('T')[0],
    teilrechnungs_prozent: p.teilProzent ? parseFloat(p.teilProzent) : null,
    kopftext: p.values.kopftext, fusstext: p.values.fusstext,
    rabatt_gesamt_prozent: p.values.rabattGesamt,
    summe_netto_20: s.netto_20, summe_netto_10: s.netto_10, summe_netto_0: s.netto_0,
    ust_20: s.ust_20, ust_10: s.ust_10, summe_brutto: s.brutto,
    bezahlt_am: null, bezahlt_betrag: null, datev_exportiert_am: null,
    mahnstufe: 0, gemahnt_am_1: null, gemahnt_am_2: null, gemahnt_am_3: null, mahngebuehr: 0,
    created_at: '', kunde: p.values.kunde ?? null,
    positionen: p.values.positionen.map((pos, i) => ({
      ...pos, id: `pre-${i}`, dokument_id: 'preview', dokument_typ: 'rechnung' as const, created_at: '',
    })),
    storno_zu_rechnung: null,
  }
}

function buildDocInput(p: PdfLivePreviewProps) {
  if (p.typ === 'angebot') return { typ: 'angebot' as const, doc: buildAngebotDoc(p) }
  if (p.typ === 'auftragsbestaetigung') return { typ: 'auftragsbestaetigung' as const, doc: buildAbDoc(p) }
  return { typ: 'rechnung' as const, doc: buildRechnungDoc(p) }
}

export function PdfLivePreview(props: PdfLivePreviewProps) {
  const { data: firma } = useFirmaStammdaten()
  const propsRef = useRef(props)
  propsRef.current = props

  const [debouncedProps, setDebouncedProps] = useState<PdfLivePreviewProps>(props)
  const [debouncing, setDebouncing] = useState(false)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    setDebouncing(true)
    const timer = setTimeout(() => {
      setDebouncedProps(propsRef.current)
      setDebouncing(false)
    }, 350)
    return () => clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(props)])

  const docInput = useMemo(() => buildDocInput(debouncedProps), [debouncedProps])

  return (
    <div className="h-full flex flex-col rounded-card border border-border shadow-card overflow-hidden">
      {/* Header bar */}
      <div className="px-4 py-2.5 border-b border-border flex items-center justify-between shrink-0 bg-white">
        <span className="label-caps">Vorschau</span>
        {debouncing && <Loader2 size={13} className="animate-spin text-ink-muted" />}
      </div>

      {/* Document preview — scrollable, light bg, white paper card */}
      <div className="flex-1 overflow-y-auto bg-[#e8eaed] p-4" style={{ scrollbarWidth: 'thin' }}>
        <div
          className="mx-auto bg-white shadow-[0_1px_4px_rgba(0,0,0,0.18),0_4px_16px_rgba(0,0,0,0.08)]"
          style={{ maxWidth: 520 }}
        >
          <DocumentHtmlPreview {...docInput} firma={firma ?? null} />
        </div>
      </div>
    </div>
  )
}
