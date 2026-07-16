import {
  Document,
  Page,
  View,
  Text,
  Image,
  StyleSheet,
} from '@react-pdf/renderer'
import type { Angebot, Auftragsbestaetigung, Ausgangsrechnung, DokumentPosition, FirmaStammdaten } from '@/types/database'

// ─── Rich-text → react-pdf ────────────────────────────────────────────────────
// Parses TipTap JSON (or falls back to plain text).
// Supports: bold, italic, underline, paragraph line breaks.

type TipTapMark = { type: 'bold' | 'italic' | 'underline' }
type TipTapNode = {
  type: string
  text?: string
  marks?: TipTapMark[]
  content?: TipTapNode[]
}

function renderRichText(content: string, baseStyle: any) {
  let nodes: TipTapNode[] = []
  try {
    const json = JSON.parse(content)
    if (json?.type === 'doc' && Array.isArray(json.content)) {
      nodes = json.content
    }
  } catch {}

  if (nodes.length === 0) {
    // Plain text fallback: split on newlines
    return content.split('\n').map((line, i) =>
      <Text key={i} style={baseStyle}>{line || ' '}</Text>
    )
  }

  return nodes.map((para, pi) => {
    const inlines = para.content ?? []
    if (inlines.length === 0) {
      return <Text key={pi} style={{ fontSize: 2, lineHeight: 1 }}>{' '}</Text>
    }
    return (
      <Text key={pi} style={baseStyle}>
        {inlines.map((node, ni) => {
          const marks = node.marks ?? []
          const isBold = marks.some((m: TipTapMark) => m.type === 'bold')
          const isItalic = marks.some((m: TipTapMark) => m.type === 'italic')
          const isUnderline = marks.some((m: TipTapMark) => m.type === 'underline')
          const family = isBold
            ? (isItalic ? 'Helvetica-BoldOblique' : 'Helvetica-Bold')
            : (isItalic ? 'Helvetica-Oblique' : 'Helvetica')
          return (
            <Text key={ni} style={{ fontFamily: family, textDecoration: isUnderline ? 'underline' : 'none' }}>
              {node.text ?? ''}
            </Text>
          )
        })}
      </Text>
    )
  })
}

// ─── Firmenkonstanten (Fallback) ──────────────────────────────────────────────
const FIRMA_DEFAULT = {
  name: 'Quick Energy Handels-, Klima- und Elektrotechnik GmbH',
  strasse: 'Sieveringerstraße 56A',
  plzOrt: '1190 Wien',
  land: 'Österreich',
  tel: '+43 6644 614126',
  email: 'sales@quickenergy.at',
  web: 'www.quickenergy.at',
  uid: 'ATU78058389',
  fn: '5791131',
  steuerNr: '074161191',
  gericht: 'HG Wien',
  gf: 'Philipp Slupetzky',
  bank: 'Erste Bank',
  iban: 'AT62 2011 1290 2612 2005',
  bic: 'GIBAATWW',
  konto: '29026122005',
  blz: '20111',
  logoUrl: null as string | null,
}
type FirmaConfig = typeof FIRMA_DEFAULT

