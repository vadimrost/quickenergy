import type { Angebot, Auftragsbestaetigung, Ausgangsrechnung, DokumentPosition, Kunde, FirmaStammdaten } from '@/types/database'

type TtMark = { type: 'bold' | 'italic' | 'underline' }
type TtNode = { type: string; text?: string; marks?: TtMark[]; content?: TtNode[] }

function renderRichHtml(content: string): React.ReactNode {
  let nodes: TtNode[] = []
  try {
    const json = JSON.parse(content)
    if (json?.type === 'doc' && Array.isArray(json.content)) nodes = json.content
  } catch {}

  if (nodes.length === 0) {
    return <span style={{ whiteSpace: 'pre-wrap' }}>{content}</span>
  }

  return (
    <>
      {nodes.map((para, pi) => {
        const inlines = para.content ?? []
        if (inlines.length === 0) return <br key={pi} />
        return (
          <div key={pi}>
            {inlines.map((node, ni) => {
              const marks = node.marks ?? []
              let el: React.ReactNode = node.text ?? ''
              if (marks.some(m => m.type === 'bold')) el = <strong>{el}</strong>
              if (marks.some(m => m.type === 'italic')) el = <em>{el}</em>
              if (marks.some(m => m.type === 'underline')) el = <u>{el}</u>
              return <span key={ni}>{el}</span>
            })}
          </div>
        )
      })}
    </>
  )
}

const FIRMA_DEFAULT = {
  name: 'Quick Energy Handels-, Klima- und Elektrotechnik GmbH',
  strasse: 'Sieveringerstraße 56A',
  plzOrt: '1190 Wien',
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
  tel: '+43 6644 614126',
  email: 'sales@quickenergy.at',
  web: 'www.quickenergy.at',
  logoUrl: null as string | null,
}
type FirmaConfig = typeof FIRMA_DEFAULT

function firmaToConfig(f: FirmaStammdaten): FirmaConfig {
  return {
    name: f.name, strasse: f.strasse, plzOrt: f.plz_ort,
    uid: f.uid, fn: f.fn_nr, steuerNr: f.steuer_nr,
    gericht: f.gericht, gf: f.gf, bank: f.bank,
    iban: f.iban, bic: f.bic, konto: f.konto, blz: f.blz,
    tel: f.tel, email: f.email, web: f.web,
    logoUrl: f.logo_url ?? null,
  }
}

