export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type RechnungStatus = 'eingegangen' | 'geprüft' | 'gebucht' | 'bezahlt'
export type ExportZiel = 'lexoffice'
export type Rechnungstyp = string

export interface Kategorie {
  id: string
  wert: string
  name: string
  beschreibung: string
  aktiv: boolean
  reihenfolge: number
  created_at: string
}
export type RechnungFlag = 'green' | 'yellow'

export interface OcrField {
  value: string | number
  bbox: [number, number, number, number] // x, y, w, h — normalized 0–1 relative to page
  confidence: number
}

export interface OcrJson {
  rechnungsnr?: OcrField
  betrag?: OcrField
  ust_satz?: OcrField
  faelligkeit?: OcrField
  skonto_datum?: OcrField
  skonto_prozent?: OcrField
  lieferant_name?: OcrField
  iban?: OcrField
}

export interface Mitarbeiter {
  id: string
  name: string
  email: string | null
  aktiv: boolean
  created_at: string
}

export interface Lieferant {
  id: string
  name: string
  ustid: string | null
  iban: string | null
  auto_kostengruppe: string | null
  anzahl_rechnungen: number
  created_at?: string
}

export interface Rechnung {
  id: string
  pdf_url: string | null
  ocr_json: OcrJson | null
  lieferant_id: string | null
  rechnungsnr: string
  betrag: number
  ust_satz: number
  faelligkeit: string | null
  skonto_datum: string | null
  skonto_prozent: number | null
  status: RechnungStatus
  mitarbeiter: string | null
  karte: string | null
  rechnungsdatum: string | null
  rechnungstyp: Rechnungstyp | null
  betrag_10: number | null
  betrag_20: number | null
  betrag_0: number | null
  mwst_10: number | null
  mwst_20: number | null
  flag: RechnungFlag | null
  bank_transaktion_id: string | null
  bezahlt_am: string | null
  bezahlt_konto: string | null
  created_at: string
  lieferant?: Lieferant | null
}

export interface Duplikat {
  id: string
  rechnung_a_id: string
  rechnung_b_id: string
  match_score: number
  created_at?: string
}

export interface ExportLog {
  id: string
  rechnung_ids_json: string[]
  ziel: ExportZiel
  exported_at: string
  success: boolean
}

export interface LohnDienstnehmer {
  id: string
  abrechnung_id: string
  ma_nr: number | null
  name: string
  iban: string | null
  betrag: number
  zahlungsart: string
  bank_transaktion_id: string | null
  created_at: string
}

export interface BankTransaktion {
  id: string
  auszug_id: string
  datum: string
  betrag: number
  buchungstext: string
  empfaenger: string | null
  referenz: string | null
  typ: string
  status: string  // 'offen' | 'zugewiesen'
  rechnung_id: string | null
  lohn_id: string | null
  match_score: number | null
  created_at: string
  // embedded via PostgREST joins (populated when queried with select)
  rechnungen?: Array<{ id: string; rechnungsnr: string; lieferant: { name: string } | null }>
  lohn_dienstnehmer?: Array<{ id: string; name: string }>
}

export interface Kontoauszug {
  id: string
  pdf_url: string | null
  konto_iban: string | null
  konto_name: string | null
  auszug_nr: string | null
  von_datum: string | null
  bis_datum: string | null
  alter_kontostand: number | null
  neuer_kontostand: number | null
  created_at: string
  bank_transaktionen?: BankTransaktion[]
}

export interface LohnKoerperschaft {
  id: string
  abrechnung_id: string
  bezeichnung: string
  swift_bic: string | null
  iban: string | null
  betrag: number
  typ: string | null
  created_at: string
}

export interface Lohnabrechnung {
  id: string
  monat: number
  jahr: number
  gesamt_dienstnehmer: number
  gesamt_koerperschaften: number
  gesamt_total: number
  pdf_url: string | null
  created_at: string
  lohn_dienstnehmer?: LohnDienstnehmer[]
  lohn_koerperschaften?: LohnKoerperschaft[]
}

// ─── Ausgehende Dokumente ────────────────────────────────────────────────────

export interface Kunde {
  id: string
  kundennummer: string
  firmenname: string | null
  anrede: string | null
  vorname: string | null
  nachname: string | null
  adresse: string | null
  plz: string | null
  ort: string | null
  land: string
  uid_nr: string | null
  email: string | null
  telefon: string | null
  notiz: string | null
  created_at: string
}

export type DokumentTyp = 'angebot' | 'auftragsbestaetigung' | 'rechnung'

export interface DokumentPosition {
  id: string
  dokument_typ: DokumentTyp
  dokument_id: string
  reihenfolge: number
  bezeichnung: string
  beschreibung: string | null
  menge: number
  einheit: string
  einzelpreis_netto: number
  ust_satz: 0 | 10 | 20
  rabatt_prozent: number
  zeilenbetrag_netto: number
  created_at: string
}

export type AngebotStatus = 'entwurf' | 'offen' | 'berechnet' | 'teilberechnet' | 'abgelehnt'

export interface Angebot {
  id: string
  angebotsnummer: string
  status: AngebotStatus
  kunde_id: string | null
  betreff: string | null
  angebotsdatum: string
  gueltig_bis: string | null
  referenz_bestellnr: string | null
  kopftext: string | null
  fusstext: string | null
  rabatt_gesamt_prozent: number
  summe_netto_20: number
  summe_netto_10: number
  summe_netto_0: number
  ust_20: number
  ust_10: number
  summe_brutto: number
  auftragsbestaetigung_id: string | null
  created_at: string
  kunde?: Kunde | null
  positionen?: DokumentPosition[]
}

