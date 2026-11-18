import type { CSSProperties, ReactNode } from 'react'
import type { Angebot, Auftragsbestaetigung, Ausgangsrechnung, Lieferschein, FirmaStammdaten } from '@/types/database'
import {
  BP, BRIEFPAPIER_LOGO, briefModell, firmaConfig, fmtEur, fmtMenge, richAbsaetze,
  type SummenZeile, type BriefModell,
} from './briefpapier'

// Live-Vorschau im Briefpapier-Layout. 1 px hier = 1 pt im PDF, gleiche Masse wie PdfDocument.

type DocInput =
  | { typ: 'angebot'; doc: Angebot; firma?: FirmaStammdaten | null }
  | { typ: 'auftragsbestaetigung'; doc: Auftragsbestaetigung; firma?: FirmaStammdaten | null }
  | { typ: 'rechnung'; doc: Ausgangsrechnung; firma?: FirmaStammdaten | null }
  | { typ: 'lieferschein'; doc: Lieferschein; firma?: FirmaStammdaten | null }

const LH = 1.36
const LH_TEXT = 1.2
const FONT = '"QE Open Sans", "Open Sans", Helvetica, Arial, sans-serif'

const text: CSSProperties = { fontSize: 9, lineHeight: LH_TEXT, maxWidth: BP.textW }
const cell: CSSProperties = { fontSize: 9, lineHeight: LH }
const band: CSSProperties = { display: 'flex', backgroundColor: BP.grau, padding: `2.3px ${BP.cellPadX - 0.2}px 2.3px ${BP.cellPadX + 0.1}px`, fontWeight: 700, ...cell }
const colPos: CSSProperties = { width: BP.colPos - BP.cellPadX, flexShrink: 0 }
const colBez: CSSProperties = { flex: 1, minWidth: 0, paddingRight: 6 }
const colMenge: CSSProperties = { width: BP.colMenge, textAlign: 'right', flexShrink: 0 }
const colEP: CSSProperties = { width: BP.colEP, textAlign: 'right', flexShrink: 0 }
const colGP: CSSProperties = { width: BP.colGP, textAlign: 'right', flexShrink: 0 }
const abschnitt: CSSProperties = { fontSize: 12, fontWeight: 700, lineHeight: LH, marginTop: 26, marginBottom: 9 }

function RichText({ content }: { content: string }) {
  return (
    <div>
      {richAbsaetze(content).map((spans, i) => (
        <div key={i} style={text}>
          {spans.length === 0 ? ' ' : spans.map((sp, j) => (
            <span key={j} style={{
              fontWeight: sp.bold ? 700 : 400,
              fontStyle: sp.italic ? 'italic' : 'normal',
              textDecoration: sp.underline ? 'underline' : 'none',
            }}>{sp.text}</span>
          ))}
        </div>
      ))}
    </div>
  )
}

function Summenblock({ zeilen, labelEinzug = true }: { zeilen: SummenZeile[]; labelEinzug?: boolean }) {
  return (
    <div>
      {zeilen.map((z, i) => (
        <div key={i}>
          <div style={{
            display: 'flex', ...cell, padding: `2.4px ${BP.cellPadX - 0.2}px 2.4px ${labelEinzug ? BP.colPos : BP.cellPadX + 0.1}px`,
            backgroundColor: z.grau ? BP.grau : undefined, fontWeight: z.bold ? 700 : 400,
          }}>
            <span style={{ flex: 1 }}>{z.label || ' '}</span>
            <span>{z.value}</span>
          </div>
          {z.bold && !z.grau && (
            <div style={{ marginLeft: 'auto', width: 70, marginRight: BP.cellPadX - 0.2, borderTop: '0.6px solid #000', borderBottom: '0.6px solid #000', height: 1.4 }} />
          )}
        </div>
      ))}
    </div>
  )
}

