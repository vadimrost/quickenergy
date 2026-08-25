import { useState } from 'react'
import { Loader2, ClipboardPaste } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { parsePerspectiveLeadEmail } from '@/lib/perspective-lead-parser'
import { useCreateLead } from './useLeads'

/**
 * Perspective-Lead aus einer Benachrichtigungsmail übernehmen:
 * Mail-Text (oder HTML-Quelltext) einfügen → Felder werden erkannt → Lead anlegen.
 */
export function PerspectiveImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [text, setText] = useState('')
  const { mutateAsync: createLead, isPending } = useCreateLead()

  const parsed = text.trim() ? parsePerspectiveLeadEmail(text) : null
  const name = [parsed?.vorname, parsed?.nachname].filter(Boolean).join(' ')
  const kannAnlegen = Boolean(parsed && (parsed.email || parsed.telefon || name))

  const handleImport = async () => {
    if (!parsed || !kannAnlegen) return
    const { felder, funnel, ...rest } = parsed
    const notizZeilen = Object.entries(felder)
      .filter(([k]) => !/^(Deine|Ihre|Ihr) (E-Mail|Telefonnummer|Name)/i.test(k) && !/^UTM|^Utm/i.test(k) && !/^funnel$/i.test(k.trim()))
      .map(([k, v]) => `${k}: ${v}`)
    const notiz = [funnel ? `Funnel: ${funnel}` : null, ...notizZeilen].filter(Boolean).join('\n')

    try {
      await createLead({
        ...rest,
        status: 'neu',
        notiz: notiz || null,
        termin_datum: null,
        kunde_id: null,
        kampagne: funnel,
        quelle: 'perspective',
        raw_payload: { funnel, felder },
      } as any)
      toast.success(`Lead angelegt: ${name || parsed.email}`)
      setText('')
      onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lead konnte nicht angelegt werden')
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-2xl bg-white border border-border shadow-xl">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold text-ink">Lead aus Perspective-Mail</DialogTitle>
        </DialogHeader>

        <div className="pt-2 space-y-3">
          <p className="text-xs text-ink-muted">
            Inhalt der „Neuer Lead"-Mail von Perspective hier einfügen — die Felder werden automatisch erkannt.
          </p>

          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder={'Neuer Lead! ✨\n\nFunnel\n…\n\nDeine E-Mail Adresse\n…'}
            rows={10}
            className="w-full rounded-card-sm border border-border bg-bg-surface px-3 py-2 text-sm font-mono text-ink focus:outline-none focus:ring-1 focus:ring-accent-400"
          />

          {parsed && (
            <div className="rounded-card border border-border bg-bg-muted/40 p-3 text-xs space-y-1 max-h-56 overflow-y-auto">
              <p className="label-caps mb-1">Erkannt</p>
              {kannAnlegen ? (
                <>
                  <Zeile label="Name" wert={name} />
                  <Zeile label="E-Mail" wert={parsed.email} />
                  <Zeile label="Telefon" wert={parsed.telefon} />
                  <Zeile label="PLZ / Bundesland" wert={[parsed.plz, parsed.bundesland].filter(Boolean).join(' · ')} />
                  <Zeile label="Anlagenort" wert={parsed.anlagenort} />
                  <Zeile label="Anlagengröße" wert={parsed.anlagengroesse} />
                  <Zeile label="Speicher" wert={parsed.batteriespeicher === null ? null : parsed.batteriespeicher ? 'Ja' : 'Nein'} />
                  <Zeile label="Umsetzung" wert={parsed.umsetzung} />
                  <Zeile label="Kampagne" wert={[parsed.utm_source, parsed.utm_medium].filter(Boolean).join(' / ')} />
                  <Zeile label="Funnel" wert={parsed.funnel} />
                </>
              ) : (
                <p className="text-status-danger">
                  Keine Lead-Daten erkannt — bitte den vollständigen Mail-Text einfügen.
                </p>
              )}
            </div>
          )}

          <div className="flex items-center gap-2 pt-1">
            <button onClick={onClose} className="flex-1 h-9 rounded-card-sm border border-border text-sm text-ink-muted hover:bg-bg-muted transition-colors">
              Abbrechen
            </button>
            <button
              onClick={handleImport}
              disabled={!kannAnlegen || isPending}
              className="flex-1 inline-flex items-center justify-center gap-1.5 h-9 rounded-card-sm bg-ink hover:bg-ink/80 disabled:opacity-40 text-white text-sm font-medium transition-colors"
            >
              {isPending ? <Loader2 size={13} className="animate-spin" /> : <ClipboardPaste size={13} />}
              Lead anlegen
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Zeile({ label, wert }: { label: string; wert: string | null | undefined }) {
  return (
    <div className="flex gap-2">
      <span className="text-ink-muted w-32 shrink-0">{label}</span>
      <span className={wert ? 'text-ink' : 'text-ink-subtle'}>{wert || '—'}</span>
    </div>
  )
}
