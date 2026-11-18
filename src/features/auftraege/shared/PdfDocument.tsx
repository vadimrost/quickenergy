import { Document, Page, View, Text, Image, StyleSheet, Font } from '@react-pdf/renderer'
import type { Angebot, Auftragsbestaetigung, Ausgangsrechnung, DokumentPosition, Lieferschein, FirmaStammdaten } from '@/types/database'
import {
  BP, BRIEFPAPIER_LOGO, assetUrl, briefModell, firmaConfig, fmtEur, fmtMenge, richAbsaetze,
  type BriefModell, type SummenZeile,
} from './briefpapier'

// ─── Schrift wie in sevDesk: Open Sans ────────────────────────────────────────
Font.register({
  family: 'OpenSans',
  fonts: [
    { src: assetUrl('/fonts/OpenSans-Regular.ttf') },
    { src: assetUrl('/fonts/OpenSans-Bold.ttf'), fontWeight: 700 },
    { src: assetUrl('/fonts/OpenSans-Italic.ttf'), fontStyle: 'italic' },
    { src: assetUrl('/fonts/OpenSans-BoldItalic.ttf'), fontWeight: 700, fontStyle: 'italic' },
  ],
})
// Keine Silbentrennung — sevDesk trennt auch nicht
Font.registerHyphenationCallback(word => [word])

const LH = 1.36   // Zeilenhoehe einzeiliger Zellen (Open Sans)
const LH_TEXT = 1.2

const s = StyleSheet.create({
  page: {
    fontFamily: 'OpenSans',
    fontSize: 9,
    color: BP.text,
    paddingTop: BP.top,
    paddingBottom: BP.bottom,
    paddingLeft: BP.left,
    paddingRight: BP.right,
  },
  logo: { width: BP.logoW, height: BP.logoH, objectFit: 'contain', alignSelf: 'flex-end', marginRight: BP.logoRightInset, marginBottom: BP.logoGap },
  falz: { position: 'absolute', left: 0, width: BP.falzLen, borderTopWidth: 0.5, borderTopColor: '#000' },

  adressRow: { height: BP.adressRowH, position: 'relative' },
  absender: { fontSize: 6, lineHeight: LH, marginLeft: -3.4, width: 235 },
  empfaenger: { fontSize: 9, lineHeight: LH_TEXT, marginLeft: -3.4, marginTop: 22, width: 250 },
  info: { position: 'absolute', left: BP.infoLeft - BP.left, top: 14.5, width: BP.infoW },
  infoNummer: { flexDirection: 'row', justifyContent: 'space-between', fontSize: 11, lineHeight: LH },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', fontSize: 7, lineHeight: 1.5 },

  titel: { fontSize: 12, fontWeight: 700, lineHeight: LH, marginBottom: 20 },
  text: { fontSize: 9, lineHeight: LH_TEXT, maxWidth: BP.textW },
  absatz: { marginBottom: 0 },

  band: { flexDirection: 'row', backgroundColor: BP.grau, paddingVertical: 2.3, paddingLeft: BP.cellPadX + 0.1, paddingRight: BP.cellPadX - 0.2 },
  bandText: { fontSize: 9, fontWeight: 700, lineHeight: LH },
  posRow: { flexDirection: 'row', paddingTop: 2.7, paddingBottom: BP.posAbstand, paddingLeft: BP.cellPadX + 0.1, paddingRight: BP.cellPadX - 0.2 },
  cell: { fontSize: 9, lineHeight: LH },
  beschreibung: { fontSize: 9, lineHeight: 1.6, marginTop: 1.3 },
  colPos: { width: BP.colPos - BP.cellPadX },
  colBez: { flex: 1, paddingRight: 6 },
  colMenge: { width: BP.colMenge, textAlign: 'right' },
  colEP: { width: BP.colEP, textAlign: 'right' },
  colGP: { width: BP.colGP, textAlign: 'right' },
  bild: { marginTop: 4, maxWidth: 170, maxHeight: 110, objectFit: 'contain' },

  sumRow: { flexDirection: 'row', paddingVertical: 2.4, paddingLeft: BP.colPos, paddingRight: BP.cellPadX - 0.2 },
  sumLabel: { flex: 1, fontSize: 9, lineHeight: LH },
  sumValue: { fontSize: 9, lineHeight: LH, textAlign: 'right' },

  abschnitt: { fontSize: 12, fontWeight: 700, lineHeight: LH, marginTop: 26, marginBottom: 9 },

  footer: { position: 'absolute', top: BP.footerTop, left: BP.footerLeft, flexDirection: 'row' },
  footerCol: { width: BP.footerColW, fontSize: 7, lineHeight: 1.64 },
  seite: { position: 'absolute', top: BP.pageNoTop, right: BP.pageNoRight, fontSize: 7 },
})

