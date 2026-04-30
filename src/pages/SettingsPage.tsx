import { PageTitle } from '@/components/shared/PageTitle'
import { SectionCard } from '@/components/shared/SectionCard'

export function SettingsPage() {
  return (
    <div>
      <PageTitle title="Einstellungen" subtitle="Systemkonfiguration und Benutzerverwaltung" />

      <div className="space-y-6">
        <SectionCard title="Allgemein">
          <p className="text-sm text-ink-muted">Einstellungen folgen in Kürze.</p>
        </SectionCard>
      </div>
    </div>
  )
}