function firmaToConfig(f: FirmaStammdaten): FirmaConfig {
  return {
    name: f.name, strasse: f.strasse, plzOrt: f.plz_ort, land: f.land,
    tel: f.tel, email: f.email, web: f.web, uid: f.uid,
    fn: f.fn_nr, steuerNr: f.steuer_nr, gericht: f.gericht, gf: f.gf,
    bank: f.bank, iban: f.iban, bic: f.bic, konto: f.konto, blz: f.blz,
    logoUrl: f.logo_url ?? null,
  }
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: '#1a1a1a',
    paddingTop: 36,
    paddingBottom: 90,
    paddingHorizontal: 44,
  },

  // Header
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 },
  firmAdresse: { fontSize: 7.5, color: '#555', lineHeight: 1.5, maxWidth: 220 },
  logoBox: { alignItems: 'flex-end' },
  logoText: { fontSize: 22, fontFamily: 'Helvetica-Bold', letterSpacing: -0.5 },
  logoTagline: { fontSize: 7.5, color: '#555', letterSpacing: 0.5, marginTop: 1 },
  hrThick: { borderBottomWidth: 1.5, borderBottomColor: '#1a1a1a', marginVertical: 6 },
  hrThin: { borderBottomWidth: 0.5, borderBottomColor: '#ccc', marginVertical: 4 },

  // Address + Doc info row
  adressInfoRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  empfaengerBox: { maxWidth: 240 },
  empfaengerLabel: { fontSize: 7, color: '#888', marginBottom: 4 },
  empfaengerName: { fontFamily: 'Helvetica-Bold', fontSize: 9.5 },
  empfaengerText: { fontSize: 9, lineHeight: 1.6 },

  docInfoBox: { alignItems: 'flex-end', minWidth: 160 },
  docInfoRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, marginBottom: 2, width: 200 },
  docInfoLabel: { fontSize: 8, color: '#555' },
  docInfoValue: { fontSize: 8, fontFamily: 'Helvetica-Bold', textAlign: 'right' },

  // Document title + body text
  docTitle: { fontFamily: 'Helvetica-Bold', fontSize: 12, marginBottom: 8 },
  bodyText: { fontSize: 8.5, lineHeight: 1.55, marginBottom: 6 },
  betreffLabel: { fontFamily: 'Helvetica-Bold', fontSize: 9 },

  // Positions table
  tableHeader: { flexDirection: 'row', backgroundColor: '#f5f5f5', borderTopWidth: 0.5, borderBottomWidth: 0.5, borderColor: '#ccc', paddingVertical: 4, paddingHorizontal: 3, marginTop: 10 },
  tableHeaderText: { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: '#333' },
  tableRow: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: '#e8e8e8', paddingVertical: 4, paddingHorizontal: 3 },
  tableRowAlt: { backgroundColor: '#fafafa' },
  tableCell: { fontSize: 8.5 },
  tableCellMuted: { fontSize: 7.5, color: '#666', marginTop: 1 },

  // Column widths (total ~507pt usable width)
  colPos: { width: 22 },
  colBez: { flex: 1 },
  colMenge: { width: 42, textAlign: 'right' },
  colEP: { width: 72, textAlign: 'right' },
  colGP: { width: 72, textAlign: 'right' },
  colRight: { width: 186 },
  posBild: { marginTop: 4, maxWidth: 170, maxHeight: 110, objectFit: 'contain', alignSelf: 'flex-end' },

  // Totals
  totalsContainer: { marginTop: 10, alignItems: 'flex-end' },
  totalsBox: { width: 220 },
  totalsRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  totalsLabel: { fontSize: 8.5, color: '#333' },
  totalsValue: { fontSize: 8.5, textAlign: 'right' },
  totalsBold: { fontFamily: 'Helvetica-Bold', fontSize: 10 },
  totalsHr: { borderBottomWidth: 1, borderBottomColor: '#1a1a1a', marginVertical: 3 },
  totalsHrLight: { borderBottomWidth: 0.5, borderBottomColor: '#ccc', marginVertical: 2 },

  // Footer
  footerContainer: { position: 'absolute', bottom: 24, left: 44, right: 44 },
  footerHr: { borderBottomWidth: 0.5, borderBottomColor: '#999', marginBottom: 5 },
  footerRow: { flexDirection: 'row', justifyContent: 'space-between' },
  footerCol: { fontSize: 6.5, color: '#555', lineHeight: 1.5, flex: 1 },
  footerColMid: { fontSize: 6.5, color: '#555', lineHeight: 1.5, flex: 1, paddingHorizontal: 8, borderLeftWidth: 0.3, borderRightWidth: 0.3, borderColor: '#ccc' },

  // Payment
  paymentBox: { marginTop: 12, fontSize: 8.5, lineHeight: 1.6 },
  paymentHighlight: { fontFamily: 'Helvetica-Bold' },
})