// ─── Bausteine ────────────────────────────────────────────────────────────────

function RichText({ content }: { content: string }) {
  return (
    <View>
      {richAbsaetze(content).map((spans, i) =>
        spans.length === 0
          ? <Text key={i} style={s.text}>{' '}</Text>
          : (
            <Text key={i} style={s.text}>
              {spans.map((sp, j) => (
                <Text key={j} style={{
                  fontWeight: sp.bold ? 700 : 400,
                  fontStyle: sp.italic ? 'italic' : 'normal',
                  textDecoration: sp.underline ? 'underline' : 'none',
                }}>{sp.text}</Text>
              ))}
            </Text>
          ))}
    </View>
  )
}

function Adressblock({ m }: { m: BriefModell }) {
  return (
    <View style={s.adressRow}>
      <Text style={s.absender}>{m.absenderzeile}</Text>
      <View style={s.empfaenger}>
        {m.empfaenger.map((z, i) => <Text key={i}>{z}</Text>)}
      </View>
      <View style={s.info}>
        <View style={s.infoNummer}>
          <Text>{m.nummerLabel}</Text>
          <Text>{m.nummer}</Text>
        </View>
        {m.info.map((gruppe, gi) => (
          <View key={gi} style={{ marginTop: gi === 0 ? 0.5 : 9 }}>
            {gruppe.map(([l, v]) => (
              <View key={l} style={s.infoRow}>
                <Text>{l}</Text>
                <Text>{v}</Text>
              </View>
            ))}
          </View>
        ))}
      </View>
    </View>
  )
}

function Positionen({ m }: { m: BriefModell }) {
  return (
    <View style={{ marginTop: 10 }}>
      {/* fixed: Tabellenkopf wiederholt sich auf jeder Seite, über die die Tabelle läuft */}
      <View style={s.band} fixed>
        <Text style={[s.bandText, s.colPos]}>Pos.</Text>
        <Text style={[s.bandText, s.colBez]}>Beschreibung</Text>
        <Text style={[s.bandText, s.colMenge]}>Menge</Text>
        {m.mitPreisen && <Text style={[s.bandText, s.colEP]}>Einzelpreis</Text>}
        {m.mitPreisen && <Text style={[s.bandText, s.colGP]}>Gesamtpreis</Text>}
      </View>
      {m.positionen.map((p, i) => <PositionZeile key={p.id ?? i} p={p} nr={i + 1} mitPreisen={m.mitPreisen} />)}
      {m.summen && (
        <View style={{ borderTopWidth: 0.5, borderTopColor: '#d4d4d4' }}>
          <Summenblock zeilen={m.summen} />
        </View>
      )}
    </View>
  )
}

