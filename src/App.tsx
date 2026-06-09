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
// Ausgehende Dokumente
import { KundenPage } from '@/features/auftraege/kunden/KundenPage'
import { AngebotePage } from '@/features/auftraege/angebote/AngebotePage'
import { AngebotFormPage } from '@/features/auftraege/angebote/AngebotFormPage'
import { AuftragsbestaetigungPage } from '@/features/auftraege/auftragsbestatigungen/AuftragsbestaetigungPage'
import { AuftragsbestaetigungFormPage } from '@/features/auftraege/auftragsbestatigungen/AuftragsbestaetigungFormPage'
import { AusgangsrechnungPage } from '@/features/auftraege/ausgangsrechnungen/AusgangsrechnungPage'
import { AusgangsrechnungFormPage } from '@/features/auftraege/ausgangsrechnungen/AusgangsrechnungFormPage'
import { MahnwesenPage } from '@/features/auftraege/mahnwesen/MahnwesenPage'
import { EinstellungenPage } from '@/features/einstellungen/EinstellungenPage'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 1000 * 60 * 5 },
  },
})

const DEMO_MODE = import.meta.env.VITE_SUPABASE_URL === 'https://placeholder.supabase.co'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()

  // In demo mode, skip Supabase auth entirely — check sessionStorage flag instead
  if (DEMO_MODE) {
    const isDemoAuthed = sessionStorage.getItem('demo_auth') === '1'
    if (!isDemoAuthed) return <Navigate to="/login" replace />
    return <AppLayout>{children}</AppLayout>
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-bg-base flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-accent-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />

  return <AppLayout>{children}</AppLayout>
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<ProtectedRoute><HomePage /></ProtectedRoute>} />
      <Route path="/rechnungen" element={<ProtectedRoute><InboxPage /></ProtectedRoute>} />
      <Route path="/buchung/:id" element={<ProtectedRoute><BuchungPage /></ProtectedRoute>} />
      <Route path="/exports" element={<ProtectedRoute><ExportsPage /></ProtectedRoute>} />
      <Route path="/mitarbeiter" element={<ProtectedRoute><MitarbeiterPage /></ProtectedRoute>} />
      <Route path="/kategorien" element={<ProtectedRoute><KategorienPage /></ProtectedRoute>} />
      <Route path="/lohn" element={<ProtectedRoute><LohnPage /></ProtectedRoute>} />
      <Route path="/kontoauszuege" element={<ProtectedRoute><KontoauszugPage /></ProtectedRoute>} />
      {/* Ausgehende Dokumente */}
      <Route path="/kunden" element={<ProtectedRoute><KundenPage /></ProtectedRoute>} />
      <Route path="/angebote" element={<ProtectedRoute><AngebotePage /></ProtectedRoute>} />
      <Route path="/angebote/:id" element={<ProtectedRoute><AngebotFormPage /></ProtectedRoute>} />
      <Route path="/auftraege" element={<ProtectedRoute><AuftragsbestaetigungPage /></ProtectedRoute>} />
      <Route path="/auftraege/:id" element={<ProtectedRoute><AuftragsbestaetigungFormPage /></ProtectedRoute>} />
      <Route path="/ausgangsrechnungen" element={<ProtectedRoute><AusgangsrechnungPage /></ProtectedRoute>} />
      <Route path="/ausgangsrechnungen/:id" element={<ProtectedRoute><AusgangsrechnungFormPage /></ProtectedRoute>} />
      <Route path="/mahnwesen" element={<ProtectedRoute><MahnwesenPage /></ProtectedRoute>} />
      <Route path="/einstellungen" element={<ProtectedRoute><EinstellungenPage /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppRoutes />
        <Toaster richColors position="top-right" />
      </BrowserRouter>
    </QueryClientProvider>
  )
}
