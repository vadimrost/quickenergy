import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from '@/components/ui/sonner'
import { AppLayout } from '@/components/layout/AppLayout'
import { LoginPage } from '@/pages/LoginPage'
import { InboxPage } from '@/features/inbox/InboxPage'
import { BuchungPage } from '@/features/buchung/BuchungPage'
import { ExportsPage } from '@/features/exports/ExportsPage'
import { useAuth } from '@/hooks/useAuth'

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
      <Route path="/" element={<ProtectedRoute><InboxPage /></ProtectedRoute>} />
      <Route path="/buchung/:id" element={<ProtectedRoute><BuchungPage /></ProtectedRoute>} />
      <Route path="/exports" element={<ProtectedRoute><ExportsPage /></ProtectedRoute>} />
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