// ─── Helpers ─────────────────────────────────────────────────────────────────
function fmt(n: number): string {
  return new Intl.NumberFormat('de-AT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + ' EUR'
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return '—'
  const [y, m, day] = d.split('-')
  return `${day}.${m}.${y}`
}

function kundenName(k: Angebot['kunde'] | null | undefined): string {
  if (!k) return ''
  if (k.firmenname) return k.firmenname
  return `${k.vorname ?? ''} ${k.nachname ?? ''}`.trim()
}

function kundenAnschrift(k: Angebot['kunde'] | null | undefined): string[] {
  if (!k) return []
  const lines: string[] = []
  if (k.adresse) lines.push(k.adresse)
  if (k.plz || k.ort) lines.push(`${k.plz ?? ''} ${k.ort ?? ''}`.trim())
  if (k.land && k.land !== 'Österreich') lines.push(k.land)
  return lines
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Kopfzeile({ firma }: { firma: FirmaConfig }) {
  return (
    <>
      <View style={s.headerRow}>
        <Text style={s.firmAdresse}>
          {firma.name} – {firma.strasse} – {firma.plzOrt}
        </Text>
        <View style={s.logoBox}>
          {firma.logoUrl ? (
            <Image src={firma.logoUrl} style={{ maxHeight: 44, maxWidth: 140, objectFit: 'contain' }} />
          ) : (
            <>
              <Text style={s.logoText}>QuickEnergy</Text>
              <Text style={s.logoTagline}>Elektrotechnik · Smart Home · Photovoltaik</Text>
            </>
          )}
        </View>
      </View>
      <View style={s.hrThick} />
    </>
  )
}

function EmpfaengerDocInfo({
  kunde,
  nummer,
  nummerLabel,
  datum,
  datumLabel,
  extra,
  firma,
}: {
  kunde: Angebot['kunde']
  nummer: string
  nummerLabel: string
  datum: string
  datumLabel: string
  extra?: Array<[string, string]>
  firma: FirmaConfig
}) {
  const name = kundenName(kunde)
  const anschrift = kundenAnschrift(kunde)

  return (
    <View style={s.adressInfoRow}>
      <View style={s.empfaengerBox}>
        <Text style={s.empfaengerLabel}>{firma.name} – {firma.strasse} – {firma.plzOrt}</Text>
        <Text style={s.empfaengerName}>{name}</Text>
        {anschrift.map((l, i) => <Text key={i} style={s.empfaengerText}>{l}</Text>)}
        {kunde?.uid_nr && <Text style={[s.empfaengerText, { color: '#666', marginTop: 3 }]}>UID: {kunde.uid_nr}</Text>}
      </View>

      <View style={s.docInfoBox}>
        <DocInfoRow label={nummerLabel} value={nummer} />
        <DocInfoRow label={datumLabel} value={fmtDate(datum)} />
        {kunde && <DocInfoRow label="Ihr Ansprechpartner" value={firma.gf} />}
        {extra?.map(([l, v]) => <DocInfoRow key={l} label={l} value={v} />)}
      </View>
    </View>
  )
}

function DocInfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.docInfoRow}>
      <Text style={s.docInfoLabel}>{label}</Text>
      <Text style={s.docInfoValue}>{value}</Text>
    </View>
  )
}