function Verrechnung({ v }: { v: NonNullable<BriefModell['verrechnung']> }) {
  const w: Array<CSSProperties> = [
    { width: 60 }, { width: 85 }, { width: 50, textAlign: 'right' },
    { width: 95, textAlign: 'right' }, { width: 90, textAlign: 'right' }, { flex: 1, textAlign: 'right' },
  ]
  const row = (cells: ReactNode[], extra: CSSProperties = {}) => (
    <div style={{ display: 'flex', ...cell, padding: `2.4px ${BP.cellPadX - 0.2}px 2.4px ${BP.cellPadX + 0.1}px`, ...extra }}>
      {cells.map((c, i) => <span key={i} style={{ flexShrink: 0, ...w[i] }}>{c}</span>)}
    </div>
  )
  return (
    <div>
      <div style={abschnitt}>Verrechnung der Teilrechnungen</div>
      <div style={band}>
        {['Datum', 'Rechnungs-Nr.', 'Steuersatz', 'Netto', 'USt.', 'Brutto'].map((h, i) => <span key={h} style={{ flexShrink: 0, ...w[i] }}>{h}</span>)}
      </div>
      {v.zeilen.map((z, i) => <div key={i}>{row([z.datum, z.nummer, z.satz, z.netto, z.ust, z.brutto])}</div>)}
      <div style={{ display: 'flex', ...cell, fontWeight: 700, borderTop: '0.5px solid #000', padding: `2.4px ${BP.cellPadX - 0.2}px 2.4px ${BP.cellPadX + 0.1}px` }}>
        <span style={{ width: 195, flexShrink: 0 }}>Summe Teilrechnungen</span>
        <span style={{ flexShrink: 0, ...w[3] }}>{v.summe.netto}</span>
        <span style={{ flexShrink: 0, ...w[4] }}>{v.summe.ust}</span>
        <span style={w[5]}>{v.summe.brutto}</span>
      </div>
    </div>
  )
}

