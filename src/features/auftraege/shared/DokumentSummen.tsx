import { formatEuro } from '@/lib/utils'
import type { Summen } from './positionenUtils'

interface Props {
  summen: Summen
  rabattGesamt?: number
}

export function DokumentSummen({ summen, rabattGesamt = 0 }: Props) {
  const hasRabatt = rabattGesamt > 0
  const has10 = summen.netto_10 > 0
  const has0 = summen.netto_0 > 0

  return (
    <div className="ml-auto w-72 space-y-1.5">
      {summen.netto_20 > 0 && (
        <Row label="Netto (20% USt)" value={formatEuro(summen.netto_20)} />
      )}
      {has10 && (
        <Row label="Netto (10% USt)" value={formatEuro(summen.netto_10)} />
      )}
      {has0 && (
        <Row label="Netto (0% USt)" value={formatEuro(summen.netto_0)} />
      )}
      {hasRabatt && (
        <Row label={`Gesamtrabatt (${rabattGesamt}%)`} value={`- ${formatEuro(summen.netto_gesamt * rabattGesamt / 100 / (1 - rabattGesamt / 100))}`} muted />
      )}
      <div className="border-t border-border pt-1.5 mt-1.5" />
      {summen.ust_20 > 0 && (
        <Row label="Mehrwertsteuer 20%" value={formatEuro(summen.ust_20)} />
      )}
      {has10 && (
        <Row label="Mehrwertsteuer 10%" value={formatEuro(summen.ust_10)} />
      )}
      <div className="border-t border-border pt-1.5 mt-1.5" />
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-ink">Gesamt (Brutto)</span>
        <span className="text-base font-bold text-ink">{formatEuro(summen.brutto)}</span>
      </div>
    </div>
  )
}

function Row({ label, value, muted = false }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={`text-sm ${muted ? 'text-ink-muted' : 'text-ink'}`}>{label}</span>
      <span className={`text-sm font-medium ${muted ? 'text-ink-muted' : 'text-ink'}`}>{value}</span>
    </div>
  )
}