function PositionZeile({ p, nr, mitPreisen }: { p: DokumentPosition; nr: number; mitPreisen: boolean }) {
  return (
    <View style={s.posRow} wrap={false}>
      <Text style={[s.cell, s.colPos]}>{nr}.</Text>
      <View style={s.colBez}>
        <Text style={[s.cell, { fontWeight: 700 }]}>{p.bezeichnung}</Text>
        {p.beschreibung ? <Text style={s.beschreibung}>{p.beschreibung}</Text> : null}
        {p.bild_url ? <Image src={p.bild_url} style={s.bild} /> : null}
      </View>
      <Text style={[s.cell, s.colMenge]}>{fmtMenge(p)}</Text>
      {mitPreisen && <Text style={[s.cell, s.colEP]}>{fmtEur(p.einzelpreis_netto)}</Text>}
      {mitPreisen && <Text style={[s.cell, s.colGP]}>{fmtEur(p.zeilenbetrag_netto)}</Text>}
    </View>
  )
}

function Summenblock({ zeilen, labelEinzug = true }: { zeilen: SummenZeile[]; labelEinzug?: boolean }) {
  return (
    <View wrap={false}>
      {zeilen.map((z, i) => {
        const doppelt = z.bold && !z.grau
        return (
          <View key={i}>
            <View style={[s.sumRow, z.grau ? { backgroundColor: BP.grau } : {}, labelEinzug ? {} : { paddingLeft: BP.cellPadX + 0.1 }]}>
              <Text style={[s.sumLabel, z.bold ? { fontWeight: 700 } : {}]}>{z.label || ' '}</Text>
              <Text style={[s.sumValue, z.bold ? { fontWeight: 700 } : {}]}>{z.value}</Text>
            </View>
            {/* Restforderung: doppelt unterstrichen wie in sevDesk */}
            {doppelt && (
              <View style={{ alignSelf: 'flex-end', width: 70, marginRight: BP.cellPadX - 0.2 }}>
                <View style={{ borderTopWidth: 0.6, borderTopColor: '#000' }} />
                <View style={{ borderTopWidth: 0.6, borderTopColor: '#000', marginTop: 1.4 }} />
              </View>
            )}
          </View>
        )
      })}
    </View>
  )
}

function Verrechnung({ v }: { v: NonNullable<BriefModell['verrechnung']> }) {
  const cols = [
    { w: 60, align: 'left' as const },
    { w: 85, align: 'left' as const },
    { w: 50, align: 'right' as const },
    { w: 95, align: 'right' as const },
    { w: 90, align: 'right' as const },
    { flex: 1, align: 'right' as const },
  ]
  const cell = (i: number, text: string, bold = false) => (
    <Text key={i} style={[s.cell, { textAlign: cols[i].align, fontWeight: bold ? 700 : 400 }, cols[i].w ? { width: cols[i].w } : { flex: 1 }]}>{text}</Text>
  )
  return (
    <View wrap={false}>
      <Text style={s.abschnitt}>Verrechnung der Teilrechnungen</Text>
      <View style={s.band}>
        {['Datum', 'Rechnungs-Nr.', 'Steuersatz', 'Netto', 'USt.', 'Brutto'].map((h, i) => (
          <Text key={h} style={[s.bandText, { textAlign: cols[i].align }, cols[i].w ? { width: cols[i].w } : { flex: 1 }]}>{h}</Text>
        ))}
      </View>
      {v.zeilen.map((z, i) => (
        <View key={i} style={[s.sumRow, { paddingLeft: BP.cellPadX + 0.1 }]}>
          {[z.datum, z.nummer, z.satz, z.netto, z.ust, z.brutto].map((t, ci) => cell(ci, t))}
        </View>
      ))}
      <View style={[s.sumRow, { paddingLeft: BP.cellPadX + 0.1, borderTopWidth: 0.5, borderTopColor: '#000' }]}>
        <Text style={[s.cell, { width: 195, fontWeight: 700 }]}>Summe Teilrechnungen</Text>
        {cell(3, v.summe.netto, true)}
        {cell(4, v.summe.ust, true)}
        {cell(5, v.summe.brutto, true)}
      </View>
    </View>
  )
}

