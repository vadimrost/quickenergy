import { requireUser, AuthError } from '../_shared/auth.ts'

// Zwischenstelle fuer die PDF-OCR des Dashboards. Der OpenRouter-Key liegt nur
// hier (Supabase Secret) und nie mehr im Browser-Bundle. Modell und Plugins sind
// fest — die Function ist kein allgemeiner OpenRouter-Durchlass.

const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY')!
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
const OCR_MODEL = 'google/gemini-3.5-flash'
const MAX_PDF_BYTES = 20 * 1024 * 1024

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Nur POST' }, 405)

  try {
    if (!OPENROUTER_API_KEY) return json({ error: 'OPENROUTER_API_KEY nicht gesetzt' }, 500)

    const user = await requireUser(req)

    const { prompt, pdfBase64 } = await req.json() as { prompt?: string; pdfBase64?: string }
    if (typeof prompt !== 'string' || !prompt.trim()) return json({ error: 'prompt fehlt' }, 400)
    if (typeof pdfBase64 !== 'string' || !pdfBase64) return json({ error: 'pdfBase64 fehlt' }, 400)
    // base64 → ~3/4 Bytes
    if (pdfBase64.length * 0.75 > MAX_PDF_BYTES) return json({ error: 'PDF zu gross (max. 20 MB)' }, 413)

    const upstream = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://dashboard.quickenergy.at',
        'X-Title': 'QuickEnergy OCR',
      },
      body: JSON.stringify({
        model: OCR_MODEL,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'text',
              text: `${prompt}\n\nAntworte ausschließlich mit einem validen JSON-Objekt. Keine Markdown-Codeblöcke, keine Erklärungen.`,
            },
            {
              type: 'file',
              file: { filename: 'document.pdf', file_data: `data:application/pdf;base64,${pdfBase64}` },
            },
          ],
        }],
        plugins: [{ id: 'file-parser', pdf: { engine: 'native' } }],
        response_format: { type: 'json_object' },
        temperature: 0,
        // Fuer die OpenRouter-Aktivitaet: welcher Nutzer hat den Aufruf ausgeloest
        user: user.email ?? user.id,
      }),
    })

    // Antwort 1:1 durchreichen — der Client parst choices[0].message.content wie bisher
    const body = await upstream.text()
    return new Response(body, {
      status: upstream.status,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    if (e instanceof AuthError) return json({ error: e.message }, 401)
    return json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})