function Positionen({ positionen }: { positionen: DokumentPosition[] }) {
  return (
    <View>
      {/* Table header */}
      <View style={s.tableHeader}>
        <Text style={[s.tableHeaderText, s.colPos]}>Pos.</Text>
        <Text style={[s.tableHeaderText, s.colBez]}>Beschreibung</Text>
        <Text style={[s.tableHeaderText, s.colMenge]}>Menge</Text>
        <Text style={[s.tableHeaderText, s.colEP]}>Einzelpreis</Text>
        <Text style={[s.tableHeaderText, s.colGP]}>Gesamtpreis</Text>
      </View>

      {positionen.map((p, i) => (
        <View key={p.id ?? i} style={[s.tableRow, i % 2 === 1 ? s.tableRowAlt : {}]} wrap={false}>
          <Text style={[s.tableCell, s.colPos]}>{i + 1}.</Text>
          <View style={s.colBez}>
            <Text style={s.tableCell}>{p.bezeichnung}</Text>
            {p.beschreibung ? <Text style={s.tableCellMuted}>{p.beschreibung}</Text> : null}
          </View>
          <View style={s.colRight}>
            <View style={{ flexDirection: 'row' }}>
              <Text style={[s.tableCell, s.colMenge]}>
                {new Intl.NumberFormat('de-AT', { minimumFractionDigits: 2 }).format(p.menge)} {p.einheit}
              </Text>
              <Text style={[s.tableCell, s.colEP]}>
                {new Intl.NumberFormat('de-AT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(p.einzelpreis_netto)} EUR
              </Text>
              <Text style={[s.tableCell, s.colGP]}>
                {new Intl.NumberFormat('de-AT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(p.zeilenbetrag_netto)} EUR
              </Text>
            </View>
            {p.bild_url ? <Image src={p.bild_url} style={s.posBild} /> : null}
          </View>
        </View>
      ))}
    </View>
  )
}

function Summen({
  netto20, netto10, netto0, ust20, ust10, brutto, rabatt,
}: {
  netto20: number; netto10: number; netto0: number
  ust20: number; ust10: number; brutto: number; rabatt: number
}) {
  const nettoGesamt = netto20 + netto10 + netto0
  return (
    <View style={s.totalsContainer}>
      <View style={s.totalsBox}>
        <View style={s.totalsHrLight} />
        {netto20 > 0 && <TotalsRow label="Gesamtbetrag netto (20% USt)" value={fmt(netto20)} />}
        {netto10 > 0 && <TotalsRow label="Gesamtbetrag netto (10% USt)" value={fmt(netto10)} />}
        {netto0 > 0 && <TotalsRow label="Gesamtbetrag netto (0% USt)" value={fmt(netto0)} />}
        {rabatt > 0 && <TotalsRow label={`Gesamtrabatt (${rabatt}%)`} value={`– ${fmt(nettoGesamt * rabatt / 100 / (1 - rabatt / 100))}`} />}
        <View style={s.totalsHrLight} />
        {ust20 > 0 && <TotalsRow label="zzgl. Umsatzsteuer 20%" value={fmt(ust20)} />}
        {ust10 > 0 && <TotalsRow label="zzgl. Umsatzsteuer 10%" value={fmt(ust10)} />}
        <View style={s.totalsHr} />
        <View style={s.totalsRow}>
          <Text style={[s.totalsLabel, s.totalsBold]}>Gesamtbetrag brutto</Text>
          <Text style={[s.totalsValue, s.totalsBold]}>{fmt(brutto)}</Text>
        </View>
      </View>
    </View>
  )
}

function TotalsRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.totalsRow}>
      <Text style={s.totalsLabel}>{label}</Text>
      <Text style={s.totalsValue}>{value}</Text>
    </View>
  )
}

// Schlussrechnung: Übersicht aller Teilrechnungen + Restbetrag (wie RE-1002641)
function RechnungsUebersicht({ r }: { r: Ausgangsrechnung }) {
  const prior = r.rechnungsuebersicht ?? []
  if (prior.length === 0 && r.restbetrag_netto == null) return null

  const zeilen = [
    ...prior,
    { rechnungsnummer: r.rechnungsnummer, datum: r.rechnungsdatum, label: 'Schlussrechnung', netto: r.restbetrag_netto ?? 0 },
  ]

  return (
    <View style={{ marginTop: 14 }} wrap={false}>
      <Text style={[s.bodyText, { fontFamily: 'Helvetica-Bold', marginBottom: 4 }]}>Rechnungsübersicht:</Text>
      {zeilen.map((z, i) => (
        <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 1.5 }}>
          <Text style={{ fontSize: 8.5, flex: 1 }}>
            {i + 1}. {z.label} Nr. {z.rechnungsnummer} vom {fmtDate(z.datum)}
          </Text>
          <Text style={{ fontSize: 8.5, textAlign: 'right', width: 130 }}>Betrag netto {fmt(z.netto)}</Text>
        </View>
      ))}
      {r.bereits_berechnet_netto != null && (
        <View style={{ marginTop: 4 }}>
          <View style={s.totalsHrLight} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 1.5 }}>
            <Text style={{ fontSize: 8.5, color: '#555' }}>Bereits berechnet (Teilrechnungen)</Text>
            <Text style={{ fontSize: 8.5, textAlign: 'right', width: 130 }}>– {fmt(r.bereits_berechnet_netto)}</Text>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 1.5 }}>
            <Text style={{ fontSize: 9.5, fontFamily: 'Helvetica-Bold' }}>Restbetrag netto (offen)</Text>
            <Text style={{ fontSize: 9.5, fontFamily: 'Helvetica-Bold', textAlign: 'right', width: 130 }}>{fmt(r.restbetrag_netto ?? 0)}</Text>
          </View>
        </View>
      )}
    </View>
  )
}

