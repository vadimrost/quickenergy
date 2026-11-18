// Briefpapier im sevDesk-Layout — gemeinsame Inhaltsbeschreibung fuer das echte PDF
// (PdfDocument, react-pdf) und die HTML-Live-Vorschau (DocumentHtmlPreview).
// Beide rendern nur noch dieses Modell, damit sie nicht auseinanderlaufen.
//
// Masse (pt, A4 = 595,3 × 841,9) sind von einer echten sevDesk-Rechnung abgemessen.

import type { Angebot, Auftragsbestaetigung, Ausgangsrechnung, DokumentPosition, FirmaStammdaten, Kunde, Lieferschein } from '@/types/database'
import { rabattAnzeige, summiereUebersicht } from './positionenUtils'

export const BP = {
  pageW: 595.3,
  pageH: 841.9,
  left: 62.9,
  right: 54.3,
  top: 44,
  bottom: 105,
  logoW: 200,
  logoH: 49.5,
  logoRightInset: 11,
  logoGap: 42,
  adressRowH: 127,
  infoLeft: 362.8,
  infoW: 183,
  footerTop: 762,
  footerLeft: 56.7,
  footerColW: 121.9,
  pageNoTop: 749.5,
  pageNoRight: 42.5,
  // Falzmarken links am Rand
  falzmarken: [302.6, 426, 600.2],
  falzLen: 10,
  grau: '#ebebeb',
  text: '#000000',
  // Spaltenbreiten der Positionstabelle
  colPos: 31,
  colMenge: 70,
  colEP: 76.5,
  colGP: 79.4,
  cellPadX: 2.5,
  // Fliesstext ist in sevDesk schmaler als die Tabelle
  textW: 465,
  posAbstand: 6.5,
} as const

export const BRIEFPAPIER_LOGO = '/briefpapier/quickenergy-logo.png'

export function assetUrl(path: string): string {
  return typeof window !== 'undefined' ? new URL(path, window.location.origin).href : path
}

// ─── Firma ────────────────────────────────────────────────────────────────────

