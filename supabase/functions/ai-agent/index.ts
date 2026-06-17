import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY')!
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
const MODEL = 'openai/gpt-4o-mini'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function berechneSummen(positionen: any[], rabattGesamt = 0) {
  let netto_20 = 0, netto_10 = 0, netto_0 = 0
  for (const p of positionen) {
    const z = p.menge * p.einzelpreis_netto * (1 - (p.rabatt_prozent ?? 0) / 100)
    if (p.ust_satz === 20) netto_20 += z
    else if (p.ust_satz === 10) netto_10 += z
    else netto_0 += z
  }
  if (rabattGesamt > 0) {
    const f = 1 - rabattGesamt / 100
    netto_20 *= f; netto_10 *= f; netto_0 *= f
  }
  const ust_20 = netto_20 * 0.2
  const ust_10 = netto_10 * 0.1
  const brutto = netto_20 + netto_10 + netto_0 + ust_20 + ust_10
  return { netto_20, netto_10, netto_0, ust_20, ust_10, brutto }
}

function monthLabel(yyyy_mm: string): string {
  const [y, m] = yyyy_mm.split('-')
  const names = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez']
  return `${names[parseInt(m) - 1]} ${y}`
}

function lastNMonths(n: number): string[] {
  const months: string[] = []
  const now = new Date()
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return months
}

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'get_kunden',
      description: 'Sucht Kunden in der Datenbank nach Name oder Firmenname.',
      parameters: {
        type: 'object',
        properties: {
          search: { type: 'string', description: 'Suchbegriff (Firmenname, Vor- oder Nachname)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_ausgangsrechnung',
      description: 'Erstellt eine neue Ausgangsrechnung mit Positionen. Frage zuerst nach Kunde (get_kunden), Positionen und Leistungsdatum. Leistungsdatum ODER Leistungszeitraum ist Pflicht (§11 UStG).',
      parameters: {
        type: 'object',
        required: ['kunde_id', 'positionen'],
        properties: {
          kunde_id:             { type: 'string', description: 'UUID des Kunden' },
          betreff:              { type: 'string', description: 'Betreff / Projekttitel' },
          typ:                  { type: 'string', enum: ['rechnung', 'teilrechnung', 'schlussrechnung'], description: 'Standard: rechnung' },
          leistungsdatum:       { type: 'string', description: 'Leistungsdatum YYYY-MM-DD (§11 UStG Pflicht, alternativ Zeitraum)' },
          leistungszeitraum_von:{ type: 'string', description: 'Leistungszeitraum von YYYY-MM-DD' },
          leistungszeitraum_bis:{ type: 'string', description: 'Leistungszeitraum bis YYYY-MM-DD' },
          zahlungsziel_tage:    { type: 'number', description: 'Zahlungsziel in Tagen, Standard 14' },
          positionen: {
            type: 'array',
            items: {
              type: 'object',
              required: ['bezeichnung', 'menge', 'einzelpreis_netto', 'einheit', 'ust_satz'],
              properties: {
                bezeichnung:        { type: 'string' },
                beschreibung:       { type: 'string' },
                menge:              { type: 'number' },
                einzelpreis_netto:  { type: 'number' },
                einheit:            { type: 'string', enum: ['Stk', 'Std', 'm²', 'lfm', 'kWp', 'kWh', 'pausch', 'Set'] },
                ust_satz:           { type: 'number', enum: [0, 10, 20] },
                rabatt_prozent:     { type: 'number' },
              },
            },
          },
          kopftext: { type: 'string' },
          fusstext: { type: 'string' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_angebot',
      description: 'Erstellt ein neues Angebot mit Positionen in der Datenbank.',
      parameters: {
        type: 'object',
        required: ['kunde_id', 'betreff', 'positionen'],
        properties: {
          kunde_id: { type: 'string' },
          betreff: { type: 'string' },
          positionen: {
            type: 'array',
            items: {
              type: 'object',
              required: ['bezeichnung', 'menge', 'einzelpreis_netto', 'einheit', 'ust_satz'],
              properties: {
                bezeichnung: { type: 'string' },
                menge: { type: 'number' },
                einzelpreis_netto: { type: 'number' },
                einheit: { type: 'string', enum: ['Stk', 'Std', 'm²', 'lfm', 'kWp', 'kWh', 'pausch', 'Set'] },
                ust_satz: { type: 'number', enum: [0, 10, 20] },
                rabatt_prozent: { type: 'number' },
              },
            },
          },
          kopftext: { type: 'string' },
          fusstext: { type: 'string' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_angebote',
      description: 'Listet Angebote auf, optional gefiltert nach Status.',
      parameters: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['entwurf', 'offen', 'berechnet', 'teilberechnet', 'abgelehnt'] },
          limit: { type: 'number' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_eingangsrechnungen',
      description: 'Listet EINGANGSRECHNUNGEN auf — Rechnungen die wir VON Lieferanten/Personen erhalten haben. Verwende dieses Tool wenn der Nutzer "von [Name]", "Eingangsrechnungen", "empfangene Rechnungen", "Lieferantenrechnungen" sagt.',
      parameters: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['eingegangen', 'geprüft', 'gebucht', 'bezahlt'] },
          lieferant_search: { type: 'string', description: 'Name des Lieferanten zum Filtern' },
          limit: { type: 'number' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_ausgangsrechnungen',
      description: 'Listet AUSGANGSRECHNUNGEN auf — Rechnungen die wir AN Kunden gestellt haben. Verwende dieses Tool wenn der Nutzer "an [Kunde]", "für [Kunde]", "Ausgangsrechnungen", "gestellte Rechnungen" sagt.',
      parameters: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['entwurf', 'offen', 'bezahlt', 'ueberfaellig', 'storniert'] },
          kunde_search: { type: 'string', description: 'Name des Kunden zum Filtern' },
          limit: { type: 'number' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_kunde',
      description: 'Legt einen neuen Kunden in der Datenbank an.',
      parameters: {
        type: 'object',
        properties: {
          firmenname: { type: 'string' },
          anrede:     { type: 'string', enum: ['Herr', 'Frau', 'Divers'] },
          vorname:    { type: 'string' },
          nachname:   { type: 'string' },
          email:      { type: 'string' },
          telefon:    { type: 'string' },
          adresse:    { type: 'string' },
          plz:        { type: 'string' },
          ort:        { type: 'string' },
          land:       { type: 'string' },
          uid_nr:     { type: 'string' },
          notiz:      { type: 'string' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_umsatz_chart',
      description: 'Gibt die monatliche Umsatz-Entwicklung (Ausgangsrechnungen brutto) als Chart-Daten zurück. Verwende dieses Tool wenn der Nutzer nach Umsatz-Entwicklung, Umsatz-Verlauf, Einnahmen-Trend oder ähnlichem fragt.',
      parameters: {
        type: 'object',
        properties: {
          monate: { type: 'number', description: 'Anzahl der letzten Monate, Standard 6' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_ausgaben_chart',
      description: 'Gibt die Ausgaben nach Lieferant als Chart-Daten zurück. Verwende dieses Tool wenn der Nutzer nach Ausgaben, Kosten, Lieferanten-Ausgaben oder ähnlichem fragt.',
      parameters: {
        type: 'object',
        properties: {
          monat: { type: 'string', description: 'Monat im Format YYYY-MM, Standard: aktueller Monat' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_ausgangsrechnung_status',
      description: 'Ändert den Status einer Ausgangsrechnung. Verwende dieses Tool wenn der Nutzer eine Ausgangsrechnung als bezahlt markieren, stornieren oder den Status ändern möchte.',
      parameters: {
        type: 'object',
        required: ['status'],
        properties: {
          rechnung_id:     { type: 'string', description: 'UUID der Ausgangsrechnung' },
          rechnungsnummer: { type: 'string', description: 'Rechnungsnummer (alternativ zu rechnung_id)' },
          status:          { type: 'string', enum: ['entwurf', 'offen', 'bezahlt', 'ueberfaellig', 'storniert'] },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_lieferanten',
      description: 'Sucht Lieferanten in der Datenbank.',
      parameters: {
        type: 'object',
        properties: {
          search: { type: 'string', description: 'Name des Lieferanten' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_lieferant',
      description: 'Legt einen neuen Lieferanten an.',
      parameters: {
        type: 'object',
        required: ['name'],
        properties: {
          name:               { type: 'string' },
          ustid:              { type: 'string' },
          iban:               { type: 'string' },
          auto_kostengruppe:  { type: 'string', description: 'BMD-Kostengruppe z.B. 4930' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_auftragsbestatigungen',
      description: 'Listet Auftragsbestätigungen auf, optional gefiltert nach Status.',
      parameters: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['entwurf', 'erhalten', 'teilberechnet', 'berechnet', 'abgelehnt', 'archiv'] },
          limit:  { type: 'number' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'convert_angebot_zu_auftrag',
      description: 'Wandelt ein Angebot in eine Auftragsbestätigung um und kopiert alle Positionen. Setzt Angebot-Status auf "berechnet".',
      parameters: {
        type: 'object',
        required: ['angebot_id'],
        properties: {
          angebot_id: { type: 'string', description: 'UUID des Angebots' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_kategorien',
      description: 'Gibt alle aktiven Buchungskategorien zurück.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_mitarbeiter',
      description: 'Listet alle aktiven Mitarbeiter auf.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_bank_transaktionen',
      description: 'Zeigt Bankbewegungen aus dem Kontoauszug. Verwende für Fragen zu Zahlungseingängen, Überweisungen, Kontostand oder Bankbewegungen.',
      parameters: {
        type: 'object',
        properties: {
          search: { type: 'string', description: 'Empfänger oder Buchungstext zum Filtern' },
          typ:    { type: 'string', enum: ['eingang', 'ueberweisung', 'lastschrift', 'gebuehr'] },
          limit:  { type: 'number' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_monats_zusammenfassung',
      description: 'KPI-Zusammenfassung für einen Monat: Umsatz, Ausgaben, Deckungsbeitrag, offene Forderungen, offene Angebote. Verwende dieses Tool für "Zusammenfassung", "KPI", "wie läuft der Monat", "Monatsübersicht".',
      parameters: {
        type: 'object',
        properties: {
          monat: { type: 'string', description: 'Monat im Format YYYY-MM, Standard: aktueller Monat' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_heute_todo',
      description: 'Was ist heute zu tun? Gibt fällige Eingangsrechnungen, offene Ausgangsrechnungen und Pipeline-Angebote zurück. Verwende dieses Tool für "was muss ich heute tun", "To-Do", "was ist fällig", "Tagesübersicht".',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_eingangsrechnung_status',
      description: 'Ändert den Status einer Eingangsrechnung. Verwende dieses Tool wenn der Nutzer eine Eingangsrechnung buchen, als bezahlt markieren oder den Status ändern möchte.',
      parameters: {
        type: 'object',
        required: ['status'],
        properties: {
          rechnung_id:  { type: 'string', description: 'UUID der Rechnung' },
          rechnungsnr:  { type: 'string', description: 'Rechnungsnummer (alternativ zu rechnung_id)' },
          status:       { type: 'string', enum: ['eingegangen', 'geprüft', 'gebucht', 'bezahlt'] },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_rechnung_pdf',
      description: 'Gibt den PDF-Link einer Eingangsrechnung zurück, damit der Nutzer das Dokument ansehen kann.',
      parameters: {
        type: 'object',
        properties: {
          rechnung_id: { type: 'string', description: 'UUID der Rechnung' },
          rechnungsnr: { type: 'string', description: 'Rechnungsnummer (alternativ zu rechnung_id)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_angebot_status',
      description: 'Setzt den Status eines Angebots: annehmen (→ "berechnet"), ablehnen (→ "abgelehnt"), öffnen (→ "offen"). Verwende wenn Nutzer "Angebot annehmen/ablehnen/öffnen" sagt.',
      parameters: {
        type: 'object',
        required: ['status'],
        properties: {
          angebot_id:      { type: 'string', description: 'UUID des Angebots' },
          angebotsnummer:  { type: 'string', description: 'Angebotsnummer (alternativ zu angebot_id)' },
          status:          { type: 'string', enum: ['entwurf', 'offen', 'berechnet', 'abgelehnt'] },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'duplicate_angebot',
      description: 'Kopiert ein bestehendes Angebot mit allen Positionen. Neues Angebot erhält Status "entwurf" und das heutige Datum.',
      parameters: {
        type: 'object',
        properties: {
          angebot_id:     { type: 'string', description: 'UUID des Angebots' },
          angebotsnummer: { type: 'string', description: 'Angebotsnummer (alternativ zu angebot_id)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'convert_angebot_zu_rechnung',
      description: 'Wandelt ein Angebot direkt in eine Ausgangsrechnung um und kopiert alle Positionen. Setzt Angebot-Status auf "berechnet".',
      parameters: {
        type: 'object',
        required: ['angebot_id'],
        properties: {
          angebot_id: { type: 'string', description: 'UUID des Angebots' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_top_kunden_chart',
      description: 'Zeigt die Top-Kunden nach Umsatz als horizontales Balkendiagramm. Verwende für "Top-Kunden", "beste Kunden", "wer zahlt am meisten", "Kunden nach Umsatz".',
      parameters: {
        type: 'object',
        properties: {
          limit:  { type: 'number', description: 'Anzahl der Top-Kunden, Standard 8' },
          monate: { type: 'number', description: 'Zeitraum in Monaten, Standard 12' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_jahresvergleich',
      description: 'Vergleicht den monatlichen Umsatz des aktuellen Jahres mit dem Vorjahr. Verwende für "Jahresvergleich", "Vorjahr", "wie war letztes Jahr".',
      parameters: {
        type: 'object',
        properties: {
          jahr: { type: 'number', description: 'Vergleichsjahr (aktuelles Jahr als Basis), Standard: aktuelles Jahr' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_skonto_alarm',
      description: 'Zeigt offene Eingangsrechnungen deren Zahlungsfrist in Kürze abläuft (Skonto-Fenster). Verwende für "Skonto", "Skonto-Alarm", "ablaufende Fristen", "bald fällige Rechnungen".',
      parameters: {
        type: 'object',
        properties: {
          tage: { type: 'number', description: 'Wie viele Tage in die Zukunft schauen, Standard 14' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_ust_vorschau',
      description: 'USt-Vorschau für das laufende Quartal: Umsatzsteuer-Schuld minus Vorsteuer = Zahllast ans Finanzamt. Verwende für "USt-Vorschau", "Umsatzsteuer", "was schulde ich dem Finanzamt", "Vorsteuer".',
      parameters: {
        type: 'object',
        properties: {
          quartal: { type: 'string', description: 'Quartal im Format "2026-Q2", Standard: aktuelles Quartal' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_kunde',
      description: 'Aktualisiert die Stammdaten eines bestehenden Kunden (Adresse, E-Mail, Telefon, UID etc.).',
      parameters: {
        type: 'object',
        required: ['kunde_id'],
        properties: {
          kunde_id:   { type: 'string', description: 'UUID des Kunden' },
          firmenname: { type: 'string' },
          vorname:    { type: 'string' },
          nachname:   { type: 'string' },
          email:      { type: 'string' },
          telefon:    { type: 'string' },
          adresse:    { type: 'string' },
          plz:        { type: 'string' },
          ort:        { type: 'string' },
          land:       { type: 'string' },
          uid_nr:     { type: 'string' },
          notiz:      { type: 'string' },
        },
      },
    },
  },
]

async function executeTool(name: string, input: any, supabase: any): Promise<any> {
  if (name === 'get_kunden') {
    let query = supabase.from('kunden').select('id, firmenname, vorname, nachname, ort').limit(10)
    if (input.search) {
      query = query.or(
        `firmenname.ilike.%${input.search}%,nachname.ilike.%${input.search}%,vorname.ilike.%${input.search}%`
      )
    }
    const { data, error } = await query
    if (error) return { error: error.message }
    return {
      kunden: data,
      _entities: (data ?? []).map((k: any) => ({
        type: 'kunde', id: k.id,
        label: k.firmenname || `${k.vorname ?? ''} ${k.nachname ?? ''}`.trim(),
        sublabel: k.ort ?? undefined,
      })),
    }
  }

  if (name === 'create_kunde') {
    const { data: kunde, error } = await supabase
      .from('kunden')
      .insert({
        firmenname: input.firmenname ?? null,
        anrede:     input.anrede ?? null,
        vorname:    input.vorname ?? null,
        nachname:   input.nachname ?? null,
        email:      input.email ?? null,
        telefon:    input.telefon ?? null,
        adresse:    input.adresse ?? null,
        plz:        input.plz ?? null,
        ort:        input.ort ?? null,
        land:       input.land ?? 'Österreich',
        uid_nr:     input.uid_nr ?? null,
        notiz:      input.notiz ?? null,
      })
      .select('id, kundennummer, firmenname, vorname, nachname')
      .single()
    if (error) return { error: error.message }
    const displayName = kunde.firmenname ?? `${kunde.vorname ?? ''} ${kunde.nachname ?? ''}`.trim()
    return {
      success: true, kunde_id: kunde.id, kundennummer: kunde.kundennummer, name: displayName,
      _entities: [{ type: 'kunde', id: kunde.id, label: displayName, sublabel: kunde.kundennummer }],
    }
  }

  if (name === 'create_ausgangsrechnung') {
    const { kunde_id, betreff, typ, leistungsdatum, leistungszeitraum_von, leistungszeitraum_bis,
            zahlungsziel_tage, positionen, kopftext, fusstext } = input
    if (!positionen?.length) return { error: 'Mindestens eine Position ist erforderlich' }
    if (!leistungsdatum && !leistungszeitraum_von) return { error: 'Leistungsdatum oder Leistungszeitraum ist Pflicht (§11 UStG)' }
    const summen = berechneSummen(positionen)
    const today = new Date().toISOString().slice(0, 10)
    const tage = zahlungsziel_tage ?? 14
    const faellig = new Date(); faellig.setDate(faellig.getDate() + tage)
    const { data: rechnung, error: rErr } = await supabase.from('ausgangsrechnungen').insert({
      kunde_id,
      betreff: betreff ?? null,
      typ: typ ?? 'rechnung',
      status: 'entwurf',
      rechnungsdatum: today,
      leistungsdatum: leistungsdatum ?? null,
      leistungszeitraum_von: leistungszeitraum_von ?? null,
      leistungszeitraum_bis: leistungszeitraum_bis ?? null,
      zahlungsziel_tage: tage,
      faelligkeitsdatum: faellig.toISOString().slice(0, 10),
      kopftext: kopftext ?? null,
      fusstext: fusstext ?? null,
      rabatt_gesamt_prozent: 0,
      summe_netto_20: summen.netto_20,
      summe_netto_10: summen.netto_10,
      summe_netto_0:  summen.netto_0,
      ust_20:         summen.ust_20,
      ust_10:         summen.ust_10,
      summe_brutto:   summen.brutto,
    }).select('id, rechnungsnummer').single()
    if (rErr) return { error: rErr.message }
    const { error: posErr } = await supabase.from('dokument_positionen').insert(
      positionen.map((p: any, i: number) => ({
        dokument_id: rechnung.id, dokument_typ: 'rechnung', reihenfolge: i,
        bezeichnung: p.bezeichnung, beschreibung: p.beschreibung ?? null,
        menge: p.menge, einheit: p.einheit,
        einzelpreis_netto: p.einzelpreis_netto,
        ust_satz: p.ust_satz, rabatt_prozent: p.rabatt_prozent ?? 0,
        zeilenbetrag_netto: p.menge * p.einzelpreis_netto * (1 - (p.rabatt_prozent ?? 0) / 100),
      }))
    )
    if (posErr) return { error: posErr.message }
    return {
      success: true,
      rechnung_id: rechnung.id,
      rechnungsnummer: rechnung.rechnungsnummer,
      summe_brutto: Math.round(summen.brutto * 100) / 100,
      status: 'entwurf',
      _entities: [{ type: 'rechnung', id: rechnung.id, label: rechnung.rechnungsnummer, sublabel: betreff ?? undefined }],
    }
  }

  if (name === 'create_angebot') {
    const { kunde_id, betreff, positionen, kopftext, fusstext } = input
    const summen = berechneSummen(positionen)
    const today = new Date().toISOString().slice(0, 10)
    const { data: angebot, error: angebotErr } = await supabase
      .from('angebote')
      .insert({
        kunde_id, betreff, angebotsdatum: today,
        kopftext: kopftext ?? null, fusstext: fusstext ?? null,
        summe_netto_20: summen.netto_20, summe_netto_10: summen.netto_10,
        summe_netto_0: summen.netto_0, ust_20: summen.ust_20,
        ust_10: summen.ust_10, summe_brutto: summen.brutto,
      })
      .select('id, angebotsnummer').single()
    if (angebotErr) return { error: angebotErr.message }
    if (positionen.length > 0) {
      const { error: posErr } = await supabase.from('dokument_positionen').insert(
        positionen.map((p: any, i: number) => ({
          dokument_id: angebot.id, dokument_typ: 'angebot', reihenfolge: i,
          bezeichnung: p.bezeichnung, beschreibung: p.beschreibung ?? null,
          menge: p.menge, einheit: p.einheit, einzelpreis_netto: p.einzelpreis_netto,
          ust_satz: p.ust_satz, rabatt_prozent: p.rabatt_prozent ?? 0,
          zeilenbetrag_netto: p.menge * p.einzelpreis_netto * (1 - (p.rabatt_prozent ?? 0) / 100),
        }))
      )
      if (posErr) return { error: posErr.message }
    }
    return {
      success: true, angebot_id: angebot.id, angebotsnummer: angebot.angebotsnummer,
      _entities: [{ type: 'angebot', id: angebot.id, label: angebot.angebotsnummer, sublabel: betreff }],
    }
  }

  if (name === 'get_angebote') {
    let query = supabase
      .from('angebote')
      .select('id, angebotsnummer, betreff, status, summe_brutto, angebotsdatum, kunde:kunden(firmenname, nachname)')
      .order('created_at', { ascending: false }).limit(input.limit ?? 10)
    if (input.status) query = query.eq('status', input.status)
    const { data, error } = await query
    if (error) return { error: error.message }
    return {
      angebote: data,
      _entities: (data ?? []).map((a: any) => ({
        type: 'angebot', id: a.id, label: a.angebotsnummer,
        sublabel: a.betreff ?? a.kunde?.firmenname ?? undefined,
      })),
    }
  }

  if (name === 'get_eingangsrechnungen') {
    let query = supabase
      .from('rechnungen')
      .select('id, rechnungsnr, betrag, ust_satz, status, faelligkeit, rechnungsdatum, lieferant:lieferanten(id, name)')
      .order('created_at', { ascending: false }).limit(input.limit ?? 10)
    if (input.status) query = query.eq('status', input.status)
    if (input.lieferant_search) {
      const { data: hits } = await supabase
        .from('lieferanten').select('id')
        .ilike('name', `%${input.lieferant_search}%`)
      if (hits?.length) query = query.in('lieferant_id', hits.map((l: any) => l.id))
      else return { rechnungen: [], _entities: [] }
    }
    const { data, error } = await query
    if (error) return { error: error.message }
    return {
      rechnungen: data,
      _entities: (data ?? []).map((r: any) => ({
        type: 'eingangsrechnung', id: r.id, label: r.rechnungsnr,
        sublabel: r.lieferant?.name ?? undefined,
      })),
    }
  }

  if (name === 'get_ausgangsrechnungen') {
    let query = supabase
      .from('ausgangsrechnungen')
      .select('id, rechnungsnummer, betreff, status, summe_brutto, rechnungsdatum, kunde:kunden(id, firmenname, vorname, nachname)')
      .order('created_at', { ascending: false }).limit(input.limit ?? 10)
    if (input.status) query = query.eq('status', input.status)
    if (input.kunde_search) {
      const { data: hits } = await supabase
        .from('kunden').select('id')
        .or(`firmenname.ilike.%${input.kunde_search}%,nachname.ilike.%${input.kunde_search}%,vorname.ilike.%${input.kunde_search}%`)
      if (hits?.length) query = query.in('kunde_id', hits.map((k: any) => k.id))
      else return { rechnungen: [], _entities: [] }
    }
    const { data, error } = await query
    if (error) return { error: error.message }
    return {
      rechnungen: data,
      _entities: (data ?? []).map((r: any) => ({
        type: 'rechnung', id: r.id, label: r.rechnungsnummer,
        sublabel: (r.kunde?.firmenname ?? `${r.kunde?.vorname ?? ''} ${r.kunde?.nachname ?? ''}`.trim()) || r.betreff || undefined,
      })),
    }
  }

  if (name === 'get_umsatz_chart') {
    const n = input.monate ?? 6
    const months = lastNMonths(n)
    const { data: rechnungen, error } = await supabase
      .from('ausgangsrechnungen')
      .select('rechnungsdatum, summe_brutto')
      .gte('rechnungsdatum', months[0] + '-01')
    if (error) return { error: error.message }

    const byMonth = new Map<string, number>()
    months.forEach(m => byMonth.set(m, 0))
    ;(rechnungen ?? []).forEach((r: any) => {
      const m = (r.rechnungsdatum ?? '').slice(0, 7)
      if (byMonth.has(m)) byMonth.set(m, (byMonth.get(m) ?? 0) + (r.summe_brutto ?? 0))
    })

    const chartData = months.map(m => ({ label: monthLabel(m), value: Math.round(byMonth.get(m) ?? 0) }))
    const total = chartData.reduce((s, d) => s + d.value, 0)
    return {
      chartData,
      chartType: 'bar',
      chartTitle: `Umsatz — letzte ${n} Monate`,
      summary: `Gesamtumsatz: €${total.toLocaleString('de-AT')}`,
    }
  }

  if (name === 'get_ausgaben_chart') {
    const monat = input.monat ?? new Date().toISOString().slice(0, 7)
    const { data: rechnungen, error } = await supabase
      .from('rechnungen')
      .select('betrag, ust_satz, lieferant:lieferanten(name)')
      .gte('rechnungsdatum', monat + '-01')
      .lt('rechnungsdatum', monat.slice(0, 4) + '-' + String(parseInt(monat.slice(5, 7)) + 1).padStart(2, '0') + '-01')
    if (error) return { error: error.message }

    const map = new Map<string, number>()
    ;(rechnungen ?? []).forEach((r: any) => {
      const name = r.lieferant?.name ?? 'Sonstige'
      const brutto = r.betrag * (1 + (r.ust_satz ?? 20) / 100)
      map.set(name, (map.get(name) ?? 0) + brutto)
    })

    const chartData = [...map.entries()]
      .sort((a, b) => b[1] - a[1]).slice(0, 6)
      .map(([label, value]) => ({ label, value: Math.round(value) }))

    return {
      chartData,
      chartType: 'horizontal-bar',
      chartTitle: `Ausgaben nach Lieferant — ${monthLabel(monat)}`,
    }
  }

  if (name === 'set_ausgangsrechnung_status') {
    let id = input.rechnung_id
    if (!id && input.rechnungsnummer) {
      const { data } = await supabase.from('ausgangsrechnungen').select('id').eq('rechnungsnummer', input.rechnungsnummer).single()
      id = data?.id
    }
    if (!id) return { error: 'Ausgangsrechnung nicht gefunden' }
    const { error } = await supabase.from('ausgangsrechnungen').update({ status: input.status }).eq('id', id)
    if (error) return { error: error.message }
    return { success: true, id, neuer_status: input.status }
  }

  if (name === 'get_lieferanten') {
    let query = supabase.from('lieferanten').select('id, name, ustid, auto_kostengruppe').limit(10)
    if (input.search) query = query.ilike('name', `%${input.search}%`)
    const { data, error } = await query
    if (error) return { error: error.message }
    return {
      lieferanten: data,
      _entities: (data ?? []).map((l: any) => ({
        type: 'lieferant', id: l.id, label: l.name, sublabel: l.auto_kostengruppe ?? undefined,
      })),
    }
  }

  if (name === 'create_lieferant') {
    const { data, error } = await supabase.from('lieferanten').insert({
      name: input.name,
      ustid: input.ustid ?? null,
      iban: input.iban ?? null,
      auto_kostengruppe: input.auto_kostengruppe ?? null,
    }).select('id, name').single()
    if (error) return { error: error.message }
    return {
      success: true, lieferant_id: data.id, name: data.name,
      _entities: [{ type: 'lieferant', id: data.id, label: data.name }],
    }
  }

  if (name === 'get_auftragsbestatigungen') {
    let query = supabase
      .from('auftragsbestatigungen')
      .select('id, ab_nummer, betreff, status, summe_brutto, ab_datum, kunde:kunden(firmenname, nachname)')
      .order('created_at', { ascending: false }).limit(input.limit ?? 10)
    if (input.status) query = query.eq('status', input.status)
    const { data, error } = await query
    if (error) return { error: error.message }
    return {
      auftragsbestatigungen: data,
      _entities: (data ?? []).map((a: any) => ({
        type: 'auftragsbestaetigung', id: a.id, label: a.ab_nummer,
        sublabel: (a.kunde?.firmenname ?? a.betreff) || undefined,
      })),
    }
  }

  if (name === 'convert_angebot_zu_auftrag') {
    const { data: angebot, error: angebotErr } = await supabase
      .from('angebote')
      .select('*, positionen:dokument_positionen(*)')
      .eq('id', input.angebot_id).single()
    if (angebotErr || !angebot) return { error: 'Angebot nicht gefunden' }

    const { data: ab, error: abErr } = await supabase
      .from('auftragsbestatigungen')
      .insert({
        kunde_id: angebot.kunde_id, angebot_id: angebot.id,
        betreff: angebot.betreff, kopftext: angebot.kopftext ?? null, fusstext: angebot.fusstext ?? null,
        summe_netto_20: angebot.summe_netto_20, summe_netto_10: angebot.summe_netto_10,
        summe_netto_0: angebot.summe_netto_0, ust_20: angebot.ust_20,
        ust_10: angebot.ust_10, summe_brutto: angebot.summe_brutto,
      })
      .select('id, ab_nummer').single()
    if (abErr) return { error: abErr.message }

    if (angebot.positionen?.length > 0) {
      const { error: posErr } = await supabase.from('dokument_positionen').insert(
        angebot.positionen.map((p: any, i: number) => ({
          dokument_id: ab.id, dokument_typ: 'auftragsbestaetigung', reihenfolge: i,
          bezeichnung: p.bezeichnung, beschreibung: p.beschreibung ?? null,
          menge: p.menge, einheit: p.einheit, einzelpreis_netto: p.einzelpreis_netto,
          ust_satz: p.ust_satz, rabatt_prozent: (p.rabatt_prozent ?? 0),
          zeilenbetrag_netto: p.zeilenbetrag_netto,
        }))
      )
      if (posErr) return { error: posErr.message }
    }
    await supabase.from('angebote').update({ status: 'berechnet' }).eq('id', input.angebot_id)
    return {
      success: true, ab_id: ab.id, ab_nummer: ab.ab_nummer,
      _entities: [{ type: 'auftragsbestaetigung', id: ab.id, label: ab.ab_nummer, sublabel: angebot.betreff }],
    }
  }

  if (name === 'get_kategorien') {
    const { data, error } = await supabase.from('kategorien').select('wert, name, beschreibung').eq('aktiv', true).order('name')
    if (error) return { error: error.message }
    return { kategorien: data }
  }

  if (name === 'get_mitarbeiter') {
    const { data, error } = await supabase.from('mitarbeiter').select('id, name, email').eq('aktiv', true).order('name')
    if (error) return { error: error.message }
    return {
      mitarbeiter: data,
      _entities: (data ?? []).map((m: any) => ({
        type: 'mitarbeiter', id: m.id, label: m.name, sublabel: m.email ?? undefined,
      })),
    }
  }

  if (name === 'get_bank_transaktionen') {
    let query = supabase
      .from('bank_transaktionen')
      .select('id, datum, betrag, buchungstext, empfaenger, referenz, typ, matched')
      .order('datum', { ascending: false }).limit(input.limit ?? 15)
    if (input.search) query = query.or(`buchungstext.ilike.%${input.search}%,empfaenger.ilike.%${input.search}%`)
    if (input.typ) query = query.eq('typ', input.typ)
    const { data, error } = await query
    if (error) return { error: error.message }
    return { transaktionen: data }
  }

  if (name === 'get_monats_zusammenfassung') {
    const monat = input.monat ?? new Date().toISOString().slice(0, 7)
    const [y, m] = monat.split('-')
    const start = `${monat}-01`
    const nd = new Date(parseInt(y), parseInt(m), 1)
    const end = `${nd.getFullYear()}-${String(nd.getMonth() + 1).padStart(2, '0')}-01`

    const [arRes, erRes, offeneAR, offeneAngebote] = await Promise.all([
      supabase.from('ausgangsrechnungen').select('summe_brutto, status').gte('rechnungsdatum', start).lt('rechnungsdatum', end),
      supabase.from('rechnungen').select('betrag').gte('rechnungsdatum', start).lt('rechnungsdatum', end),
      supabase.from('ausgangsrechnungen').select('id', { count: 'exact', head: true }).eq('status', 'offen'),
      supabase.from('angebote').select('id', { count: 'exact', head: true }).eq('status', 'offen'),
    ])

    const umsatz = (arRes.data ?? []).reduce((s: number, r: any) => s + (r.summe_brutto ?? 0), 0)
    const ausgaben = (erRes.data ?? []).reduce((s: number, r: any) => s + (r.betrag ?? 0), 0)
    return {
      monat: monthLabel(monat),
      umsatz: Math.round(umsatz),
      ausgaben: Math.round(ausgaben),
      deckungsbeitrag: Math.round(umsatz - ausgaben),
      offene_forderungen: offeneAR.count ?? 0,
      offene_angebote: offeneAngebote.count ?? 0,
    }
  }

  if (name === 'get_heute_todo') {
    const today = new Date().toISOString().slice(0, 10)
    const [faelligRes, ausgangsRes, angeboteRes] = await Promise.all([
      supabase.from('rechnungen')
        .select('id, rechnungsnr, betrag, faelligkeit, lieferant:lieferanten(name)')
        .lte('faelligkeit', today)
        .not('status', 'in', '("bezahlt","gebucht")')
        .order('faelligkeit').limit(8),
      supabase.from('ausgangsrechnungen')
        .select('id, rechnungsnummer, summe_brutto, status, kunde:kunden(firmenname, nachname)')
        .in('status', ['offen', 'ueberfaellig'])
        .order('rechnungsdatum').limit(8),
      supabase.from('angebote')
        .select('id, angebotsnummer, betreff, summe_brutto, kunde:kunden(firmenname, nachname)')
        .eq('status', 'offen')
        .order('angebotsdatum', { ascending: false }).limit(5),
    ])
    return {
      faellige_eingangsrechnungen: faelligRes.data ?? [],
      offene_ausgangsrechnungen: ausgangsRes.data ?? [],
      offene_angebote: angeboteRes.data ?? [],
      _entities: [
        ...(faelligRes.data ?? []).map((r: any) => ({ type: 'eingangsrechnung', id: r.id, label: r.rechnungsnr, sublabel: r.lieferant?.name })),
        ...(ausgangsRes.data ?? []).map((r: any) => ({ type: 'rechnung', id: r.id, label: r.rechnungsnummer, sublabel: r.kunde?.firmenname ?? `${r.kunde?.vorname ?? ''} ${r.kunde?.nachname ?? ''}`.trim() })),
        ...(angeboteRes.data ?? []).map((a: any) => ({ type: 'angebot', id: a.id, label: a.angebotsnummer, sublabel: a.betreff ?? a.kunde?.firmenname })),
      ],
    }
  }

  if (name === 'set_eingangsrechnung_status') {
    let id = input.rechnung_id
    if (!id && input.rechnungsnr) {
      const { data } = await supabase.from('rechnungen').select('id').eq('rechnungsnr', input.rechnungsnr).single()
      id = data?.id
    }
    if (!id) return { error: 'Rechnung nicht gefunden' }
    const { error } = await supabase.from('rechnungen').update({ status: input.status }).eq('id', id)
    if (error) return { error: error.message }
    return { success: true, id, neuer_status: input.status }
  }

  if (name === 'get_rechnung_pdf') {
    let query = supabase.from('rechnungen').select('id, rechnungsnr, pdf_url, lieferant:lieferanten(name)')
    if (input.rechnung_id) query = query.eq('id', input.rechnung_id)
    else if (input.rechnungsnr) query = query.eq('rechnungsnr', input.rechnungsnr)
    const { data, error } = await query.single()
    if (error || !data) return { error: 'Rechnung nicht gefunden' }
    if (!data.pdf_url || data.pdf_url === 'demo') return { error: 'Kein PDF verfügbar für diese Rechnung' }
    return {
      rechnungsnr: data.rechnungsnr,
      lieferant: data.lieferant?.name,
      pdf_url: data.pdf_url,
      _entities: [{ type: 'pdf', id: data.pdf_url, label: data.rechnungsnr, sublabel: data.lieferant?.name }],
    }
  }

  if (name === 'set_angebot_status') {
    let id = input.angebot_id
    if (!id && input.angebotsnummer) {
      const { data } = await supabase.from('angebote').select('id').eq('angebotsnummer', input.angebotsnummer).single()
      id = data?.id
    }
    if (!id) return { error: 'Angebot nicht gefunden' }
    const { error } = await supabase.from('angebote').update({ status: input.status }).eq('id', id)
    if (error) return { error: error.message }
    return { success: true, id, neuer_status: input.status }
  }

  if (name === 'duplicate_angebot') {
    let id = input.angebot_id
    if (!id && input.angebotsnummer) {
      const { data } = await supabase.from('angebote').select('id').eq('angebotsnummer', input.angebotsnummer).single()
      id = data?.id
    }
    if (!id) return { error: 'Angebot nicht gefunden' }
    const { data: orig, error: origErr } = await supabase.from('angebote').select('*, positionen:dokument_positionen(*)').eq('id', id).single()
    if (origErr || !orig) return { error: 'Angebot nicht gefunden' }
    const { id: _id, created_at: _c, angebotsnummer: _nr, ...fields } = orig as any
    const { data: neu, error: insertErr } = await supabase.from('angebote')
      .insert({ ...fields, status: 'entwurf', angebotsdatum: new Date().toISOString().slice(0, 10), positionen: undefined })
      .select('id, angebotsnummer').single()
    if (insertErr) return { error: insertErr.message }
    if (orig.positionen?.length > 0) {
      await supabase.from('dokument_positionen').insert(
        orig.positionen.map(({ id: _pid, created_at: _pc, dokument_id: _di, ...p }: any) => ({
          ...p, dokument_id: neu.id, dokument_typ: 'angebot',
        }))
      )
    }
    return {
      success: true, angebot_id: neu.id, angebotsnummer: neu.angebotsnummer,
      _entities: [{ type: 'angebot', id: neu.id, label: neu.angebotsnummer, sublabel: 'Kopie von ' + (orig.angebotsnummer ?? '') }],
    }
  }

  if (name === 'convert_angebot_zu_rechnung') {
    const { data: angebot, error: angebotErr } = await supabase
      .from('angebote').select('*, positionen:dokument_positionen(*)')
      .eq('id', input.angebot_id).single()
    if (angebotErr || !angebot) return { error: 'Angebot nicht gefunden' }
    const today = new Date().toISOString().slice(0, 10)
    const faellig = new Date(); faellig.setDate(faellig.getDate() + 14)
    const { data: rechnung, error: rErr } = await supabase.from('ausgangsrechnungen').insert({
      kunde_id: angebot.kunde_id, betreff: angebot.betreff,
      kopftext: angebot.kopftext ?? null, fusstext: angebot.fusstext ?? null,
      rechnungsdatum: today, zahlungsziel_tage: 14,
      faelligkeitsdatum: faellig.toISOString().slice(0, 10),
      typ: 'rechnung', status: 'entwurf',
      summe_netto_20: angebot.summe_netto_20, summe_netto_10: angebot.summe_netto_10,
      summe_netto_0: angebot.summe_netto_0, ust_20: angebot.ust_20,
      ust_10: angebot.ust_10, summe_brutto: angebot.summe_brutto,
      rabatt_gesamt_prozent: angebot.rabatt_gesamt_prozent ?? 0,
    }).select('id, rechnungsnummer').single()
    if (rErr) return { error: rErr.message }
    if (angebot.positionen?.length > 0) {
      await supabase.from('dokument_positionen').insert(
        angebot.positionen.map(({ id: _pid, created_at: _pc, dokument_id: _di, ...p }: any) => ({
          ...p, dokument_id: rechnung.id, dokument_typ: 'rechnung',
        }))
      )
    }
    await supabase.from('angebote').update({ status: 'berechnet' }).eq('id', input.angebot_id)
    return {
      success: true, rechnung_id: rechnung.id, rechnungsnummer: rechnung.rechnungsnummer,
      _entities: [{ type: 'rechnung', id: rechnung.id, label: rechnung.rechnungsnummer, sublabel: angebot.betreff }],
    }
  }

  if (name === 'get_top_kunden_chart') {
    const n = input.monate ?? 12
    const limit = input.limit ?? 8
    const since = new Date(); since.setMonth(since.getMonth() - n)
    const { data, error } = await supabase
      .from('ausgangsrechnungen')
      .select('summe_brutto, kunde:kunden(id, firmenname, vorname, nachname)')
      .gte('rechnungsdatum', since.toISOString().slice(0, 10))
      .neq('status', 'storniert')
    if (error) return { error: error.message }
    const map = new Map<string, number>()
    ;(data ?? []).forEach((r: any) => {
      const name = r.kunde?.firmenname || `${r.kunde?.vorname ?? ''} ${r.kunde?.nachname ?? ''}`.trim() || 'Unbekannt'
      map.set(name, (map.get(name) ?? 0) + (r.summe_brutto ?? 0))
    })
    const chartData = [...map.entries()]
      .sort((a, b) => b[1] - a[1]).slice(0, limit)
      .map(([label, value]) => ({ label, value: Math.round(value) }))
    const total = chartData.reduce((s, d) => s + d.value, 0)
    return {
      chartData, chartType: 'horizontal-bar',
      chartTitle: `Top ${limit} Kunden nach Umsatz (letzte ${n} Monate)`,
      summary: `Gesamtumsatz Top-Kunden: €${total.toLocaleString('de-AT')}`,
    }
  }

  if (name === 'get_jahresvergleich') {
    const baseJahr = input.jahr ?? new Date().getFullYear()
    const prevJahr = baseJahr - 1
    const [curRes, prevRes] = await Promise.all([
      supabase.from('ausgangsrechnungen').select('rechnungsdatum, summe_brutto')
        .gte('rechnungsdatum', `${baseJahr}-01-01`).lt('rechnungsdatum', `${baseJahr + 1}-01-01`).neq('status', 'storniert'),
      supabase.from('ausgangsrechnungen').select('rechnungsdatum, summe_brutto')
        .gte('rechnungsdatum', `${prevJahr}-01-01`).lt('rechnungsdatum', `${baseJahr}-01-01`).neq('status', 'storniert'),
    ])
    const months = ['01','02','03','04','05','06','07','08','09','10','11','12']
    const names = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez']
    const byMonth = (rows: any[]) => {
      const m = new Map(months.map(mm => [mm, 0]))
      ;(rows ?? []).forEach((r: any) => { const mm = (r.rechnungsdatum ?? '').slice(5, 7); if (m.has(mm)) m.set(mm, (m.get(mm) ?? 0) + (r.summe_brutto ?? 0)) })
      return m
    }
    const cur = byMonth(curRes.data ?? [])
    const prev = byMonth(prevRes.data ?? [])
    const chartData = months.map((mm, i) => ({ label: names[i], value: Math.round(cur.get(mm) ?? 0) }))
    const curTotal = [...cur.values()].reduce((s, v) => s + v, 0)
    const prevTotal = [...prev.values()].reduce((s, v) => s + v, 0)
    const wachstum = prevTotal > 0 ? Math.round((curTotal - prevTotal) / prevTotal * 100) : null
    const prevByMonth = months.map((mm, i) => `${names[i]}: €${Math.round(prev.get(mm) ?? 0).toLocaleString('de-AT')}`).join(', ')
    return {
      chartData, chartType: 'bar',
      chartTitle: `Umsatz ${baseJahr} (monatlich)`,
      aktuelles_jahr: baseJahr, gesamt_aktuell: Math.round(curTotal),
      vorjahr: prevJahr, gesamt_vorjahr: Math.round(prevTotal),
      wachstum_prozent: wachstum,
      vorjahr_monatlich: prevByMonth,
    }
  }

  if (name === 'get_skonto_alarm') {
    const tage = input.tage ?? 14
    const today = new Date().toISOString().slice(0, 10)
    const future = new Date(); future.setDate(future.getDate() + tage)
    const futureStr = future.toISOString().slice(0, 10)
    const { data, error } = await supabase
      .from('rechnungen')
      .select('id, rechnungsnr, betrag, faelligkeit, rechnungsdatum, lieferant:lieferanten(name)')
      .gte('faelligkeit', today)
      .lte('faelligkeit', futureStr)
      .not('status', 'in', '("bezahlt","gebucht")')
      .order('faelligkeit')
    if (error) return { error: error.message }
    const gesamt = (data ?? []).reduce((s: number, r: any) => s + (r.betrag ?? 0), 0)
    return {
      rechnungen: data ?? [],
      anzahl: data?.length ?? 0,
      gesamt_betrag: Math.round(gesamt),
      zeitraum: `Nächste ${tage} Tage`,
      _entities: (data ?? []).map((r: any) => ({
        type: 'eingangsrechnung', id: r.id, label: r.rechnungsnr, sublabel: r.lieferant?.name,
      })),
    }
  }

  if (name === 'get_ust_vorschau') {
    const now = new Date()
    let year = now.getFullYear()
    let q = Math.floor(now.getMonth() / 3) + 1
    if (input.quartal) {
      const parts = input.quartal.split('-Q')
      year = parseInt(parts[0]); q = parseInt(parts[1])
    }
    const qStart = `${year}-${String((q - 1) * 3 + 1).padStart(2, '0')}-01`
    const nextQ = q === 4 ? `${year + 1}-01-01` : `${year}-${String(q * 3 + 1).padStart(2, '0')}-01`
    const [arRes, erRes] = await Promise.all([
      supabase.from('ausgangsrechnungen').select('ust_20, ust_10').gte('rechnungsdatum', qStart).lt('rechnungsdatum', nextQ).neq('status', 'storniert'),
      supabase.from('rechnungen').select('betrag, ust_satz').gte('rechnungsdatum', qStart).lt('rechnungsdatum', nextQ),
    ])
    const ust_schuld = (arRes.data ?? []).reduce((s: number, r: any) => s + (r.ust_20 ?? 0) + (r.ust_10 ?? 0), 0)
    const vorsteuer = (erRes.data ?? []).reduce((s: number, r: any) => s + (r.betrag ?? 0) * ((r.ust_satz ?? 0) / 100), 0)
    const zahllast = ust_schuld - vorsteuer
    return {
      quartal: `Q${q} ${year}`,
      zeitraum: `${qStart} bis ${nextQ}`,
      ust_schuld: Math.round(ust_schuld),
      vorsteuer: Math.round(vorsteuer),
      zahllast: Math.round(zahllast),
      hinweis: zahllast > 0 ? `Zahllast ans Finanzamt: €${Math.round(zahllast).toLocaleString('de-AT')}` : `Vorsteuerüberhang: €${Math.round(Math.abs(zahllast)).toLocaleString('de-AT')} (Erstattung möglich)`,
    }
  }

  if (name === 'update_kunde') {
    const { kunde_id, ...fields } = input
    const patch: any = {}
    if (fields.firmenname !== undefined) patch.firmenname = fields.firmenname
    if (fields.vorname !== undefined) patch.vorname = fields.vorname
    if (fields.nachname !== undefined) patch.nachname = fields.nachname
    if (fields.email !== undefined) patch.email = fields.email
    if (fields.telefon !== undefined) patch.telefon = fields.telefon
    if (fields.adresse !== undefined) patch.adresse = fields.adresse
    if (fields.plz !== undefined) patch.plz = fields.plz
    if (fields.ort !== undefined) patch.ort = fields.ort
    if (fields.land !== undefined) patch.land = fields.land
    if (fields.uid_nr !== undefined) patch.uid_nr = fields.uid_nr
    if (fields.notiz !== undefined) patch.notiz = fields.notiz
    if (Object.keys(patch).length === 0) return { error: 'Keine Änderungen angegeben' }
    const { data, error } = await supabase.from('kunden').update(patch).eq('id', kunde_id).select('id, firmenname, vorname, nachname').single()
    if (error) return { error: error.message }
    const name = data.firmenname ?? `${data.vorname ?? ''} ${data.nachname ?? ''}`.trim()
    return {
      success: true, kunde_id: data.id, name,
      _entities: [{ type: 'kunde', id: data.id, label: name }],
    }
  }

  return { error: `Unbekanntes Tool: ${name}` }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  try {
    if (!OPENROUTER_API_KEY) throw new Error('OPENROUTER_API_KEY nicht gesetzt')

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { messages } = await req.json()
    if (!messages?.length) throw new Error('messages fehlt')

    const systemMessage = {
      role: 'system',
      content: `Du bist ein KI-Assistent für QuickEnergy mit direktem Datenbankzugriff.

REGELN:
1. Nenne oder beschreibe deine Tools NIEMALS in deiner Antwort — ruf sie einfach auf.
2. Sage NIEMALS, dass du keinen Datenzugriff hast — du hast immer Zugriff über die Tools.
3. Antworte immer auf Deutsch, kurz und direkt.
4. Nach einem Tool-Aufruf: erkläre die Ergebnisse in 1-3 Sätzen.

WICHTIG — Rechnungstypen unterscheiden:
- "von [Name]" / "Eingangsrechnung" / "empfangen" / "Lieferant" → get_eingangsrechnungen (Tabelle: rechnungen, wir haben diese BEKOMMEN)
- "an [Kunde]" / "Ausgangsrechnung" / "gestellt" / "Forderung" → get_ausgangsrechnungen (Tabelle: ausgangsrechnungen, wir haben diese GESTELLT)
- Verwechsle diese NIEMALS. "von Vadim" = Eingangsrechnung.

Welches Tool wann (PFLICHT — sofort aufrufen, nicht erst fragen):
- Umsatz / Einnahmen / Entwicklung → get_umsatz_chart
- Ausgaben / Kosten / Lieferanten → get_ausgaben_chart
- Rechnungen VON jemandem → get_eingangsrechnungen(lieferant_search="...")
- Offene Forderungen / Rechnungen AN Kunden → get_ausgangsrechnungen(status="offen")
- Angebote / Pipeline → get_angebote
- Kunden suchen → get_kunden
- Kunden anlegen → create_kunde
- Angebot erstellen → get_kunden, dann create_angebot
- Rechnung erstellen → get_kunden, dann create_ausgangsrechnung (Leistungsdatum erfragen falls nicht genannt)
- Monatsübersicht / KPI / wie läuft der Monat → get_monats_zusammenfassung
- Was heute zu tun ist / fällige Rechnungen → get_heute_todo
- Eingangsrechnung buchen / Status setzen → set_eingangsrechnung_status
- Ausgangsrechnung bezahlt / storniert → set_ausgangsrechnung_status
- PDF einer Rechnung anzeigen → get_rechnung_pdf
- Lieferanten suchen → get_lieferanten
- Lieferanten anlegen → create_lieferant
- Auftragsbestätigungen → get_auftragsbestatigungen
- Angebot in Auftrag umwandeln → convert_angebot_zu_auftrag
- Kategorien → get_kategorien
- Mitarbeiter → get_mitarbeiter
- Bankbewegungen / Kontoauszug → get_bank_transaktionen
- Angebot annehmen/ablehnen → set_angebot_status
- Angebot kopieren/duplizieren → duplicate_angebot
- Angebot → direkt in Rechnung → convert_angebot_zu_rechnung
- Top-Kunden / beste Kunden nach Umsatz → get_top_kunden_chart
- Jahresvergleich / Vorjahr → get_jahresvergleich
- Skonto / ablaufende Fristen / bald fällig → get_skonto_alarm
- USt-Vorschau / Umsatzsteuer / Zahllast Finanzamt → get_ust_vorschau
- Kunden bearbeiten/aktualisieren → update_kunde

Heute: ${new Date().toLocaleDateString('de-AT')}`,
    }

    let claudeMessages = [systemMessage, ...messages]
    let pendingChart: any = null
    const pendingEntities: any[] = []

    for (let i = 0; i < 5; i++) {
      const res = await fetch(OPENROUTER_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://quickenergy.app',
          'X-Title': 'QuickEnergy KI-Assistent',
        },
        body: JSON.stringify({
          model: MODEL,
          messages: claudeMessages,
          tools: TOOLS,
          tool_choice: 'auto',
        }),
      })

      if (!res.ok) {
        const text = await res.text()
        throw new Error(`OpenRouter API: ${res.status} ${text}`)
      }

      const result = await res.json()
      const choice = result.choices?.[0]
      if (!choice) throw new Error('Keine Antwort von OpenRouter')

      const { finish_reason, message } = choice

      if (finish_reason !== 'tool_calls') {
        const text = message.content ?? ''
        return new Response(
          JSON.stringify({
            reply: text,
            chart: pendingChart,
            entities: pendingEntities.length ? pendingEntities : undefined,
          }),
          { headers: { ...CORS, 'Content-Type': 'application/json' } }
        )
      }

      const toolCalls = message.tool_calls ?? []
      const toolResults: any[] = []

      for (const call of toolCalls) {
        const toolName = call.function.name
        const toolInput = JSON.parse(call.function.arguments)
        const toolResult = await executeTool(toolName, toolInput, supabase)

        // Capture chart data if present
        if (toolResult.chartData) {
          pendingChart = {
            type: toolResult.chartType,
            title: toolResult.chartTitle,
            data: toolResult.chartData,
          }
        }

        // Collect entity references, strip before sending to model
        const { _entities, ...cleanResult } = toolResult
        if (_entities) pendingEntities.push(..._entities)

        toolResults.push({
          role: 'tool',
          tool_call_id: call.id,
          content: JSON.stringify(cleanResult),
        })
      }

      claudeMessages = [...claudeMessages, message, ...toolResults]
    }

    return new Response(
      JSON.stringify({ reply: 'Zu viele Schritte – bitte erneut versuchen.', chart: null }),
      { headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  }
})
