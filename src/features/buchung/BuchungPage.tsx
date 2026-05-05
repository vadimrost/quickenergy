import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, ExternalLink, FileText, AlignLeft } from 'lucide-react'
import { useRechnung } from '@/features/inbox/useRechnungen'
import { useDuplikate } from './useBuchung'
import { PdfViewer } from './PdfViewer'
import { SkontoAlert } from './SkontoAlert'
import { DuplikatWarning } from './DuplikatWarning'
import { ExtrahierteFelder } from './ExtrahierteFelder'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { ProjectColorDot } from '@/components/shared/ProjectColorDot'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
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

type MobileTab = 'pdf' | 'details'

export function BuchungPage() {
  const { id = '' } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: rechnung, isLoading } = useRechnung(id)
  const { data: duplikate = [] } = useDuplikate(id)
  const [mobileTab, setMobileTab] = useState<MobileTab>('details')

  const header = (
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
                {rechnung.lieferant?.name ?? (rechnung.ocr_json as any)?.supplier_name ?? 'Unbekannter Lieferant'}
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
  )

  const detailContent = (
    <div className="px-5 py-6 md:px-7">
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
  )

  return (
    <>
      {/* Mobile layout — fixed overlay so it's fully independent of AppLayout padding */}
      <div className="md:hidden fixed inset-0 bottom-16 flex flex-col bg-bg-base z-40">
        {header}

        {/* Mobile tab bar */}
        <div className="flex border-b border-border flex-shrink-0">
          <button
            onClick={() => setMobileTab('details')}
            className={cn(
              'flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors border-b-2 -mb-px',
              mobileTab === 'details'
                ? 'border-accent-500 text-accent-600'
                : 'border-transparent text-ink-muted hover:text-ink'
            )}
          >
            <AlignLeft size={15} />
            Details
          </button>
          <button
            onClick={() => setMobileTab('pdf')}
            className={cn(
              'flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors border-b-2 -mb-px',
              mobileTab === 'pdf'
                ? 'border-accent-500 text-accent-600'
                : 'border-transparent text-ink-muted hover:text-ink'
            )}
          >
            <FileText size={15} />
            PDF
          </button>
        </div>

        {mobileTab === 'details' ? (
          <div className="flex-1 overflow-y-auto">
            {detailContent}
          </div>
        ) : (
          <div className="flex-1 overflow-hidden">
            {isLoading ? (
              <div className="h-full flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-accent-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : rechnung ? (
              <PdfViewer url={rechnung.pdf_url} ocrJson={rechnung.ocr_json} />
            ) : null}
          </div>
        )}
      </div>

      {/* Desktop layout */}
      <div className="hidden md:flex -mx-10 -my-8 h-screen overflow-hidden bg-bg-base">
        {/* LEFT: PDF Panel */}
        <div className="flex flex-col w-[52%] h-full border-r border-border bg-bg-surface">
          {header}
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
          {detailContent}
        </div>
      </div>
    </>
  )
}
