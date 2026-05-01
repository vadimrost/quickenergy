import { useState } from 'react'
import { ArrowUpFromLine } from 'lucide-react'
import { useTriggerExport } from './useExports'
import type { ExportZiel } from '@/types/database'
import { cn } from '@/lib/utils'

interface ExportButtonProps {
  rechnungIds: string[]
  ziel: ExportZiel
  disabled?: boolean
  className?: string
}

const LABELS: Record<ExportZiel, string> = {
  lexoffice: 'sevDesk',
  datev: 'DATEV',
}

const STYLES: Record<ExportZiel, string> = {
  lexoffice: 'bg-accent-500 hover:bg-accent-600 text-white',
  datev: 'bg-ink hover:bg-ink/90 text-white',
}

export function ExportButton({ rechnungIds, ziel, disabled, className }: ExportButtonProps) {
  const [confirmed, setConfirmed] = useState(false)
  const { mutate, isPending } = useTriggerExport()

  const handleClick = () => {
    if (!confirmed) {
      setConfirmed(true)
      setTimeout(() => setConfirmed(false), 3000)
      return
    }
    mutate({ rechnungIds, ziel })
    setConfirmed(false)
  }

  return (
    <button
      onClick={handleClick}
      disabled={disabled || isPending || !rechnungIds.length}
      className={cn(
        'inline-flex items-center gap-2 px-4 py-2 rounded-card-sm text-sm font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed',
        confirmed ? 'bg-status-warning text-white' : STYLES[ziel],
        className
      )}
    >
      <ArrowUpFromLine size={14} />
      {isPending
        ? 'Wird exportiert…'
        : confirmed
        ? `Bestätigen (${rechnungIds.length} Rechnungen)?`
        : `${LABELS[ziel]}-Export`}
    </button>
  )
}
