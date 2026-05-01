interface PageTitleProps {
  title: string
  subtitle?: string
}

export function PageTitle({ title, subtitle }: PageTitleProps) {
  return (
    <div className="mb-5 md:mb-8">
      <h1 className="text-2xl md:text-page-title font-semibold text-ink">{title}</h1>
      {subtitle && <p className="text-sm text-ink-muted mt-1 hidden sm:block">{subtitle}</p>}
    </div>
  )
}
