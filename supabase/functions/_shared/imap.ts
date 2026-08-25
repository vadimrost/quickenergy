// Minimaler IMAP-Client (nur was wir brauchen: LOGIN, SELECT, SEARCH, FETCH, LOGOUT).
// Bewusst ohne npm-Abhängigkeit, damit er in der Supabase/Deno-Laufzeit sicher läuft.

export interface ImapConfig {
  host: string
  port?: number
  user: string
  password: string
}

export interface ImapMail {
  uid: string
  messageId: string | null
  from: string
  subject: string
  date: string | null
  body: string
}

export class ImapClient {
  private conn: Deno.TlsConn | null = null
  private buf = new Uint8Array(0)
  private tag = 0
  private dec = new TextDecoder()
  private enc = new TextEncoder()

  constructor(private cfg: ImapConfig) {}

  async connect(): Promise<void> {
    this.conn = await Deno.connectTls({ hostname: this.cfg.host, port: this.cfg.port ?? 993 })
    await this.readUntil(/^\* OK/m) // Server-Greeting
  }

  async close(): Promise<void> {
    try { if (this.conn) { await this.send('LOGOUT'); this.conn.close() } } catch { /* egal */ }
    this.conn = null
  }

  /** Liest weitere Daten vom Socket in den Puffer. Gibt false bei Verbindungsende. */
  private async fill(): Promise<boolean> {
    if (!this.conn) return false
    const chunk = new Uint8Array(65536)
    const n = await this.conn.read(chunk)
    if (n === null) return false
    const merged = new Uint8Array(this.buf.length + n)
    merged.set(this.buf, 0)
    merged.set(chunk.subarray(0, n), this.buf.length)
    this.buf = merged
    return true
  }

  private async readUntil(re: RegExp, maxMs = 20000): Promise<string> {
    const deadline = Date.now() + maxMs
    for (;;) {
      const text = this.dec.decode(this.buf)
      if (re.test(text)) {
        this.buf = new Uint8Array(0)
        return text
      }
      if (Date.now() > deadline) throw new Error('IMAP: Zeitüberschreitung beim Lesen')
      if (!(await this.fill())) {
        const t = this.dec.decode(this.buf)
        this.buf = new Uint8Array(0)
        return t
      }
    }
  }

  /** Kommando senden und auf die zugehörige Abschlusszeile warten */
  private async send(cmd: string, maxMs = 20000): Promise<string> {
    if (!this.conn) throw new Error('IMAP: nicht verbunden')
    const tag = `a${++this.tag}`
    await this.conn.write(this.enc.encode(`${tag} ${cmd}\r\n`))
    const done = new RegExp(`^${tag} (OK|NO|BAD)`, 'm')
    const res = await this.readUntil(done, maxMs)
    const line = res.split(/\r?\n/).find(l => l.startsWith(`${tag} `)) ?? ''
    if (/^\S+ (NO|BAD)/.test(line)) {
      throw new Error(`IMAP: ${cmd.split(' ')[0]} fehlgeschlagen — ${line.replace(/^\S+ /, '')}`)
    }
    return res
  }

  async login(): Promise<void> {
    const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
    await this.send(`LOGIN "${esc(this.cfg.user)}" "${esc(this.cfg.password)}"`)
  }

  async selectInbox(): Promise<void> {
    await this.send('SELECT INBOX')
  }

  /** UIDs zu einem Suchkriterium, z.B. 'FROM "perspective.co" SINCE 01-Aug-2026' */
  async searchUids(kriterium: string): Promise<string[]> {
    const res = await this.send(`UID SEARCH ${kriterium}`)
    const line = res.split(/\r?\n/).find(l => /^\* SEARCH/i.test(l))
    if (!line) return []
    return line.replace(/^\* SEARCH/i, '').trim().split(/\s+/).filter(Boolean)
  }

