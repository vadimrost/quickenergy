import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY')!
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
const MODEL = 'anthropic/claude-3-haiku'

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
      description: 'Erstellt ein neues Angebot mit Positionen in der Datenbank. Gibt Angebotsnummer und ID zurück.',
      parameters: {
        type: 'object',
        required: ['kunde_id', 'betreff', 'positionen'],
        properties: {
          kunde_id: { type: 'string', description: 'UUID des Kunden aus get_kunden' },
          betreff: { type: 'string', description: 'Betreff des Angebots' },
          positionen: {
            type: 'array',
            description: 'Positionen des Angebots',
            items: {
              type: 'object',
              required: ['bezeichnung', 'menge', 'einzelpreis_netto', 'einheit', 'ust_satz'],
              properties: {
                bezeichnung: { type: 'string' },
                menge: { type: 'number' },
                einzelpreis_netto: { type: 'number', description: 'Netto-Einzelpreis in Euro' },
                einheit: { type: 'string', enum: ['Stk', 'Std', 'm²', 'lfm', 'kWp', 'kWh', 'pausch', 'Set'] },
                ust_satz: { type: 'number', enum: [0, 10, 20] },
                rabatt_prozent: { type: 'number', description: 'Rabatt in Prozent, Standard 0' },
              },
            },
          },
          kopftext: { type: 'string', description: 'Optionaler Einleitungstext' },
          fusstext: { type: 'string', description: 'Optionaler Abschlusstext' },
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
          limit: { type: 'number', description: 'Maximale Anzahl, Standard 10' },
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
          limit: { type: 'number', description: 'Standard 10' },
        },
      },
    },
  },
]

async function executeTool(name: string, input: any, supabase: any): Promise<any> {
  if (name === 'get_kunden') {
    let query = supabase
      .from('kunden')
      .select('id, firmenname, vorname, nachname, ort, uid_nr')
      .limit(10)
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
        kunde_id,
        betreff,
        angebotsdatum: today,
        kopftext: kopftext ?? null,
        fusstext: fusstext ?? null,
        summe_netto_20: summen.netto_20,
        summe_netto_10: summen.netto_10,
        summe_netto_0: summen.netto_0,
        ust_20: summen.ust_20,
        ust_10: summen.ust_10,
        summe_brutto: summen.brutto,
      })
      .select('id, angebotsnummer')
      .single()

    if (angebotErr) return { error: angebotErr.message }

    if (positionen.length > 0) {
      const { error: posErr } = await supabase.from('dokument_positionen').insert(
        positionen.map((p: any, i: number) => ({
          dokument_id: angebot.id,
          dokument_typ: 'angebot',
          reihenfolge: i,
          bezeichnung: p.bezeichnung,
          beschreibung: p.beschreibung ?? null,
          menge: p.menge,
          einheit: p.einheit,
          einzelpreis_netto: p.einzelpreis_netto,
          ust_satz: p.ust_satz,
          rabatt_prozent: p.rabatt_prozent ?? 0,
          zeilenbetrag_netto: p.menge * p.einzelpreis_netto * (1 - (p.rabatt_prozent ?? 0) / 100),
        }))
      )
      if (posErr) return { error: posErr.message }
    }

    return {
      success: true,
      angebot_id: angebot.id,
      angebotsnummer: angebot.angebotsnummer,
    }
  }

  if (name === 'get_angebote') {
    let query = supabase
      .from('angebote')
      .select('id, angebotsnummer, betreff, status, summe_brutto, angebotsdatum, kunde:kunden(firmenname, nachname)')
      .order('created_at', { ascending: false })
      .limit(input.limit ?? 10)
    if (input.status) query = query.eq('status', input.status)
    const { data, error } = await query
    if (error) return { error: error.message }
    return { angebote: data }
  }

  if (name === 'get_ausgangsrechnungen') {
    let query = supabase
      .from('ausgangsrechnungen')
      .select('id, rechnungsnummer, betreff, status, summe_brutto, rechnungsdatum, kunde:kunden(firmenname, nachname)')
      .order('created_at', { ascending: false })
      .limit(input.limit ?? 10)
    if (input.status) query = query.eq('status', input.status)
    const { data, error } = await query
    if (error) return { error: error.message }
    return { rechnungen: data }
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
      content: `Du bist ein KI-Assistent für QuickEnergy, ein internes Dashboard für Auftragsmanagement.
Du kannst Angebote erstellen, Kunden suchen und Auftrags- sowie Rechnungsdaten abrufen.
Antworte immer kurz und präzise auf Deutsch.
Wenn du ein Angebot erstellst, teile die Angebotsnummer und die ID mit (Format: "Angebot AN-XXXX (ID: uuid) wurde erstellt").
Heute ist: ${new Date().toLocaleDateString('de-AT')}`,
    }

    let claudeMessages = [systemMessage, ...messages]

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

      // No tool calls → return text
      if (finish_reason !== 'tool_calls') {
        const text = message.content ?? ''
        return new Response(JSON.stringify({ reply: text }), {
          headers: { ...CORS, 'Content-Type': 'application/json' },
        })
      }

      // Execute tool calls
      const toolCalls = message.tool_calls ?? []
      const toolResults: any[] = []

      for (const call of toolCalls) {
        const toolName = call.function.name
        const toolInput = JSON.parse(call.function.arguments)
        const toolResult = await executeTool(toolName, toolInput, supabase)

        toolResults.push({
          role: 'tool',
          tool_call_id: call.id,
          content: JSON.stringify(toolResult),
        })
      }

      // Append assistant message + tool results
      claudeMessages = [
        ...claudeMessages,
        message,
        ...toolResults,
      ]
    }

    return new Response(JSON.stringify({ reply: 'Zu viele Schritte – bitte erneut versuchen.' }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), {
      status: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