function Fusszeile({ firma }: { firma: FirmaConfig }) {
  return (
    <View style={s.footerContainer} fixed>
      <View style={s.footerHr} />
      <View style={s.footerRow}>
        <Text style={s.footerCol}>
          {firma.name}{'\n'}
          {firma.strasse}, {firma.plzOrt}{'\n'}
          Tel {firma.tel}{'\n'}
          E-Mail {firma.email}{'\n'}
          Web {firma.web}
        </Text>
        <Text style={s.footerColMid}>
          Amtsgericht {firma.gericht}{'\n'}
          FN-Nr.: {firma.fn}{'\n'}
          USt-ID {firma.uid}{'\n'}
          Steuer-Nr.: {firma.steuerNr}{'\n'}
          Geschäftsführung {firma.gf}
        </Text>
        <Text style={[s.footerCol, { textAlign: 'right' }]}>
          Bank {firma.bank}{'\n'}
          Konto {firma.konto}{'\n'}
          BLZ {firma.blz}{'\n'}
          IBAN {firma.iban}{'\n'}
          BIC {firma.bic}
        </Text>
      </View>
    </View>
  )
}

// ─── Dokument-Typ-Definitionen ────────────────────────────────────────────────

type DokumentInput =
  | { typ: 'angebot'; doc: Angebot }
  | { typ: 'auftragsbestaetigung'; doc: Auftragsbestaetigung }
  | { typ: 'rechnung'; doc: Ausgangsrechnung }

function getTitel(input: DokumentInput): string {
  if (input.typ === 'angebot') return 'Angebot'
  if (input.typ === 'auftragsbestaetigung') return 'Auftragsbestätigung'
  const r = input.doc as Ausgangsrechnung
  if (r.typ === 'teilrechnung') return `${r.teilrechnungs_prozent ?? ''}% Teilrechnung`
  if (r.typ === 'schlussrechnung') return 'Schlussrechnung'
  if (r.typ === 'stornorechnung') return `Stornorechnung`
  return 'Rechnung'
}

function getNummer(input: DokumentInput): string {
  if (input.typ === 'angebot') return (input.doc as Angebot).angebotsnummer
  if (input.typ === 'auftragsbestaetigung') return (input.doc as Auftragsbestaetigung).ab_nummer
  return (input.doc as Ausgangsrechnung).rechnungsnummer
}

function getNummerLabel(input: DokumentInput): string {
  if (input.typ === 'angebot') return 'Angebots-Nr.'
  if (input.typ === 'auftragsbestaetigung') return 'Auftrags-Nr.'
  return 'Rechnungs-Nr.'
}

function getDatum(input: DokumentInput): string {
  if (input.typ === 'angebot') return (input.doc as Angebot).angebotsdatum
  if (input.typ === 'auftragsbestaetigung') return (input.doc as Auftragsbestaetigung).ab_datum
  return (input.doc as Ausgangsrechnung).rechnungsdatum
}