  /** Mail per UID holen (ohne sie als gelesen zu markieren — BODY.PEEK) */
  async fetchMail(uid: string): Promise<ImapMail | null> {
    const res = await this.send(`UID FETCH ${uid} (BODY.PEEK[])`, 30000)
    const start = res.indexOf('}\r\n')
    if (start === -1) return null
    const roh = res.slice(start + 3)
    const kopfEnde = roh.search(/\r?\n\r?\n/)
    const kopf = kopfEnde === -1 ? roh : roh.slice(0, kopfEnde)
    const kopfUnfold = kopf.replace(/\r?\n[ \t]+/g, ' ')
    const h = (name: string): string | null => {
      const m = kopfUnfold.match(new RegExp(`^${name}:\\s*(.+)$`, 'im'))
      return m ? m[1].trim() : null
    }
    return {
      uid,
      messageId: h('Message-ID'),
      from:      h('From') ?? '',
      subject:   decodeHeader(h('Subject') ?? ''),
      date:      h('Date'),
      body:      roh,
    }
  }
}

/** MIME-kodierte Header dekodieren (=?UTF-8?B?...?= / =?UTF-8?Q?...?=) */
export function decodeHeader(s: string): string {
  return s.replace(/=\?([^?]+)\?([BQ])\?([^?]*)\?=/gi, (_, _cs, enc, data) => {
    try {
      if (enc.toUpperCase() === 'B') {
        const bin = atob(data)
        const bytes = Uint8Array.from(bin, c => c.charCodeAt(0))
        return new TextDecoder('utf-8').decode(bytes)
      }
      const txt = data.replace(/_/g, ' ')
      const bytes: number[] = []
      for (let i = 0; i < txt.length; i++) {
        if (txt[i] === '=' && /^[0-9A-F]{2}$/i.test(txt.substr(i + 1, 2))) {
          bytes.push(parseInt(txt.substr(i + 1, 2), 16)); i += 2
        } else {
          for (const b of new TextEncoder().encode(txt[i])) bytes.push(b)
        }
      }
      return new TextDecoder('utf-8').decode(new Uint8Array(bytes))
    } catch {
      return data
    }
  })
}

/**
 * Aus einer rohen Mail den lesbaren Textteil holen.
 * Bevorzugt text/plain, fällt auf text/html zurück; dekodiert base64.
 */
export function extractBody(roh: string): string {
  const grenzeMatch = roh.match(/boundary="?([^";\r\n]+)"?/i)
  if (!grenzeMatch) return decodeTeil(roh)

  const grenze = `--${grenzeMatch[1]}`
  const teile = roh.split(grenze).slice(1, -1)
  let html = ''
  for (const teil of teile) {
    const istPlain = /content-type:\s*text\/plain/i.test(teil)
    const istHtml  = /content-type:\s*text\/html/i.test(teil)
    if (!istPlain && !istHtml) continue
    const inhalt = decodeTeil(teil)
    if (istPlain && inhalt.trim()) return inhalt
    if (istHtml && !html) html = inhalt
  }
  return html || decodeTeil(roh)
}

function decodeTeil(teil: string): string {
  const trennerIdx = teil.search(/\r?\n\r?\n/)
  const kopf = trennerIdx === -1 ? '' : teil.slice(0, trennerIdx)
  const koerper = trennerIdx === -1 ? teil : teil.slice(trennerIdx).replace(/^\r?\n\r?\n/, '')
  if (/content-transfer-encoding:\s*base64/i.test(kopf)) {
    try {
      const bin = atob(koerper.replace(/\s+/g, ''))
      return new TextDecoder('utf-8').decode(Uint8Array.from(bin, c => c.charCodeAt(0)))
    } catch {
      return koerper
    }
  }
  return koerper
}

/** Datum im IMAP-Format (z.B. 01-Aug-2026) */
export function imapDate(d: Date): string {
  const m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${String(d.getDate()).padStart(2, '0')}-${m[d.getMonth()]}-${d.getFullYear()}`
}
