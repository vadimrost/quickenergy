import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { ImapClient, extractBody, imapDate } from '../_shared/imap.ts'
import { parsePerspectiveLeadEmail } from '../_shared/perspectiveLeadParser.ts'

// Holt Perspective-"Neuer Lead"-Mails per IMAP ab und legt daraus Leads an.
//
// Deploy:  supabase functions deploy perspective-imap --no-verify-jwt
// Secrets: supabase secrets set IMAP_HOST=mail.spacemail.com IMAP_PORT=993 \
//            IMAP_USER=... IMAP_PASSWORD=... IMAP_CRON_SECRET=<zufallswert>
//
// Aufruf:
//   ?test=1   → nur verbinden, suchen, erste Mail parsen. Schreibt NICHTS.
//   ?tage=14  → wie weit zurück gesucht wird (Standard 7)
//
// Doppelte Leads werden über leads.quelle_ref (Message-ID) verhindert — deshalb
// muss die Mail NICHT als gelesen markiert werden. Das ist wichtig, weil n8n
// dasselbe Postfach für Rechnungen nutzt.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
}

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b, null, 2), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const url = new URL(req.url)
  const testModus = url.searchParams.get('test') === '1'
  const tage = Math.min(90, Math.max(1, Number(url.searchParams.get('tage') ?? '7')))

  // Optionaler Schutz, damit die Function nicht offen im Netz steht
  const secret = Deno.env.get('IMAP_CRON_SECRET')
  if (secret) {
    const geliefert = url.searchParams.get('secret') ?? req.headers.get('x-cron-secret')
    if (geliefert !== secret) return json({ error: 'Ungültiges Secret' }, 401)
  }

  const host = Deno.env.get('IMAP_HOST')
  const user = Deno.env.get('IMAP_USER')
  const password = Deno.env.get('IMAP_PASSWORD')
  if (!host || !user || !password) {
    return json({ error: 'IMAP_HOST / IMAP_USER / IMAP_PASSWORD nicht gesetzt' }, 500)
  }

  const client = new ImapClient({
    host,
    port: Number(Deno.env.get('IMAP_PORT') ?? '993'),
    user,
    password,
  })

  const schritte: string[] = []
  try {
    await client.connect();       schritte.push('verbunden')
    await client.login();         schritte.push('eingeloggt')
    await client.selectInbox();   schritte.push('INBOX geöffnet')

    const seit = new Date(Date.now() - tage * 86400000)
    const uids = await client.searchUids(`FROM "perspective.co" SINCE ${imapDate(seit)}`)
    schritte.push(`${uids.length} Mail(s) gefunden`)

    if (uids.length === 0) {
      await client.close()
      return json({ ok: true, testModus, schritte, gefunden: 0, angelegt: 0 })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Bereits verarbeitete UIDs überspringen. Ohne das würde jeder Lauf dieselben
    // neuesten Mails ansehen und ältere nie erreichen (beim Erstimport relevant).
    const { data: bekannt } = await supabase
      .from('leads')
      .select('raw_payload')
      .eq('quelle', 'perspective')
      .limit(5000)
    const bekannteUids = new Set(
      (bekannt ?? [])
        .map(r => (r.raw_payload as { uid?: string } | null)?.uid)
        .filter(Boolean) as string[],
    )

    const offen = uids.filter(u => !bekannteUids.has(u))
    schritte.push(`${offen.length} davon noch nicht verarbeitet`)

    // Neueste zuerst (aktuelle Leads zuerst im CRM), pro Lauf begrenzt
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') ?? '40')))
    const zuVerarbeiten = testModus ? offen.slice(-1) : offen.slice(-limit).reverse()

    let angelegt = 0, uebersprungen = 0
    const beispiele: unknown[] = []

    for (const uid of zuVerarbeiten) {
      const mail = await client.fetchMail(uid)
      if (!mail) continue
      if (!/neuer lead/i.test(mail.subject) && !/perspective/i.test(mail.from)) continue

      const text = extractBody(mail.body)
      const lead = parsePerspectiveLeadEmail(text)
      const name = [lead.vorname, lead.nachname].filter(Boolean).join(' ')
      if (!lead.email && !lead.telefon && !name) { uebersprungen++; continue }

      if (testModus) {
        const { felder, ...rest } = lead
        beispiele.push({ betreff: mail.subject, datum: mail.date, erkannt: rest, zusatzfelder: felder })
        continue
      }

      const { felder, funnel, ...rest } = lead
      const notizZeilen = Object.entries(felder)
        .filter(([k]) => !/^(Deine|Ihre|Ihr) (E-Mail|Telefonnummer|Name)/i.test(k) && !/^utm/i.test(k))
        .map(([k, v]) => `${k}: ${v}`)

      const { error } = await supabase.from('leads').insert({
        ...rest,
        status: 'neu',
        notiz: [funnel ? `Funnel: ${funnel}` : null, ...notizZeilen].filter(Boolean).join('\n') || null,
        quelle: 'perspective',
        quelle_ref: mail.messageId ?? `uid:${uid}`,
        raw_payload: { uid, funnel, felder, betreff: mail.subject, datum: mail.date },
      })

      if (error) {
        // 23505 = unique violation → Lead gab es schon, das ist der Normalfall
        if (error.code === '23505') uebersprungen++
        else console.error('leads insert:', error.message)
      } else {
        angelegt++
      }
    }

    await client.close()
    return json({ ok: true, testModus, schritte, gefunden: uids.length, angelegt, uebersprungen, ...(testModus ? { beispiele } : {}) })
  } catch (e) {
    await client.close()
    return json({ ok: false, schritte, error: e instanceof Error ? e.message : String(e) }, 500)
  }
})