export function DocumentHtmlPreview(input: DocInput) {
  const F = firmaConfig(input.firma)
  const m = briefModell(input, F)
  const logo = F.logoUrl || BRIEFPAPIER_LOGO
  const ohneKunde = !input.doc.kunde

  return (
    <div style={{
      fontFamily: FONT, fontSize: 9, color: BP.text, backgroundColor: 'white',
      width: BP.pageW, minHeight: BP.pageH, margin: '0 auto', boxSizing: 'border-box',
      padding: `${BP.top}px ${BP.right}px 0 ${BP.left}px`, position: 'relative',
      display: 'flex', flexDirection: 'column',
    }}>
      {BP.falzmarken.map(y => (
        <div key={y} style={{ position: 'absolute', left: 0, top: y, width: BP.falzLen, borderTop: '0.5px solid #000' }} />
      ))}

      <img src={logo} alt="Logo" style={{ width: BP.logoW, height: BP.logoH, objectFit: 'contain', alignSelf: 'flex-end', marginRight: BP.logoRightInset, marginBottom: BP.logoGap }} />

      {/* Absender, Empfaenger, Belegdaten */}
      <div style={{ height: BP.adressRowH, position: 'relative', flexShrink: 0 }}>
        <div style={{ fontSize: 6, lineHeight: LH, marginLeft: -3.4, width: 235 }}>{m.absenderzeile}</div>
        <div style={{ ...text, marginLeft: -3.4, marginTop: 22, width: 250 }}>
          {ohneKunde
            ? <span style={{ color: '#bbb', fontStyle: 'italic' }}>Kein Kunde ausgewählt</span>
            : m.empfaenger.map((z, i) => <div key={i}>{z}</div>)}
        </div>
        <div style={{ position: 'absolute', left: BP.infoLeft - BP.left, top: 14.5, width: BP.infoW }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, lineHeight: LH }}>
            <span>{m.nummerLabel}</span><span>{m.nummer}</span>
          </div>
          {m.info.map((gruppe, gi) => (
            <div key={gi} style={{ marginTop: gi === 0 ? 0.5 : 9 }}>
              {gruppe.map(([l, v]) => (
                <div key={l} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 7, lineHeight: 1.5 }}>
                  <span>{l}</span><span>{v}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      <div style={{ fontSize: 12, fontWeight: 700, lineHeight: LH, marginBottom: 20 }}>{m.titel}</div>
      {m.betreff && <div style={{ ...text, fontWeight: 700, marginBottom: 10.8 }}>Betreff: {m.betreff}</div>}
      {m.hinweis && <div style={{ ...text, fontWeight: 700, marginBottom: 10.8 }}>{m.hinweis}</div>}
      {m.kopftext && <RichText content={m.kopftext} />}

      {/* Positionen */}
      <div style={{ marginTop: 10 }}>
        <div style={band}>
          <span style={colPos}>Pos.</span>
          <span style={colBez}>Beschreibung</span>
          <span style={colMenge}>Menge</span>
          {m.mitPreisen && <span style={colEP}>Einzelpreis</span>}
          {m.mitPreisen && <span style={colGP}>Gesamtpreis</span>}
        </div>
        {m.positionen.length === 0 ? (
          <div style={{ ...cell, color: '#bbb', fontStyle: 'italic', textAlign: 'center', padding: '8px 0' }}>Keine Positionen</div>
        ) : m.positionen.map((p, i) => (
          <div key={p.id ?? i} style={{ display: 'flex', ...cell, padding: `2.7px ${BP.cellPadX - 0.2}px ${BP.posAbstand}px ${BP.cellPadX + 0.1}px` }}>
            <span style={colPos}>{i + 1}.</span>
            <div style={colBez}>
              <div style={{ fontWeight: 700 }}>{p.bezeichnung || <span style={{ color: '#bbb', fontWeight: 400 }}>—</span>}</div>
              {p.beschreibung ? <div style={{ lineHeight: 1.6, marginTop: 1.3, whiteSpace: 'pre-wrap' }}>{p.beschreibung}</div> : null}
              {p.bild_url ? <img src={p.bild_url} alt="" style={{ marginTop: 4, maxWidth: 170, maxHeight: 110, objectFit: 'contain', display: 'block' }} /> : null}
            </div>
            <span style={colMenge}>{fmtMenge(p)}</span>
            {m.mitPreisen && <span style={colEP}>{fmtEur(p.einzelpreis_netto)}</span>}
            {m.mitPreisen && <span style={colGP}>{fmtEur(p.zeilenbetrag_netto)}</span>}
          </div>
        ))}
      </div>

      {m.summen && (
        <div style={{ borderTop: '0.5px solid #d4d4d4' }}>
          <Summenblock zeilen={m.summen} />
        </div>
      )}

      {m.verrechnung && <Verrechnung v={m.verrechnung} />}
      {m.schlussrechnung && (
        <div>
          <div style={abschnitt}>Schlussrechnung</div>
          <div style={band}><span style={{ flex: 1 }}>Beschreibung</span><span>Betrag</span></div>
          <Summenblock zeilen={m.schlussrechnung} labelEinzug={false} />
        </div>
      )}

      {m.lieferadresse && (
        <div style={{ marginTop: 20 }}>
          <div style={{ ...text, fontWeight: 700 }}>Lieferadresse</div>
          {m.lieferadresse.map((z, i) => <div key={i} style={text}>{z}</div>)}
        </div>
      )}

      {(m.zahlungsbedingungen || m.fusstext) && (
        <div style={{ marginTop: 26 }}>
          {m.zahlungsbedingungen?.map((z, i) => (
            <div key={i} style={{ ...text, marginBottom: i === m.zahlungsbedingungen!.length - 1 ? 10.8 : 0 }}>{z}</div>
          ))}
          {m.fusstext && <RichText content={m.fusstext} />}
        </div>
      )}
      {m.gruss && (
        <div style={{ marginTop: 10.8 }}>
          {m.gruss.map((z, i) => <div key={i} style={text}>{z}</div>)}
        </div>
      )}

      {m.unterschriften && (
        <div style={{ marginTop: 40, display: 'flex', justifyContent: 'space-between' }}>
          {['Datum, Unterschrift Übergeber', 'Datum, Unterschrift Empfänger'].map(t => (
            <div key={t} style={{ width: 200 }}>
              <div style={{ borderTop: '0.5px solid #000', marginBottom: 3 }} />
              <div style={{ fontSize: 7 }}>{t}</div>
            </div>
          ))}
        </div>
      )}

      {/* Fusszeile — in der Vorschau am Ende des Inhalts, mindestens auf Seitenhoehe */}
      <div style={{ marginTop: 'auto', paddingTop: 30, paddingBottom: 22, marginLeft: BP.footerLeft - BP.left }}>
        <div style={{ display: 'flex' }}>
          {m.footer.map((spalte, i) => (
            <div key={i} style={{ width: BP.footerColW, flexShrink: 0, fontSize: 7, lineHeight: i === 0 ? 1.43 : 1.64, paddingRight: i === 0 ? 8 : 0, boxSizing: 'border-box' }}>
              {spalte.map((z, j) => <div key={j}>{z}</div>)}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
