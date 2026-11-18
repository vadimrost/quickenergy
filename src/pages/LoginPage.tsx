import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const DEMO_MODE = import.meta.env.VITE_SUPABASE_URL === 'https://placeholder.supabase.co'

export function LoginPage() {
  const [email, setEmail] = useState(DEMO_MODE ? 'demo@aiwerk.de' : '')
  const [password, setPassword] = useState(DEMO_MODE ? 'demo' : '')
  const [loading, setLoading] = useState(false)
  const [vergessen, setVergessen] = useState(false)
  const [mailGesendet, setMailGesendet] = useState(false)
  const navigate = useNavigate()

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/passwort-neu`,
    })
    setLoading(false)
    // Rate-Limit melden; sonst immer neutral bestätigen (verrät nicht, ob es das Konto gibt)
    if (error && (error.status === 429 || /rate limit/i.test(error.message))) {
      toast.error('Zu viele Anfragen. Bitte versuche es in einer Stunde erneut.')
      return
    }
    setMailGesendet(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    if (DEMO_MODE) {
      // No real Supabase — store a demo session flag and go directly to the app
      sessionStorage.setItem('demo_auth', '1')
      toast.success('Demo-Modus: Willkommen!')
      navigate('/')
      return
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      const msg =
        error.message === 'Invalid login credentials'
          ? 'E-Mail oder Passwort ist falsch.'
          : 'Anmeldung fehlgeschlagen. Bitte versuche es erneut.'
      toast.error(msg)
      setLoading(false)
      return
    }

    navigate('/')
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: '#8BC34A' }}>
      <div className="card-base p-10 w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <img src="/logo.svg" alt="QuickEnergy" className="w-24 h-24 mb-4" />
          <p className="text-sm text-ink-muted">{vergessen ? 'Passwort zurücksetzen' : 'Anmelden um fortzufahren'}</p>
        </div>

        {DEMO_MODE && (
          <div className="mb-4 px-3 py-2.5 rounded-card-sm bg-accent-50 border border-accent-200 text-xs text-accent-700 text-center">
            Demo-Modus — Zugangsdaten bereits eingetragen
          </div>
        )}

        {vergessen ? (
          mailGesendet ? (
            <div className="space-y-4 text-sm text-ink">
              <p>
                Falls ein Konto mit <strong>{email.trim()}</strong> existiert, haben wir dir eine E-Mail mit einem Link geschickt.
                Über den Link kannst du ein neues Passwort festlegen.
              </p>
              <p className="text-ink-muted text-xs">Keine Mail bekommen? Schau bitte auch im Spam-Ordner nach.</p>
              <Button type="button" variant="outline" className="w-full" onClick={() => { setVergessen(false); setMailGesendet(false) }}>
                Zurück zur Anmeldung
              </Button>
            </div>
          ) : (
            <form onSubmit={handleReset} className="space-y-4">
              <p className="text-sm text-ink-muted">
                Gib deine E-Mail-Adresse ein. Wir schicken dir einen Link, mit dem du ein neues Passwort festlegen kannst.
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="reset-email" className="label-caps">E-Mail</Label>
                <Input
                  id="reset-email"
                  type="email"
                  placeholder="name@firma.de"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  autoFocus
                />
              </div>
              <Button type="submit" disabled={loading || DEMO_MODE} className="w-full bg-accent-500 hover:bg-accent-600 text-white border-0">
                {loading ? 'Wird gesendet…' : 'Link zum Zurücksetzen senden'}
              </Button>
              <button type="button" onClick={() => setVergessen(false)} className="w-full text-xs text-ink-muted hover:text-ink transition-colors">
                Zurück zur Anmeldung
              </button>
            </form>
          )
        ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email" className="label-caps">E-Mail</Label>
            <Input
              id="email"
              type="email"
              placeholder="name@firma.de"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password" className="label-caps">Passwort</Label>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>

          <Button
            type="submit"
            disabled={loading}
            className="w-full bg-accent-500 hover:bg-accent-600 text-white border-0 mt-2"
          >
            {loading ? 'Wird angemeldet…' : 'Anmelden'}
          </Button>
          <button type="button" onClick={() => setVergessen(true)} className="w-full text-xs text-ink-muted hover:text-ink transition-colors">
            Passwort vergessen?
          </button>
        </form>
        )}
      </div>
    </div>
  )
}