export const FIRMA_DEFAULT = {
  name: 'Quick Energy Handels-, Klima- und Elektrotechnik GmbH',
  strasse: 'Sieveringerstraße 56A',
  plzOrt: '1190 Wien',
  land: 'Österreich',
  tel: '+43 6644614126',
  email: 'sales@quickenergy.at',
  web: 'www.quickenergy.at',
  uid: 'ATU78058389',
  fn: '579111I',
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
export type FirmaConfig = typeof FIRMA_DEFAULT

export function firmaConfig(f: FirmaStammdaten | null | undefined): FirmaConfig {
  if (!f) return FIRMA_DEFAULT
  return {
    name: f.name, strasse: f.strasse, plzOrt: f.plz_ort, land: f.land || 'Österreich',
    tel: f.tel, email: f.email, web: f.web, uid: f.uid,
    fn: f.fn_nr, steuerNr: f.steuer_nr, gericht: f.gericht, gf: f.gf,
    bank: f.bank, iban: f.iban, bic: f.bic, konto: f.konto, blz: f.blz,
    logoUrl: f.logo_url ?? null,
  }
}

// ─── Formatierung ─────────────────────────────────────────────────────────────

const zahl = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function fmtEur(n: number): string {
  return `${zahl.format(Math.abs(n) < 0.005 ? 0 : n)} EUR`
}

export function fmtDate(d: string | null | undefined): string {
  if (!d) return '—'
  const [y, m, day] = d.slice(0, 10).split('-')
  return `${day}.${m}.${y}`
}

export function fmtMenge(p: Pick<DokumentPosition, 'menge' | 'einheit'>): string {
  // sevDesk schreibt bei Pauschalen nur "pauschal", ohne Menge
  if (p.einheit === 'pausch' && p.menge === 1) return 'pauschal'
  return `${zahl.format(p.menge)} ${p.einheit === 'pausch' ? 'pauschal' : p.einheit}`
}

export function kundenName(k: Kunde | null | undefined): string {
  if (!k) return ''
  return k.firmenname || `${k.vorname ?? ''} ${k.nachname ?? ''}`.trim()
}

// ─── Dokument → Modell ────────────────────────────────────────────────────────

export type BriefInput =
  | { typ: 'angebot'; doc: Angebot }
  | { typ: 'auftragsbestaetigung'; doc: Auftragsbestaetigung }
  | { typ: 'rechnung'; doc: Ausgangsrechnung }
  | { typ: 'lieferschein'; doc: Lieferschein }

export interface SummenZeile { label: string; value: string; bold?: boolean; grau?: boolean }

export interface BriefModell {
  absenderzeile: string
  empfaenger: string[]
  nummerLabel: string
  nummer: string
  /** Gruppen von Info-Zeilen rechts oben, mit Abstand dazwischen */
  info: Array<Array<[string, string]>>
  titel: string
  betreff: string | null
  hinweis: string | null
  kopftext: string | null
  fusstext: string | null
  positionen: DokumentPosition[]
  mitPreisen: boolean
  /** Gutschrift: negativ gespeichert, auf dem Beleg positiv */
  vorzeichen: 1 | -1
  summen: SummenZeile[] | null
  verrechnung: {
    zeilen: Array<{ datum: string; nummer: string; satz: string; netto: string; ust: string; brutto: string }>
    summe: { netto: string; ust: string; brutto: string }
  } | null
  schlussrechnung: SummenZeile[] | null
  zahlungsbedingungen: string[] | null
  gruss: string[] | null
  lieferadresse: string[] | null
  unterschriften: boolean
  footer: string[][]
}

function typName(input: BriefInput): string {
  if (input.typ === 'lieferschein') return 'Lieferschein'
  if (input.typ === 'angebot') return 'Angebot'
  if (input.typ === 'auftragsbestaetigung') return 'Auftragsbestätigung'
  const r = input.doc
  if (r.typ === 'teilrechnung') return r.teilrechnungs_prozent ? `${r.teilrechnungs_prozent}% Teilrechnung` : 'Teilrechnung'
  if (r.typ === 'schlussrechnung') return (r.rechnungsuebersicht?.length ?? 0) > 0 ? 'Schlussrechnung' : 'Rechnung'
  if (r.typ === 'stornorechnung') return 'Stornorechnung'
  if (r.typ === 'gutschrift') return 'Gutschrift'
  return 'Rechnung'
}

function nummerVon(input: BriefInput): string {
  if (input.typ === 'lieferschein') return input.doc.lieferschein_nr
  if (input.typ === 'angebot') return input.doc.angebotsnummer
  if (input.typ === 'auftragsbestaetigung') return input.doc.ab_nummer
  return input.doc.rechnungsnummer
}

function nummerLabel(input: BriefInput): string {
  if (input.typ === 'lieferschein') return 'Lieferschein-Nr.'
  if (input.typ === 'angebot') return 'Angebots-Nr.'
  if (input.typ === 'auftragsbestaetigung') return 'Auftrags-Nr.'
  return input.doc.typ === 'gutschrift' ? 'Gutschrift-Nr.' : 'Rechnungs-Nr.'
}

function datumsZeilen(input: BriefInput): Array<[string, string]> {
  if (input.typ === 'lieferschein') return [['Lieferdatum', fmtDate(input.doc.lieferdatum)]]
  if (input.typ === 'angebot') {
    const a = input.doc
    const z: Array<[string, string]> = [['Angebotsdatum', fmtDate(a.angebotsdatum)]]
    if (a.gueltig_bis) z.push(['Gültig bis', fmtDate(a.gueltig_bis)])
    if (a.referenz_bestellnr) z.push(['Referenz', a.referenz_bestellnr])
    return z
  }
  if (input.typ === 'auftragsbestaetigung') {
    const ab = input.doc
    const z: Array<[string, string]> = [['Datum', fmtDate(ab.ab_datum)]]
    if (ab.lieferdatum) z.push(['Lieferdatum', fmtDate(ab.lieferdatum)])
    return z
  }
  const r = input.doc
  const z: Array<[string, string]> = [[r.typ === 'gutschrift' ? 'Datum' : 'Rechnungsdatum', fmtDate(r.rechnungsdatum)]]
  if (r.leistungsdatum) z.push(['Lieferdatum', fmtDate(r.leistungsdatum)])
  else if (r.leistungszeitraum_von) z.push(['Leistungszeitraum', `${fmtDate(r.leistungszeitraum_von)} – ${fmtDate(r.leistungszeitraum_bis)}`])
  return z
}

function anschrift(k: Kunde | null | undefined): string[] {
  if (!k) return []
  const z: string[] = []
  const name = kundenName(k)
  if (name) z.push(name)
  if (k.firmenname && (k.vorname || k.nachname)) z.push(`${k.vorname ?? ''} ${k.nachname ?? ''}`.trim())
  if (k.adresse) z.push(...k.adresse.split('\n').filter(Boolean))
  if (k.plz || k.ort) z.push(`${k.plz ?? ''} ${k.ort ?? ''}`.trim())
  z.push(k.land || 'Österreich')
  return z
}

function satzLabel(n20: number, n10: number, n0: number): string {
  const s = [n20 !== 0 && '20%', n10 !== 0 && '10%', n0 !== 0 && '0%'].filter(Boolean)
  return s.length ? s.join(' / ') : '0%'
}

export function briefModell(input: BriefInput, firma: FirmaConfig): BriefModell {
  const { doc } = input
  const r = input.typ === 'rechnung' ? input.doc : null
  const nummer = nummerVon(input)
  const name = typName(input)
  const vorzeichen: 1 | -1 = r?.typ === 'gutschrift' ? -1 : 1

  // Titel wie in sevDesk: "Rechnung Nr. RE-…". Enthaelt der Betreff schon die
  // Belegnummer (sevDesk-Importe: "Schlussrechnung Nr. RE-… aus Angebot …"), ist er der Titel.
  const betreffRaw = doc.betreff?.trim() || null
  const betreffIstTitel = !!betreffRaw && !!nummer && betreffRaw.includes(nummer)
  const titel = betreffIstTitel
    ? betreffRaw!
    : r?.typ === 'gutschrift' ? `Gutschrift-Nr. ${nummer}` : `${name} Nr. ${nummer}`
  const betreff = betreffIstTitel ? null : betreffRaw

  // Storno: Bezug zur Originalrechnung (§11 UStG), sofern nicht schon im Titel/Betreff
  const stornoRef = r?.storno_zu_rechnung
  const stornoNr = Array.isArray(stornoRef) ? stornoRef[0]?.rechnungsnummer : stornoRef?.rechnungsnummer
  const hinweis = r?.typ === 'stornorechnung' && stornoNr && !`${titel} ${betreff ?? ''}`.includes(stornoNr)
    ? `Stornorechnung zur Rechnung Nr. ${stornoNr}`
    : null

  const kunde = doc.kunde ?? null
  const kundenInfo: Array<[string, string]> = []
  if (kunde?.kundennummer) kundenInfo.push(['Ihre Kundennummer', kunde.kundennummer])
  // Ab 10.000 € brutto Pflicht (§11 UStG), schadet sonst nicht
  if (kunde?.uid_nr) kundenInfo.push(['Ihre UID-Nr.', kunde.uid_nr])
  if (kunde) kundenInfo.push(['Ihr Ansprechpartner', r?.ansprechpartner?.trim() || firma.gf])


  const mitPreisen = input.typ !== 'lieferschein'
  let summen: SummenZeile[] | null = null
  let verrechnung: BriefModell['verrechnung'] = null
  let schlussrechnung: SummenZeile[] | null = null

  if (mitPreisen) {
    const a = doc as Angebot
    const schluss = r?.typ === 'schlussrechnung' && (r.rechnungsuebersicht?.length ?? 0) > 0 ? r.rechnungsuebersicht! : null
    const bereits = schluss ? summiereUebersicht(schluss) : null
    // Schlussrechnung: gespeichert ist der Rest, Gesamtauftrag = Rest + Teilrechnungen
    const v = vorzeichen
    const n20 = v * a.summe_netto_20 + (bereits?.netto_20 ?? 0)
    const n10 = v * a.summe_netto_10 + (bereits?.netto_10 ?? 0)
    const n0 = v * a.summe_netto_0 + (bereits?.netto_0 ?? 0)
    const u20 = v * a.ust_20 + (bereits?.ust_20 ?? 0)
    const u10 = v * a.ust_10 + (bereits?.ust_10 ?? 0)
    const brutto = v * a.summe_brutto + (bereits?.brutto ?? 0)
    const netto = n20 + n10 + n0

    const zeilen: Array<Omit<SummenZeile, 'grau'>> = []
    const rabatt = rabattAnzeige(netto, a.rabatt_gesamt_prozent, a.rabatt_gesamt_betrag ?? 0)
    if (rabatt) {
      zeilen.push({ label: 'Zwischensumme netto', value: fmtEur(rabatt.nettoVorRabatt) })
      zeilen.push({ label: rabatt.label, value: `– ${fmtEur(rabatt.betrag)}` })
    }
    zeilen.push({ label: 'Gesamtbetrag netto', value: fmtEur(netto) })
    if (n20 !== 0) zeilen.push({ label: 'zzgl. Umsatzsteuer 20%', value: fmtEur(u20) })
    if (n10 !== 0) zeilen.push({ label: 'zzgl. Umsatzsteuer 10%', value: fmtEur(u10) })
    if (n0 !== 0 || (n20 === 0 && n10 === 0)) zeilen.push({ label: 'zzgl. Umsatzsteuer 0%', value: fmtEur(0) })
    summen = [
      ...zeilen.map((z, i) => ({ ...z, grau: i % 2 === 0 })),
      { label: 'Gesamtbetrag brutto', value: fmtEur(brutto), bold: true, grau: true },
    ]

    if (schluss && bereits) {
      verrechnung = {
        zeilen: schluss.map(z => {
          const s = summiereUebersicht([z])
          return {
            datum: fmtDate(z.datum),
            nummer: z.rechnungsnummer,
            satz: satzLabel(s.netto_20, s.netto_10, s.netto_0),
            netto: fmtEur(s.netto), ust: fmtEur(s.ust), brutto: fmtEur(s.brutto),
          }
        }),
        summe: { netto: fmtEur(bereits.netto), ust: fmtEur(bereits.ust), brutto: fmtEur(bereits.brutto) },
      }
      const restNetto = a.summe_netto_20 + a.summe_netto_10 + a.summe_netto_0
      const rest: SummenZeile[] = [{ label: 'Gesamtbetrag netto', value: fmtEur(restNetto) }]
      if (a.summe_netto_20 !== 0) rest.push({ label: 'zzgl. Umsatzsteuer 20 %', value: fmtEur(a.ust_20) })
      if (a.summe_netto_10 !== 0) rest.push({ label: 'zzgl. Umsatzsteuer 10 %', value: fmtEur(a.ust_10) })
      schlussrechnung = [
        { label: 'Summe Schlussrechnung brutto', value: fmtEur(brutto), grau: true },
        { label: 'Summe Teilrechnungen brutto', value: fmtEur(bereits.brutto) },
        { label: '', value: '' },
        ...rest.map((z, i) => ({ ...z, grau: i % 2 === 1 })),
        { label: 'Verbleibende Restforderung brutto', value: fmtEur(a.summe_brutto), bold: true },
      ]
    }
  }

  // Zahlungsbedingungen: nur bei Forderungen an den Kunden
  let zahlungsbedingungen: string[] | null = null
  const zahlungsziel = r?.zahlungsziel_tage ?? (input.typ === 'auftragsbestaetigung' ? input.doc.zahlungsziel_tage : null)
  if ((r && r.typ !== 'gutschrift' && r.typ !== 'stornorechnung') || input.typ === 'auftragsbestaetigung') {
    const tage = zahlungsziel ?? 14
    zahlungsbedingungen = [
      tage > 0
        ? `Zahlungsbedingungen: Zahlung innerhalb von ${tage} Tagen ab Rechnungseingang ohne Abzüge.`
        : 'Zahlungsbedingungen: Zahlbar sofort ohne Abzüge.',
    ]
    if (r?.faelligkeitsdatum && tage > 0) zahlungsbedingungen.push(`Der Rechnungsbetrag ist bis zum ${fmtDate(r.faelligkeitsdatum)} fällig.`)
  }

  // Grussformel wie in sevDesk — ausser sie steht schon im Text
  const ansprechpartner = r?.ansprechpartner?.trim() || firma.gf
  const hatGruss = /gr(ü|ue)(ß|ss)/i.test(`${doc.kopftext ?? ''} ${doc.fusstext ?? ''}`)
  const mitGruss = input.typ === 'angebot' || input.typ === 'auftragsbestaetigung'
    || (!!r && r.typ !== 'gutschrift' && r.typ !== 'stornorechnung')
  const gruss = mitGruss && !hatGruss ? ['Mit freundlichen Grüßen', ansprechpartner] : null

  const ls = input.typ === 'lieferschein' ? input.doc : null

  return {
    absenderzeile: `${firma.name}  -  ${firma.strasse}  -  ${firma.plzOrt}`,
    empfaenger: anschrift(kunde),
    nummerLabel: nummerLabel(input),
    nummer,
    info: [datumsZeilen(input), kundenInfo].filter(g => g.length > 0),
    titel,
    betreff,
    hinweis,
    kopftext: doc.kopftext ?? null,
    fusstext: doc.fusstext ?? null,
    positionen: (doc.positionen ?? []) as DokumentPosition[],
    mitPreisen,
    vorzeichen,
    summen,
    verrechnung,
    schlussrechnung,
    zahlungsbedingungen,
    gruss,
    lieferadresse: ls?.lieferadresse ? ls.lieferadresse.split('\n') : null,
    unterschriften: !!ls,
    footer: [
      [firma.name, firma.strasse, firma.plzOrt, firma.land],
      [`Tel. ${firma.tel}`, `E-Mail ${firma.email}`, `Web ${firma.web}`],
      [`Amtsgericht ${firma.gericht}`, `FN-Nr. ${firma.fn}`, `USt.-ID ${firma.uid}`, `Steuer-Nr. ${firma.steuerNr}`, `Geschäftsführung ${firma.gf}`],
      [`Bank ${firma.bank}`, `Konto ${firma.konto}`, `BLZ ${firma.blz}`, `IBAN ${firma.iban}`],
    ],
  }
}

// ─── Rich-Text (TipTap-JSON oder Klartext) ────────────────────────────────────

export type RichSpan = { text: string; bold: boolean; italic: boolean; underline: boolean }

/** Absaetze mit formatierten Textstuecken; leerer Absatz = Leerzeile */
export function richAbsaetze(content: string): RichSpan[][] {
  type Node = { type: string; text?: string; marks?: { type: string }[]; content?: Node[] }
  try {
    const json = JSON.parse(content) as Node
    if (json?.type === 'doc' && Array.isArray(json.content)) {
      return json.content.map(p => (p.content ?? []).map(n => {
        const m = (n.marks ?? []).map(x => x.type)
        return { text: n.text ?? '', bold: m.includes('bold'), italic: m.includes('italic'), underline: m.includes('underline') }
      }))
    }
  } catch { /* Klartext */ }
  return content.split('\n').map(line => line ? [{ text: line, bold: false, italic: false, underline: false }] : [])
}
