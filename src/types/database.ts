export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type RechnungStatus = 'eingegangen' | 'geprüft' | 'gebucht' | 'bezahlt'
export type ExportZiel = 'lexoffice' | 'datev'

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

export interface Database {
  public: {
    Tables: {
      rechnungen: { Row: Rechnung; Insert: Omit<Rechnung, 'id' | 'created_at'>; Update: Partial<Rechnung> }
      lieferanten: { Row: Lieferant; Insert: Omit<Lieferant, 'id'>; Update: Partial<Lieferant> }
      duplikate: { Row: Duplikat; Insert: Omit<Duplikat, 'id'>; Update: Partial<Duplikat> }
      export_log: { Row: ExportLog; Insert: Omit<ExportLog, 'id'>; Update: Partial<ExportLog> }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
  }
}