function getExtraInfo(input: DokumentInput): Array<[string, string]> {
  const extra: Array<[string, string]> = []
  if (input.typ === 'angebot') {
    const a = input.doc as Angebot
    if (a.gueltig_bis) extra.push(['Gültig bis', fmtDate(a.gueltig_bis)])
    if (a.referenz_bestellnr) extra.push(['Referenz', a.referenz_bestellnr])
  }
  if (input.typ === 'auftragsbestaetigung') {
    const ab = input.doc as Auftragsbestaetigung
    if (ab.lieferdatum) extra.push(['Lieferdatum', fmtDate(ab.lieferdatum)])
    if (ab.zahlungsziel_tage) extra.push(['Zahlungsziel', `${ab.zahlungsziel_tage} Tage`])
  }
  if (input.typ === 'rechnung') {
    const r = input.doc as Ausgangsrechnung
    if (r.leistungsdatum) extra.push(['Leistungsdatum', fmtDate(r.leistungsdatum)])
    else if (r.leistungszeitraum_von) extra.push(['Leistungszeitraum', `${fmtDate(r.leistungszeitraum_von)} – ${fmtDate(r.leistungszeitraum_bis)}`])
    if (r.faelligkeitsdatum) extra.push(['Fälligkeit', fmtDate(r.faelligkeitsdatum)])
    if (r.zahlungsziel_tage) extra.push(['Zahlungsziel', `${r.zahlungsziel_tage} Tage`])
  }
  return extra
}

// ─── Haupt-Export ─────────────────────────────────────────────────────────────

export function QuickEnergyPdf(input: DokumentInput & { firma?: FirmaStammdaten | null }) {
  const { doc } = input
  const F: FirmaConfig = input.firma ? firmaToConfig(input.firma) : FIRMA_DEFAULT
  const positionen = (doc.positionen ?? []) as DokumentPosition[]
  const titel = getTitel(input)
  const nummer = getNummer(input)
  const nummerLabel = getNummerLabel(input)
  const datum = getDatum(input)
  const extra = getExtraInfo(input)
  const _ar = input.typ === 'rechnung' ? (input.doc as Ausgangsrechnung) : null
  const _stornoRef = _ar?.storno_zu_rechnung
  const _stornoNr = Array.isArray(_stornoRef) ? _stornoRef[0]?.rechnungsnummer : _stornoRef?.rechnungsnummer
  const stornoHinweis = _ar?.typ === 'stornorechnung' && _stornoNr
    ? `Stornorechnung zur Rechnung Nr. ${_stornoNr}`
    : null

  return (
    <Document
      title={`${titel} ${nummer}`}
      author={F.name}
      creator="QuickEnergy Dashboard"
    >
      <Page size="A4" style={s.page}>
        <Kopfzeile firma={F} />

        <EmpfaengerDocInfo
          kunde={doc.kunde ?? null}
          nummer={nummer}
          nummerLabel={nummerLabel}
          datum={datum}
          datumLabel="Datum"
          extra={extra}
          firma={F}
        />

        {/* Kopftext + Betreff */}
        {doc.kopftext && renderRichText(doc.kopftext, s.bodyText)}
        {stornoHinweis && (
          <Text style={[s.bodyText, { fontFamily: 'Helvetica-Bold' }]}>{stornoHinweis}</Text>
        )}
        {doc.betreff && (
          <Text style={[s.bodyText, s.betreffLabel]}>Betreff: {doc.betreff}</Text>
        )}

        {/* Positionen */}
        <Positionen positionen={positionen} />

        {/* Summen */}
        <Summen
          netto20={doc.summe_netto_20}
          netto10={doc.summe_netto_10}
          netto0={doc.summe_netto_0}
          ust20={doc.ust_20}
          ust10={doc.ust_10}
          brutto={doc.summe_brutto}
          rabatt={doc.rabatt_gesamt_prozent}
        />

        {/* Rechnungsübersicht (nur Schlussrechnung) */}
        {_ar?.typ === 'schlussrechnung' && <RechnungsUebersicht r={_ar} />}

        {/* Fußtext / Zahlungsinfo */}
        {doc.fusstext && (
          <View style={{ marginTop: 16 }} wrap={false}>
            {renderRichText(doc.fusstext, s.bodyText)}
          </View>
        )}

        <Fusszeile firma={F} />
      </Page>
    </Document>
  )
}
