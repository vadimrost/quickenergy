// Parser für Perspective "Neuer Lead"-Benachrichtigungsmails (noreply@perspective.co).
// Die Mail besteht aus Label/Wert-Paaren (Label-Zeile, darunter der Wert).
// Bewusst ohne KI und ohne Abhängigkeiten — damit er sowohl in der App als auch
// in einer Supabase Edge Function läuft.

export interface PerspectiveLead {
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
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
  utm_term: string | null
  utm_content: string | null
  utm_id: string | null
  funnel: string | null
  /** Alle erkannten Label/Wert-Paare — auch die, für die es keine Spalte gibt */
  felder: Record<string, string>
}

/** quoted-printable dekodieren (=C3=A4 → ä, weiche Zeilenumbrüche entfernen) */
function decodeQuotedPrintable(s: string): string {
  if (!/=[0-9A-F]{2}/i.test(s)) return s
  const withoutSoftBreaks = s.replace(/=\r?\n/g, '')
  try {
    const bytes: number[] = []
    for (let i = 0; i < withoutSoftBreaks.length; i++) {
      const c = withoutSoftBreaks[i]
      if (c === '=' && /^[0-9A-F]{2}$/i.test(withoutSoftBreaks.substr(i + 1, 2))) {
        bytes.push(parseInt(withoutSoftBreaks.substr(i + 1, 2), 16))
        i += 2
      } else {
        // Einzelnes Zeichen als UTF-8-Bytes anhängen
        for (const b of new TextEncoder().encode(c)) bytes.push(b)
      }
    }
    return new TextDecoder('utf-8').decode(new Uint8Array(bytes))
  } catch {
    return withoutSoftBreaks
  }
}

/** HTML in Text umwandeln; Blockelemente werden zu Zeilenumbrüchen */
function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|td|th|li|h[1-6]|table)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
}

const NORM = (s: string) => s.toLowerCase().replace(/[^a-z0-9äöüß]/g, '')

/** Bekannte Labels → Feldname. Mehrere Schreibweisen pro Feld möglich. */
const LABEL_MAP: Record<string, keyof PerspectiveLead> = {}
const registerLabels = (feld: keyof PerspectiveLead, labels: string[]) => {
  for (const l of labels) LABEL_MAP[NORM(l)] = feld
}

registerLabels('email', ['Deine E-Mail Adresse', 'Ihre E-Mail Adresse', 'E-Mail', 'E-Mail Adresse', 'Email'])
registerLabels('telefon', ['Deine Telefonnummer', 'Ihre Telefonnummer', 'Telefonnummer', 'Telefon'])
registerLabels('plz', ['Ihre Postleitzahl', 'Deine Postleitzahl', 'Postleitzahl', 'PLZ'])
registerLabels('bundesland', ['In welchem Bundesland wohnen Sie?', 'Bundesland'])
registerLabels('anlagenort', ['Wo möchten Sie Ihre PV-Anlage anbringen?', 'Wo möchten Sie die PV-Anlage anbringen?', 'Anlagenort'])
registerLabels('anlagengroesse', ['Welche Anlagengröße passt zu Ihrem Haushalt?', 'Anlagengröße'])
registerLabels('batteriespeicher', ['Brauchen Sie einen Batteriespeicher dazu?', 'Batteriespeicher'])
registerLabels('umsetzung', ['Wann planen Sie die Umsetzung?', 'Umsetzung', 'Zeitraum'])
registerLabels('utm_source', ['UTM Source', 'utm_source'])
registerLabels('utm_medium', ['UTM Medium', 'utm_medium'])
registerLabels('utm_campaign', ['UTM Campaign', 'utm_campaign'])
registerLabels('utm_term', ['UTM Term', 'utm_term'])
registerLabels('utm_content', ['UTM Content', 'utm_content'])
registerLabels('utm_id', ['Utm Id', 'UTM Id', 'utm_id'])
registerLabels('funnel', ['Funnel'])

const NAME_LABELS = new Set([NORM('Ihr Name'), NORM('Dein Name'), NORM('Name'), NORM('Vor- und Nachname')])

/** Zeilen, die keine Werte sind (Grußformel, Footer) — beenden das Parsen */
const STOP = [/^viele grüße/i, /^mit freundlichen grüßen/i, /^team perspective$/i, /^kein großer fan/i, /^jetzt abmelden/i]

function parseBool(v: string): boolean | null {
  const s = v.trim().toLowerCase()
  if (['ja', 'yes', 'true', '1'].includes(s)) return true
  if (['nein', 'no', 'false', '0'].includes(s)) return false
  return null
}

