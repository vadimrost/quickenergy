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
      name: 'get_ausgangsrechnungen',
      description: 'Listet Ausgangsrechnungen auf, optional gefiltert nach Status.',
      parameters: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['entwurf', 'offen', 'bezahlt', 'ueberfaellig', 'storniert'] },
          limit: { type: 'number' },
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
    return { kunden: data }
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
    return { success: true, angebot_id: angebot.id, angebotsnummer: angebot.angebotsnummer }
  }

  if (name === 'get_angebote') {
    let query = supabase
      .from('angebote')
      .select('id, angebotsnummer, betreff, status, summe_brutto, angebotsdatum, kunde:kunden(firmenname, nachname)')
      .order('created_at', { ascending: false }).limit(input.limit ?? 10)
    if (input.status) query = query.eq('status', input.status)
    const { data, error } = await query
    if (error) return { error: error.message }
    return { angebote: data }
  }

  if (name === 'get_ausgangsrechnungen') {
    let query = supabase
      .from('ausgangsrechnungen')
      .select('id, rechnungsnummer, betreff, status, summe_brutto, rechnungsdatum, kunde:kunden(firmenname, nachname)')
      .order('created_at', { ascending: false }).limit(input.limit ?? 10)
    if (input.status) query = query.eq('status', input.status)
    const { data, error } = await query
    if (error) return { error: error.message }
    return { rechnungen: data }
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

Welches Tool wann (PFLICHT — sofort aufrufen, nicht erst fragen):
- Umsatz / Einnahmen / Entwicklung → get_umsatz_chart
- Ausgaben / Kosten / Lieferanten → get_ausgaben_chart
- Offene Rechnungen / Forderungen → get_ausgangsrechnungen(status="offen")
- Angebote / Pipeline → get_angebote
- Kunden suchen → get_kunden
- Angebot erstellen → get_kunden, dann create_angebot

Heute: ${new Date().toLocaleDateString('de-AT')}`,
    }

    let claudeMessages = [systemMessage, ...messages]
    let pendingChart: any = null

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
          JSON.stringify({ reply: text, chart: pendingChart }),
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

        toolResults.push({
          role: 'tool',
          tool_call_id: call.id,
          content: JSON.stringify(toolResult),
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
