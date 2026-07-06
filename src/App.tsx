import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from '@/components/ui/sonner'
import { AppLayout } from '@/components/layout/AppLayout'
import { LoginPage } from '@/pages/LoginPage'
import { HomePage } from '@/features/home/HomePage'
import { InboxPage } from '@/features/inbox/InboxPage'
import { BuchungPage } from '@/features/buchung/BuchungPage'
import { ExportsPage } from '@/features/exports/ExportsPage'
import { MitarbeiterPage } from '@/features/mitarbeiter/MitarbeiterPage'
import { KategorienPage } from '@/features/kategorien/KategorienPage'
import { LohnPage } from '@/features/lohn/LohnPage'
import { KontoauszugPage } from '@/features/kontoauszug/KontoauszugPage'
import { useAuth } from '@/hooks/useAuth'
import { RoleProvider, useRole } from '@/contexts/RoleContext'
// Ausgehende Dokumente
import { KundenPage } from '@/features/auftraege/kunden/KundenPage'
import { AngebotePage } from '@/features/auftraege/angebote/AngebotePage'
import { AngebotFormPage } from '@/features/auftraege/angebote/AngebotFormPage'
import { VorlagenPage } from '@/features/auftraege/vorlagen/VorlagenPage'
import { AuftragsbestaetigungPage } from '@/features/auftraege/auftragsbestatigungen/AuftragsbestaetigungPage'
import { AuftragsbestaetigungFormPage } from '@/features/auftraege/auftragsbestatigungen/AuftragsbestaetigungFormPage'
import { AusgangsrechnungPage } from '@/features/auftraege/ausgangsrechnungen/AusgangsrechnungPage'
import { AusgangsrechnungFormPage } from '@/features/auftraege/ausgangsrechnungen/AusgangsrechnungFormPage'
import { MahnwesenPage } from '@/features/auftraege/mahnwesen/MahnwesenPage'
import { EinstellungenPage } from '@/features/einstellungen/EinstellungenPage'
import { CrmPage } from '@/features/crm/CrmPage'
import { LeadDetailPage } from '@/features/crm/LeadDetailPage'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 1000 * 60 * 5 },
  },
})

const DEMO_MODE = import.meta.env.VITE_SUPABASE_URL === 'https://placeholder.supabase.co'

function Spinner() {
  return (
    <div className="min-h-screen bg-bg-base flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-accent-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

// Route that admins can access — setters get redirected to /crm
function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const { isSetter, isLoading: roleLoading } = useRole()

  if (DEMO_MODE) {
    const isDemoAuthed = sessionStorage.getItem('demo_auth') === '1'
    if (!isDemoAuthed) return <Navigate to="/login" replace />
    return <AppLayout>{children}</AppLayout>
  }

  if (loading || roleLoading) return <Spinner />
  if (!user) return <Navigate to="/login" replace />
  if (isSetter) return <Navigate to="/crm" replace />

  return <AppLayout>{children}</AppLayout>
}

// Route accessible by everyone (admin + setter)
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const { isLoading: roleLoading } = useRole()

  if (DEMO_MODE) {
    const isDemoAuthed = sessionStorage.getItem('demo_auth') === '1'
    if (!isDemoAuthed) return <Navigate to="/login" replace />
    return <AppLayout>{children}</AppLayout>
  }

  if (loading || roleLoading) return <Spinner />
  if (!user) return <Navigate to="/login" replace />

  return <AppLayout>{children}</AppLayout>
}

// Wildcard redirect depends on role
function DefaultRedirect() {
  const { isSetter } = useRole()
  return <Navigate to={isSetter ? '/crm' : '/'} replace />
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      {/* Admin-only routes */}
      <Route path="/"                    element={<AdminRoute><HomePage /></AdminRoute>} />
      <Route path="/rechnungen"          element={<AdminRoute><InboxPage /></AdminRoute>} />
      <Route path="/buchung/:id"         element={<AdminRoute><BuchungPage /></AdminRoute>} />
      <Route path="/exports"             element={<AdminRoute><ExportsPage /></AdminRoute>} />
      <Route path="/mitarbeiter"         element={<AdminRoute><MitarbeiterPage /></AdminRoute>} />
      <Route path="/kategorien"          element={<AdminRoute><KategorienPage /></AdminRoute>} />
      <Route path="/lohn"                element={<AdminRoute><LohnPage /></AdminRoute>} />
      <Route path="/kontoauszuege"       element={<AdminRoute><KontoauszugPage /></AdminRoute>} />
      <Route path="/kunden"              element={<AdminRoute><KundenPage /></AdminRoute>} />
      <Route path="/angebote"            element={<AdminRoute><AngebotePage /></AdminRoute>} />
      <Route path="/angebote/:id"        element={<AdminRoute><AngebotFormPage /></AdminRoute>} />
      <Route path="/vorlagen"            element={<AdminRoute><VorlagenPage /></AdminRoute>} />
      <Route path="/auftraege"           element={<AdminRoute><AuftragsbestaetigungPage /></AdminRoute>} />
      <Route path="/auftraege/:id"       element={<AdminRoute><AuftragsbestaetigungFormPage /></AdminRoute>} />
      <Route path="/ausgangsrechnungen"  element={<AdminRoute><AusgangsrechnungPage /></AdminRoute>} />
      <Route path="/ausgangsrechnungen/:id" element={<AdminRoute><AusgangsrechnungFormPage /></AdminRoute>} />
      <Route path="/mahnwesen"           element={<AdminRoute><MahnwesenPage /></AdminRoute>} />
      <Route path="/einstellungen"       element={<AdminRoute><EinstellungenPage /></AdminRoute>} />

      {/* CRM: accessible for everyone */}
      <Route path="/crm"    element={<ProtectedRoute><CrmPage /></ProtectedRoute>} />
      <Route path="/crm/:id" element={<ProtectedRoute><LeadDetailPage /></ProtectedRoute>} />

      <Route path="*" element={<DefaultRedirect />} />
    </Routes>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <RoleProvider>
          <AppRoutes />
          <Toaster richColors position="top-right" />
        </RoleProvider>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