function fmt(n: number) {
  return new Intl.NumberFormat('de-AT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + ' EUR'
}
function fmtDate(d: string | null | undefined) {
  if (!d) return '—'
  const [y, m, day] = d.split('-')
  return `${day}.${m}.${y}`
}
function kundenName(k: Kunde | null | undefined) {
  if (!k) return ''
  return k.firmenname ?? `${k.vorname ?? ''} ${k.nachname ?? ''}`.trim()
}

type DocInput =
  | { typ: 'angebot'; doc: Angebot; firma?: FirmaStammdaten | null }
  | { typ: 'auftragsbestaetigung'; doc: Auftragsbestaetigung; firma?: FirmaStammdaten | null }
  | { typ: 'rechnung'; doc: Ausgangsrechnung; firma?: FirmaStammdaten | null }

function getNummerLabel(typ: DocInput['typ']) {
  if (typ === 'angebot') return 'Angebots-Nr.'
  if (typ === 'auftragsbestaetigung') return 'Auftrags-Nr.'
  return 'Rechnungs-Nr.'
}
function getNummer(input: DocInput) {
  if (input.typ === 'angebot') return input.doc.angebotsnummer
  if (input.typ === 'auftragsbestaetigung') return input.doc.ab_nummer
  return input.doc.rechnungsnummer
}
function getDatum(input: DocInput) {
  if (input.typ === 'angebot') return input.doc.angebotsdatum
  if (input.typ === 'auftragsbestaetigung') return input.doc.ab_datum
  return input.doc.rechnungsdatum
}
function getExtraInfo(input: DocInput): [string, string][] {
  if (input.typ === 'angebot') {
    const a = input.doc
    const rows: [string, string][] = []
    if (a.gueltig_bis) rows.push(['Gültig bis', fmtDate(a.gueltig_bis)])
    if (a.referenz_bestellnr) rows.push(['Referenz', a.referenz_bestellnr])
    return rows
  }
  if (input.typ === 'auftragsbestaetigung') {
    const ab = input.doc
    const rows: [string, string][] = []
    if (ab.lieferdatum) rows.push(['Lieferdatum', fmtDate(ab.lieferdatum)])
    if (ab.zahlungsziel_tage) rows.push(['Zahlungsziel', `${ab.zahlungsziel_tage} Tage`])
    return rows
  }
  const r = input.doc
  const rows: [string, string][] = []
  if (r.leistungsdatum) rows.push(['Leistungsdatum', fmtDate(r.leistungsdatum)])
  else if (r.leistungszeitraum_von) rows.push(['Leistungszeitraum', `${fmtDate(r.leistungszeitraum_von)} – ${fmtDate(r.leistungszeitraum_bis)}`])
  if (r.faelligkeitsdatum) rows.push(['Fälligkeit', fmtDate(r.faelligkeitsdatum)])
  if (r.zahlungsziel_tage) rows.push(['Zahlungsziel', `${r.zahlungsziel_tage} Tage`])
  return rows
}
function getTitel(input: DocInput) {
  if (input.typ === 'angebot') return 'Angebot'
  if (input.typ === 'auftragsbestaetigung') return 'Auftragsbestätigung'
  const r = input.doc
  if (r.typ === 'teilrechnung') return `${r.teilrechnungs_prozent ?? ''}% Teilrechnung`
  if (r.typ === 'schlussrechnung') return 'Schlussrechnung'
  if (r.typ === 'stornorechnung') return 'Stornorechnung'
  return 'Rechnung'
}

// Shared cell styles
const th: React.CSSProperties = {
  fontSize: 7.5,
  fontWeight: 700,
  color: '#333',
  padding: '4px 3px',
  textAlign: 'left',
  backgroundColor: '#f5f5f5',
  borderTop: '0.5px solid #ccc',
  borderBottom: '0.5px solid #ccc',
}
const td: React.CSSProperties = {
  fontSize: 8.5,
  padding: '4px 3px',
  verticalAlign: 'top',
  borderBottom: '0.5px solid #e8e8e8',
}

export function DocumentHtmlPreview(input: DocInput) {
  const { doc } = input
  const F: FirmaConfig = input.firma ? firmaToConfig(input.firma) : FIRMA_DEFAULT
  const positionen = (doc.positionen ?? []) as DokumentPosition[]
  const extra = getExtraInfo(input)
  const kunde = doc.kunde

  return (
    <div style={{
      fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
      fontSize: 9,
      color: '#1a1a1a',
      backgroundColor: 'white',
      padding: '28px 36px 40px',
      minHeight: 760,
      position: 'relative',
      boxSizing: 'border-box',
    }}>
      {/* ── Kopfzeile ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
        <div style={{ fontSize: 7.5, color: '#555', lineHeight: 1.5, maxWidth: 220 }}>
          {F.name} – {F.strasse} – {F.plzOrt}
        </div>
        <div style={{ textAlign: 'right' }}>
          {F.logoUrl ? (
            <img src={F.logoUrl} alt="Logo" style={{ maxHeight: 44, maxWidth: 140, objectFit: 'contain' }} />
          ) : (
            <>
              <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: -0.5, lineHeight: 1 }}>QuickEnergy</div>
              <div style={{ fontSize: 7.5, color: '#555', letterSpacing: 0.4, marginTop: 2 }}>
                Elektrotechnik · Smart Home · Photovoltaik
              </div>
            </>
          )}
        </div>
      </div>
      <div style={{ borderTop: '1.5px solid #1a1a1a', margin: '6px 0' }} />

      {/* ── Empfänger + Dokumentinfo ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ maxWidth: 230 }}>
          <div style={{ fontSize: 7, color: '#888', marginBottom: 4 }}>
            {F.name} – {F.strasse} – {F.plzOrt}
          </div>
          {kunde ? (
            <>
              <div style={{ fontWeight: 700, fontSize: 9.5, marginBottom: 1 }}>{kundenName(kunde)}</div>
              {kunde.adresse && <div style={{ fontSize: 9, lineHeight: 1.6 }}>{kunde.adresse}</div>}
              {(kunde.plz || kunde.ort) && <div style={{ fontSize: 9, lineHeight: 1.6 }}>{kunde.plz} {kunde.ort}</div>}
              {kunde.land && kunde.land !== 'Österreich' && <div style={{ fontSize: 9, lineHeight: 1.6 }}>{kunde.land}</div>}
              {kunde.uid_nr && <div style={{ fontSize: 8.5, color: '#666', marginTop: 2 }}>UID: {kunde.uid_nr}</div>}
            </>
          ) : (
            <div style={{ fontSize: 9, color: '#bbb', fontStyle: 'italic' }}>Kein Kunde ausgewählt</div>
          )}
        </div>

        <div style={{ minWidth: 190 }}>
          {[
            [getNummerLabel(input.typ), getNummer(input)],
            ['Datum', fmtDate(getDatum(input))],
            ...(kunde ? [['Ihr Ansprechpartner', F.gf]] : []),
            ...extra,
          ].map(([label, value], i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 2 }}>
              <span style={{ fontSize: 8, color: '#555' }}>{label}</span>
              <span style={{ fontSize: 8, fontWeight: 700 }}>{value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Dokumenttitel ── */}
      <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 8 }}>{getTitel(input)}</div>

      {/* ── Kopftext & Betreff ── */}
      {doc.kopftext && (
        <div style={{ fontSize: 8.5, lineHeight: 1.55, marginBottom: 6 }}>
          {renderRichHtml(doc.kopftext)}
        </div>
      )}
      {doc.betreff && (
        <div style={{ fontSize: 9, fontWeight: 700, marginBottom: 8 }}>Betreff: {doc.betreff}</div>
      )}

      {/* ── Positionen ── */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 8 }}>
        <thead>
          <tr>
            <th style={{ ...th, width: 20 }}>Pos.</th>
            <th style={{ ...th }}>Beschreibung</th>
            <th style={{ ...th, width: 60, textAlign: 'right' }}>Menge</th>
            <th style={{ ...th, width: 80, textAlign: 'right' }}>Einzelpreis</th>
            <th style={{ ...th, width: 80, textAlign: 'right' }}>Gesamtpreis</th>
          </tr>
        </thead>
        <tbody>
          {positionen.length === 0 ? (
            <tr>
              <td colSpan={5} style={{ ...td, color: '#bbb', fontStyle: 'italic', textAlign: 'center', padding: '8px 0' }}>
                Keine Positionen
              </td>
            </tr>
          ) : positionen.map((p, i) => (
            <tr key={p.id ?? i} style={{ backgroundColor: i % 2 === 1 ? '#fafafa' : 'white' }}>
              <td style={{ ...td }}>{i + 1}.</td>
              <td style={{ ...td }}>
                <div>{p.bezeichnung || <span style={{ color: '#bbb', fontStyle: 'italic' }}>—</span>}</div>
                {p.beschreibung ? <div style={{ fontSize: 7.5, color: '#666', marginTop: 1 }}>{p.beschreibung}</div> : null}
              </td>
              <td style={{ ...td, textAlign: 'right' }}>
                {new Intl.NumberFormat('de-AT', { minimumFractionDigits: 2 }).format(p.menge)} {p.einheit}
              </td>
              <td style={{ ...td, textAlign: 'right' }}>
                {new Intl.NumberFormat('de-AT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(p.einzelpreis_netto)} EUR
              </td>
              <td style={{ ...td, textAlign: 'right', verticalAlign: 'top' }}>
                {new Intl.NumberFormat('de-AT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(p.zeilenbetrag_netto)} EUR
                {p.bild_url ? <img src={p.bild_url} alt="" style={{ marginTop: 4, maxWidth: 150, maxHeight: 100, objectFit: 'contain', display: 'block', marginLeft: 'auto' }} /> : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* ── Summen ── */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
        <div style={{ width: 210 }}>
          <div style={{ borderTop: '0.5px solid #ccc', margin: '2px 0' }} />
          {doc.summe_netto_20 > 0 && <SumRow label="Netto (20% USt)" value={fmt(doc.summe_netto_20)} />}
          {doc.summe_netto_10 > 0 && <SumRow label="Netto (10% USt)" value={fmt(doc.summe_netto_10)} />}
          {doc.summe_netto_0 > 0 && <SumRow label="Netto (0% USt)" value={fmt(doc.summe_netto_0)} />}
          {doc.rabatt_gesamt_prozent > 0 && (
            <SumRow label={`Gesamtrabatt (${doc.rabatt_gesamt_prozent}%)`} value={`– ${fmt((doc.summe_netto_20 + doc.summe_netto_10 + doc.summe_netto_0) * doc.rabatt_gesamt_prozent / 100)}`} />
          )}
          <div style={{ borderTop: '0.5px solid #ccc', margin: '2px 0' }} />
          {doc.ust_20 > 0 && <SumRow label="zzgl. USt 20%" value={fmt(doc.ust_20)} />}
          {doc.ust_10 > 0 && <SumRow label="zzgl. USt 10%" value={fmt(doc.ust_10)} />}
          <div style={{ borderTop: '1px solid #1a1a1a', margin: '3px 0' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '1px 0' }}>
            <span style={{ fontWeight: 700, fontSize: 10 }}>Gesamtbetrag brutto</span>
            <span style={{ fontWeight: 700, fontSize: 10 }}>{fmt(doc.summe_brutto)}</span>
          </div>
        </div>
      </div>

      {/* ── Rechnungsübersicht (nur Schlussrechnung) ── */}
      {input.typ === 'rechnung' && input.doc.typ === 'schlussrechnung' && (
        <RechnungsUebersichtHtml r={input.doc} />
      )}

      {/* ── Fußtext ── */}
      {doc.fusstext && (
        <div style={{ fontSize: 8.5, lineHeight: 1.6, marginTop: 16 }}>
          {renderRichHtml(doc.fusstext)}
        </div>
      )}

      {/* ── Footer ── */}
      <div style={{ marginTop: 28, borderTop: '0.5px solid #999', paddingTop: 5 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 6.5, color: '#555', lineHeight: 1.5, flex: 1 }}>
            {F.name}{'\n'}{F.strasse}, {F.plzOrt}{'\n'}
            Tel {F.tel}{'\n'}E-Mail {F.email}{'\n'}Web {F.web}
          </div>
          <div style={{ fontSize: 6.5, color: '#555', lineHeight: 1.5, flex: 1, paddingLeft: 8, borderLeft: '0.3px solid #ccc', borderRight: '0.3px solid #ccc', paddingRight: 8 }}>
            Amtsgericht {F.gericht}{'\n'}FN-Nr.: {F.fn}{'\n'}
            USt-ID {F.uid}{'\n'}Steuer-Nr.: {F.steuerNr}{'\n'}
            Geschäftsführung {F.gf}
          </div>
          <div style={{ fontSize: 6.5, color: '#555', lineHeight: 1.5, flex: 1, textAlign: 'right' }}>
            Bank {F.bank}{'\n'}Konto {F.konto}{'\n'}
            BLZ {F.blz}{'\n'}IBAN {F.iban}{'\n'}BIC {F.bic}
          </div>
        </div>
      </div>
    </div>
  )
}

function SumRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '1.5px 0' }}>
      <span style={{ fontSize: 8.5, color: '#333' }}>{label}</span>
      <span style={{ fontSize: 8.5 }}>{value}</span>
    </div>
  )
}

function RechnungsUebersichtHtml({ r }: { r: Ausgangsrechnung }) {
  const prior = r.rechnungsuebersicht ?? []
  if (prior.length === 0 && r.restbetrag_netto == null) return null

  const zeilen = [
    ...prior,
    { rechnungsnummer: r.rechnungsnummer, datum: r.rechnungsdatum, label: 'Schlussrechnung', netto: r.restbetrag_netto ?? 0 },
  ]

  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ fontSize: 8.5, fontWeight: 700, marginBottom: 4 }}>Rechnungsübersicht:</div>
      {zeilen.map((z, i) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '1.5px 0' }}>
          <span style={{ fontSize: 8.5 }}>{i + 1}. {z.label} Nr. {z.rechnungsnummer} vom {fmtDate(z.datum)}</span>
          <span style={{ fontSize: 8.5, textAlign: 'right' }}>Betrag netto {fmt(z.netto)}</span>
        </div>
      ))}
      {r.bereits_berechnet_netto != null && (
        <div style={{ marginTop: 4 }}>
          <div style={{ borderTop: '0.5px solid #ccc', margin: '2px 0' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '1.5px 0' }}>
            <span style={{ fontSize: 8.5, color: '#555' }}>Bereits berechnet (Teilrechnungen)</span>
            <span style={{ fontSize: 8.5 }}>– {fmt(r.bereits_berechnet_netto)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '1.5px 0' }}>
            <span style={{ fontSize: 9.5, fontWeight: 700 }}>Restbetrag netto (offen)</span>
            <span style={{ fontSize: 9.5, fontWeight: 700 }}>{fmt(r.restbetrag_netto ?? 0)}</span>
          </div>
        </div>
      )}
    </div>
  )
}
