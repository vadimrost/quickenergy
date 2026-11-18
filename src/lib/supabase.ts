import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

// Reset-Link aus der Mail: Landet er auf einer anderen Seite (z.B. Site-URL "/"),
// vor dem Start des Clients auf /passwort-neu umlenken — der Client liest den Token
// aus dem Hash und entfernt ihn danach.
// Abgelaufene/benutzte Links kommen ohne type, nur mit error_code — auch dorthin,
// damit die Seite "Link abgelaufen" anzeigt (Registrierung per Mail gibt es nicht).
const RESET_LINK = /type=recovery|error_code=otp_expired|error_code=access_denied/
if (typeof window !== 'undefined' && RESET_LINK.test(window.location.hash) && window.location.pathname !== '/passwort-neu') {
  window.history.replaceState(null, '', `/passwort-neu${window.location.hash}`)
}

// Untyped client — types are enforced at the hook level via our own interfaces
export const supabase = createClient(supabaseUrl, supabaseAnonKey)
