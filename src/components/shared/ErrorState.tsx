import { WifiOff, RefreshCw } from 'lucide-react'

interface ErrorStateProps {
  title?: string
  description?: string
  onRetry?: () => void
}

export function ErrorState({
  title = 'Verbindungsfehler',
  description = 'Supabase ist nicht erreichbar. Bitte Internetverbindung prüfen.',
  onRetry,
}: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
      <div className="w-12 h-12 rounded-xl bg-status-danger/10 flex items-center justify-center">
        <WifiOff size={22} className="text-status-danger" />
      </div>
      <div>
        <p className="text-sm font-semibold text-ink mb-1">{title}</p>
        <p className="text-xs text-ink-muted max-w-xs">{description}</p>
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-card-sm text-sm font-medium border border-border hover:bg-bg-muted transition-colors text-ink-muted"
        >
          <RefreshCw size={13} />
          Erneut versuchen
        </button>
      )}
    </div>
  )
}
