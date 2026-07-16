import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Empfängt den Perspective-Webhook "Neuer Lead" und schreibt ihn in die leads-Tabelle.
// Deploy:  supabase functions deploy perspective-lead --no-verify-jwt
// Secret (optional, empfohlen):  supabase secrets set PERSPECTIVE_WEBHOOK_SECRET=<zufallswert>
//   → dann als Webhook-URL:  https://<projekt>.supabase.co/functions/v1/perspective-lead?secret=<zufallswert>

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

// Alle Blatt-Werte eines (ggf. verschachtelten) Objekts einsammeln, Schlüssel normalisiert.
function collectFields(obj: unknown, map: Record<string, unknown> = {}): Record<string, unknown> {
  if (!obj || typeof obj !== 'object') return map
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (v && typeof v === 'object') {
      collectFields(v, map)
    } else {
      const nk = k.toLowerCase().replace(/[^a-z0-9]/g, '')
      if (map[nk] === undefined && v !== null && v !== '') map[nk] = v
    }
  }
  return map
}

const str = (v: unknown): string | null => {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s === '' ? null : s
}

function pick(map: Record<string, unknown>, aliases: string[]): string | null {
  for (const a of aliases) {
    const nk = a.toLowerCase().replace(/[^a-z0-9]/g, '')
    if (map[nk] !== undefined) return str(map[nk])
  }
  return null
}

function parseBool(v: string | null): boolean | null {
  if (v === null) return null
  const s = v.toLowerCase()
  if (['ja', 'yes', 'true', '1', 'wahr'].includes(s)) return true
  if (['nein', 'no', 'false', '0', 'falsch'].includes(s)) return false
  return null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Nur POST' }, 405)

  // Optionaler Schutz per Shared Secret (Query-Param ?secret= oder Header x-webhook-secret)
  const expected = Deno.env.get('PERSPECTIVE_WEBHOOK_SECRET')
  if (expected) {
    const url = new URL(req.url)
    const provided = url.searchParams.get('secret') ?? req.headers.get('x-webhook-secret')
    if (provided !== expected) return json({ error: 'Ungültiges Secret' }, 401)
  }

  let payload: unknown
  try {
    payload = await req.json()
  } catch {
    return json({ error: 'Kein gültiges JSON' }, 400)
  }

  const f = collectFields(payload)

  // Vollständigen Namen ggf. aufteilen, falls keine getrennten Felder da sind
  let vorname = pick(f, ['vorname', 'firstname', 'first', 'firstName', 'givenname'])
  let nachname = pick(f, ['nachname', 'lastname', 'last', 'surname', 'familyname'])
  const fullName = pick(f, ['name', 'fullname', 'vollername', 'vollständigername'])
  if (!vorname && !nachname && fullName && fullName.includes(' ')) {
    const parts = fullName.split(/\s+/)
    vorname = parts.shift() ?? null
    nachname = parts.join(' ') || null
  } else if (!vorname && fullName) {
    vorname = fullName
  }

  const lead = {
    vorname,
    nachname,
    email:            pick(f, ['email', 'mail', 'emailaddress', 'emailadresse', 'mailadresse', 'e-mail']),
    telefon:          pick(f, ['telefon', 'phone', 'telefonnummer', 'tel', 'mobil', 'handynummer', 'phonenumber']),
    plz:              pick(f, ['plz', 'zip', 'postleitzahl', 'postalcode', 'zipcode']),
    bundesland:       pick(f, ['bundesland', 'state', 'region']),
    anlagenort:       pick(f, ['anlagenort', 'ort', 'standort', 'adresse', 'stadt', 'city']),
    anlagengroesse:   pick(f, ['anlagengroesse', 'anlagengrosse', 'groesse', 'grosse', 'kwp', 'leistung', 'size']),
    batteriespeicher: parseBool(pick(f, ['batteriespeicher', 'speicher', 'battery', 'batterie'])),
    umsetzung:        pick(f, ['umsetzung', 'zeitraum', 'timeline', 'zeitpunkt']),
    utm_source:       pick(f, ['utmsource', 'utm_source']),
    utm_medium:       pick(f, ['utmmedium', 'utm_medium']),
    utm_campaign:     pick(f, ['utmcampaign', 'utm_campaign']),
    utm_term:         pick(f, ['utmterm', 'utm_term']),
    utm_content:      pick(f, ['utmcontent', 'utm_content']),
    utm_id:           pick(f, ['utmid', 'utm_id']),
    status:           'neu',
    quelle:           'perspective',
    raw_payload:      payload,
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const { data, error } = await supabase.from('leads').insert(lead).select('id').single()
  if (error) {
    console.error('leads insert:', error.message)
    return json({ error: error.message }, 500)
  }

  return json({ ok: true, id: data.id })
})
