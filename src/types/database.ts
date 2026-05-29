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

export interface Database {
  public: {
    Tables: {
      rechnungen: { Row: Rechnung; Insert: Omit<Rechnung, 'id' | 'created_at'>; Update: Partial<Rechnung> }
      lieferanten: { Row: Lieferant; Insert: Omit<Lieferant, 'id'>; Update: Partial<Lieferant> }
      mitarbeiter: { Row: Mitarbeiter; Insert: Omit<Mitarbeiter, 'id' | 'created_at'>; Update: Partial<Mitarbeiter> }
      duplikate: { Row: Duplikat; Insert: Omit<Duplikat, 'id'>; Update: Partial<Duplikat> }
      export_log: { Row: ExportLog; Insert: Omit<ExportLog, 'id'>; Update: Partial<ExportLog> }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
  }
}