export function parsePerspectiveLeadEmail(raw: string): PerspectiveLead {
  const looksHtml = /<\/?(html|body|div|p|table|br)\b/i.test(raw)
  const text = htmlToText(decodeQuotedPrintable(raw ?? ''))
  const source = looksHtml ? text : decodeQuotedPrintable(raw ?? '')

  const alleZeilen = source.split(/\r?\n/).map(l => l.replace(/\u00a0/g, ' ').trim())
  const lines = alleZeilen.filter(l => l.length > 0)

  // Perspective gliedert die Mail in Bloecke: Label-Zeile, Wert-Zeile(n), Leerzeile.
  // Daraus lassen sich ALLE Felder erfassen — auch solche ohne bekanntes Label
  // (z.B. neue Funnel-Fragen). Sie landen in `felder` und gehen nicht verloren.
  const bloecke: string[][] = []
  let block: string[] = []
  for (const l of alleZeilen) {
    if (l === '') { if (block.length) bloecke.push(block); block = [] }
    else block.push(l)
  }
  if (block.length) bloecke.push(block)

  const felder: Record<string, string> = {}
  const lead: PerspectiveLead = {
    vorname: null, nachname: null, email: null, telefon: null, plz: null,
    bundesland: null, anlagenort: null, anlagengroesse: null, batteriespeicher: null,
    umsetzung: null, utm_source: null, utm_medium: null, utm_campaign: null,
    utm_term: null, utm_content: null, utm_id: null, funnel: null, felder,
  }

  const istLabel = (l: string) => LABEL_MAP[NORM(l)] !== undefined || NAME_LABELS.has(NORM(l))

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (STOP.some(re => re.test(line))) break

    // Variante A: "Label: Wert" in einer Zeile
    const inline = line.match(/^([^:]{2,60}):\s*(.+)$/)
    if (inline && istLabel(inline[1])) {
      setzeFeld(lead, felder, inline[1].trim(), inline[2].trim())
      continue
    }

    // Variante B: Label-Zeile, Wert in der/den Folgezeile(n)
    if (istLabel(line)) {
      const werte: string[] = []
      for (let j = i + 1; j < lines.length; j++) {
        const w = lines[j]
        if (istLabel(w) || STOP.some(re => re.test(w))) break
        werte.push(w)
        // Mehrzeilige Werte nur beim Funnel-Namen erwarten, sonst erste Zeile nehmen
        if (NORM(line) !== NORM('Funnel')) break
      }
      if (werte.length > 0) {
        setzeFeld(lead, felder, line, werte.join(' ').trim())
        i += werte.length
      }
    }
  }

  // Alle übrigen Blöcke als Label/Wert übernehmen (unbekannte Funnel-Fragen).
  // Ein Block ist "Label + Wert(e)", wenn er mindestens zwei Zeilen hat.
  for (const b of bloecke) {
    if (b.length < 2) continue
    const label = b[0].replace(/:$/, '').trim()
    if (STOP.some(re => re.test(label))) continue
    if (felder[label] !== undefined) continue
    const wert = b.slice(1).join(' ').replace(/\s+/g, ' ').trim()
    if (!wert || STOP.some(re => re.test(wert))) continue
    // Überschriften/Fließtext aussortieren: echte Labels sind kurz
    if (label.length > 90) continue
    // Reste des IMAP-Protokolls bzw. MIME-Grenzen sind keine Felder
    if (/^[)(\-.]+$/.test(label) || /^(a\d+ (OK|NO|BAD)|--)/i.test(label) || /^a\d+ (OK|NO|BAD)/i.test(wert)) continue
    felder[label] = wert
  }

  // Fallbacks, falls Labels fehlen: E-Mail und Telefon aus dem Text ziehen
  if (!lead.email) {
    const m = source.match(/[\w.+-]+@[\w-]+\.[\w.]{2,}/)
    if (m && !/perspective\.co$/i.test(m[0])) lead.email = m[0]
  }
  if (!lead.telefon) {
    const m = source.match(/\+?\d[\d\s/()-]{7,}\d/)
    if (m) lead.telefon = m[0].trim()
  }

  return lead
}

function setzeFeld(lead: PerspectiveLead, felder: Record<string, string>, label: string, wert: string) {
  const clean = wert.replace(/\s+/g, ' ').trim()
  if (!clean) return
  felder[label.replace(/:$/, '').trim()] = clean

  if (NAME_LABELS.has(NORM(label))) {
    const teile = clean.split(/\s+/)
    if (teile.length >= 2) {
      lead.vorname = teile.slice(0, -1).join(' ')
      lead.nachname = teile[teile.length - 1]
    } else {
      lead.vorname = clean
    }
    return
  }

  const feld = LABEL_MAP[NORM(label)]
  if (!feld) return
  if (feld === 'batteriespeicher') {
    lead.batteriespeicher = parseBool(clean)
  } else if (feld !== 'felder') {
    // Telefon: Formatierung beibehalten, aber Link-Reste entfernen
    ;(lead as any)[feld] = feld === 'telefon' ? clean.replace(/^tel:/i, '').trim() : clean
  }
}
