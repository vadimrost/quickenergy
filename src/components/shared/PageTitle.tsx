import type { ReactNode } from 'react'

interface PageTitleProps {
  title: string
  subtitle?: string
  actions?: ReactNode
}

export function PageTitle({ title, subtitle, actions }: PageTitleProps) {
  return (
    <div className="mb-5 md:mb-8 flex items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl md:text-page-title font-semibold text-ink">{title}</h1>
        {subtitle && <p className="text-sm text-ink-muted mt-1 hidden sm:block">{subtitle}</p>}
      </div>
      {actions && <div className="shrink-0">{actions}</div>}
    </div>
  )
}