function Unterschriften() {
  return (
    <View style={{ marginTop: 40, flexDirection: 'row', justifyContent: 'space-between' }} wrap={false}>
      {['Datum, Unterschrift Übergeber', 'Datum, Unterschrift Empfänger'].map(t => (
        <View key={t} style={{ width: 200 }}>
          <View style={{ borderTopWidth: 0.5, borderTopColor: '#000', marginBottom: 3 }} />
          <Text style={{ fontSize: 7 }}>{t}</Text>
        </View>
      ))}
    </View>
  )
}

// ─── Haupt-Export ─────────────────────────────────────────────────────────────

type DokumentInput =
  | { typ: 'angebot'; doc: Angebot }
  | { typ: 'auftragsbestaetigung'; doc: Auftragsbestaetigung }
  | { typ: 'rechnung'; doc: Ausgangsrechnung }
  | { typ: 'lieferschein'; doc: Lieferschein }

export function QuickEnergyPdf(input: DokumentInput & { firma?: FirmaStammdaten | null }) {
  const F = firmaConfig(input.firma)
  const m = briefModell(input, F)
  const logo = F.logoUrl || assetUrl(BRIEFPAPIER_LOGO)

  return (
    <Document title={m.titel} author={F.name} creator="QuickEnergy Dashboard">
      <Page size="A4" style={s.page}>
        {BP.falzmarken.map(y => <View key={y} style={[s.falz, { top: y }]} fixed />)}
        <Image src={logo} style={s.logo} fixed />

        <Adressblock m={m} />

        <Text style={s.titel}>{m.titel}</Text>
        {m.betreff && <Text style={[s.text, { fontWeight: 700, marginBottom: 10.8 }]}>Betreff: {m.betreff}</Text>}
        {m.hinweis && <Text style={[s.text, { fontWeight: 700, marginBottom: 10.8 }]}>{m.hinweis}</Text>}
        {m.kopftext && <RichText content={m.kopftext} />}

        <Positionen m={m} />

        {m.verrechnung && <Verrechnung v={m.verrechnung} />}
        {m.schlussrechnung && (
          <View wrap={false}>
            <Text style={s.abschnitt}>Schlussrechnung</Text>
            <View style={s.band}>
              <Text style={[s.bandText, { flex: 1 }]}>Beschreibung</Text>
              <Text style={s.bandText}>Betrag</Text>
            </View>
            <Summenblock zeilen={m.schlussrechnung} labelEinzug={false} />
          </View>
        )}

        {m.lieferadresse && (
          <View style={{ marginTop: 20 }} wrap={false}>
            <Text style={[s.text, { fontWeight: 700 }]}>Lieferadresse</Text>
            {m.lieferadresse.map((z, i) => <Text key={i} style={s.text}>{z}</Text>)}
          </View>
        )}

        {(m.zahlungsbedingungen || m.fusstext) && (
          <View style={{ marginTop: 26 }}>
            {m.zahlungsbedingungen?.map((z, i) => (
              <Text key={i} style={[s.text, { marginBottom: i === m.zahlungsbedingungen!.length - 1 ? 10.8 : 0 }]}>{z}</Text>
            ))}
            {m.fusstext && <RichText content={m.fusstext} />}
          </View>
        )}
        {m.gruss && (
          <View style={{ marginTop: 10.8 }} wrap={false}>
            {m.gruss.map((z, i) => <Text key={i} style={s.text}>{z}</Text>)}
          </View>
        )}

        {m.unterschriften && <Unterschriften />}

        <Text style={s.seite} fixed render={({ pageNumber, totalPages }) => `${pageNumber}/${totalPages}`} />
        <View style={s.footer} fixed>
          {m.footer.map((spalte, i) => (
            <View key={i} style={[s.footerCol, i === 0 ? { lineHeight: 1.43, paddingRight: 8 } : {}]}>
              {spalte.map((z, j) => <Text key={j}>{z}</Text>)}
            </View>
          ))}
        </View>
      </Page>
    </Document>
  )
}