export type AuftragsbestaetigungStatus = 'entwurf' | 'erhalten' | 'teilberechnet' | 'berechnet' | 'abgelehnt' | 'archiv'

export interface Auftragsbestaetigung {
  id: string
  ab_nummer: string
  status: AuftragsbestaetigungStatus
  kunde_id: string | null
  angebot_id: string | null
  betreff: string | null
  ab_datum: string
  lieferdatum: string | null
  zahlungsziel_tage: number
  kopftext: string | null
  fusstext: string | null
  rabatt_gesamt_prozent: number
  summe_netto_20: number
  summe_netto_10: number
  summe_netto_0: number
  ust_20: number
  ust_10: number
  summe_brutto: number
  created_at: string
  kunde?: Kunde | null
  positionen?: DokumentPosition[]
}

export type AusgangsrechnungStatus = 'entwurf' | 'offen' | 'teilbezahlt' | 'bezahlt' | 'storniert'
export type AusgangsrechnungTyp = 'rechnung' | 'teilrechnung' | 'schlussrechnung' | 'stornorechnung'

export interface Ausgangsrechnung {
  id: string
  rechnungsnummer: string
  status: AusgangsrechnungStatus
  typ: AusgangsrechnungTyp
  kunde_id: string | null
  auftragsbestaetigung_id: string | null
  storno_zu_rechnung_id: string | null
  betreff: string | null
  rechnungsdatum: string
  leistungsdatum: string | null
  leistungszeitraum_von: string | null
  leistungszeitraum_bis: string | null
  zahlungsziel_tage: number
  faelligkeitsdatum: string | null
  teilrechnungs_prozent: number | null
  kopftext: string | null
  fusstext: string | null
  rabatt_gesamt_prozent: number
  summe_netto_20: number
  summe_netto_10: number
  summe_netto_0: number
  ust_20: number
  ust_10: number
  summe_brutto: number
  bezahlt_am: string | null
  bezahlt_betrag: number | null
  datev_exportiert_am: string | null
  mahnstufe: number
  gemahnt_am_1: string | null
  gemahnt_am_2: string | null
  gemahnt_am_3: string | null
  mahngebuehr: number
  created_at: string
  kunde?: Kunde | null
  positionen?: DokumentPosition[]
  storno_zu_rechnung?: Pick<Ausgangsrechnung, 'id' | 'rechnungsnummer'> | null
}

// ─── CRM ─────────────────────────────────────────────────────────────────────

export type LeadStatus = 'neu' | 'kontaktiert' | 'termin' | 'angebot' | 'auftrag' | 'abgeschlossen' | 'verloren'

export interface Lead {
  id: string
  created_at: string
  vorname: string | null
  nachname: string | null
  email: string | null
  telefon: string | null
  plz: string | null
  bundesland: string | null
  anlagenort: string | null
  anlagengroesse: string | null
  batteriespeicher: boolean | null
  umsetzung: string | null
  status: LeadStatus
  notiz: string | null
  termin_datum: string | null
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
  utm_term: string | null
  utm_content: string | null
  utm_id: string | null
  kunde_id: string | null
  kunde?: Kunde | null
}

export interface FirmaStammdaten {
  id: string
  name: string
  strasse: string
  plz_ort: string
  land: string
  tel: string
  email: string
  web: string
  uid: string
  fn_nr: string
  steuer_nr: string
  gericht: string
  gf: string
  bank: string
  iban: string
  bic: string
  konto: string
  blz: string
  logo_url: string | null
  updated_at: string
}

// ─── Database registry ────────────────────────────────────────────────────────

export interface Database {
  public: {
    Tables: {
      rechnungen: { Row: Rechnung; Insert: Omit<Rechnung, 'id' | 'created_at'>; Update: Partial<Rechnung> }
      lieferanten: { Row: Lieferant; Insert: Omit<Lieferant, 'id'>; Update: Partial<Lieferant> }
      mitarbeiter: { Row: Mitarbeiter; Insert: Omit<Mitarbeiter, 'id' | 'created_at'>; Update: Partial<Mitarbeiter> }
      duplikate: { Row: Duplikat; Insert: Omit<Duplikat, 'id'>; Update: Partial<Duplikat> }
      export_log: { Row: ExportLog; Insert: Omit<ExportLog, 'id'>; Update: Partial<ExportLog> }
      kunden: { Row: Kunde; Insert: Omit<Kunde, 'id' | 'created_at' | 'kundennummer'>; Update: Partial<Kunde> }
      dokument_positionen: { Row: DokumentPosition; Insert: Omit<DokumentPosition, 'id' | 'created_at'>; Update: Partial<DokumentPosition> }
      angebote: { Row: Angebot; Insert: Omit<Angebot, 'id' | 'created_at' | 'angebotsnummer'>; Update: Partial<Angebot> }
      auftragsbestatigungen: { Row: Auftragsbestaetigung; Insert: Omit<Auftragsbestaetigung, 'id' | 'created_at' | 'ab_nummer'>; Update: Partial<Auftragsbestaetigung> }
      ausgangsrechnungen: { Row: Ausgangsrechnung; Insert: Omit<Ausgangsrechnung, 'id' | 'created_at' | 'rechnungsnummer'>; Update: Partial<Ausgangsrechnung> }
      firma_einstellungen: { Row: FirmaStammdaten; Insert: Omit<FirmaStammdaten, 'id' | 'updated_at'>; Update: Partial<FirmaStammdaten> }
      leads: { Row: Lead; Insert: Omit<Lead, 'id' | 'created_at' | 'kunde'>; Update: Partial<Omit<Lead, 'id' | 'created_at' | 'kunde'>> }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
  }
}
