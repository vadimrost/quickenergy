import { formatEuro } from '@/lib/utils'
import { rabattLabel, type Summen } from './positionenUtils'

interface Props {
  summen: Summen
}

export function DokumentSummen({ summen }: Props) {
  const hasRabatt = summen.rabatt_betrag > 0.005
  const has10 = summen.netto_10 > 0
  const has0 = summen.netto_0 > 0

  return (
    <div className="ml-auto w-72 space-y-1.5">
      {/* Bei Rabatt zuerst die Zwischensumme, damit die Rechnung nachvollziehbar aufgeht */}
      {hasRabatt && (
        <>
          <Row label="Zwischensumme netto" value={formatEuro(summen.netto_vor_rabatt)} />
          <Row label={rabattLabel(summen.rabatt_prozent)} value={`- ${formatEuro(summen.rabatt_betrag)}`} muted />
          <div className="border-t border-border pt-1.5 mt-1.5" />
        </>
      )}
      {summen.netto_20 > 0 && (
        <Row label="Netto (20% USt)" value={formatEuro(summen.netto_20)} />
      )}
      {has10 && (
        <Row label="Netto (10% USt)" value={formatEuro(summen.netto_10)} />
      )}
      {has0 && (
        <Row label="Netto (0% USt)" value={formatEuro(summen.netto_0)} />
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
