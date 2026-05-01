import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, ExternalLink } from 'lucide-react'
import { useRechnung } from '@/features/inbox/useRechnungen'
import { useDuplikate } from './useBuchung'
import { PdfViewer } from './PdfViewer'
import { SkontoAlert } from './SkontoAlert'
import { DuplikatWarning } from './DuplikatWarning'
import { ExtrahierteFelder } from './ExtrahierteFelder'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { ProjectColorDot } from '@/components/shared/ProjectColorDot'
import { Skeleton } from '@/components/ui/skeleton'
import type { RechnungStatus } from '@/types/database'

const STATUS_VARIANT: Record<RechnungStatus, Parameters<typeof StatusBadge>[0]['variant']> = {
  eingegangen: 'info',
  geprüft: 'warning',
  gebucht: 'active',
  bezahlt: 'done',
}

const STATUS_LABEL: Record<RechnungStatus, string> = {
  eingegangen: 'Eingegangen',
  geprüft: 'Geprüft',
  gebucht: 'Gebucht',
  bezahlt: 'Bezahlt',
}

export function BuchungPage() {
  const { id = '' } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: rechnung, isLoading } = useRechnung(id)
  const { data: duplikate = [] } = useDuplikate(id)


  return (
    // Break out of AppLayout padding using negative margins
    <div className="-mx-10 -my-8 flex h-screen overflow-hidden bg-bg-base">

      {/* LEFT: PDF Panel */}
      <div className="flex flex-col w-[52%] h-full border-r border-border bg-bg-surface">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-3.5 border-b border-border flex-shrink-0">
          <button
            onClick={() => navigate('/')}
            className="w-8 h-8 rounded-xl flex items-center justify-center text-ink-muted hover:bg-bg-muted transition-colors"
          >
            <ArrowLeft size={16} />
          </button>
          {isLoading ? (
            <Skeleton className="h-5 w-48" />
          ) : rechnung ? (
            <>
              <ProjectColorDot id={rechnung.id} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-ink truncate">
                    {rechnung.lieferant?.name ?? 'Unbekannter Lieferant'}
                  </span>
                  <StatusBadge
                    variant={STATUS_VARIANT[rechnung.status]}
                    label={STATUS_LABEL[rechnung.status]}
                  />
                </div>
                <div className="text-xs text-ink-muted font-mono">{rechnung.rechnungsnr}</div>
              </div>
              {rechnung.pdf_url && (
                <a
                  href={rechnung.pdf_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-ink-muted hover:bg-bg-muted transition-colors"
                >
                  <ExternalLink size={13} />
                </a>
              )}
            </>
          ) : null}
        </div>

        {/* PDF */}
        <div className="flex-1 overflow-hidden">
          {isLoading ? (
            <div className="h-full flex items-center justify-center">
              <div className="w-8 h-8 border-2 border-accent-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : rechnung ? (
            <PdfViewer url={rechnung.pdf_url} ocrJson={rechnung.ocr_json} />
          ) : null}
        </div>
      </div>

      {/* RIGHT: Fields Panel */}
      <div className="flex-1 h-full overflow-y-auto">
        <div className="px-7 py-6">
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-28 w-full" />)}
            </div>
          ) : rechnung ? (
            <>
              {rechnung.skonto_datum && rechnung.skonto_prozent && (
                <SkontoAlert
                  skontoDatum={rechnung.skonto_datum}
                  skontoProzent={rechnung.skonto_prozent}
                  betrag={rechnung.betrag}
                />
              )}
              <DuplikatWarning duplikate={duplikate} currentId={id} />
              <ExtrahierteFelder rechnung={rechnung} />
            </>
          ) : (
            <div className="text-sm text-ink-muted text-center py-12">
              Rechnung nicht gefunden
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
