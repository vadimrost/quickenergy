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
  const navigate = useNavigate()

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
          <p className="text-sm text-ink-muted">Anmelden um fortzufahren</p>
        </div>

        {DEMO_MODE && (
          <div className="mb-4 px-3 py-2.5 rounded-card-sm bg-accent-50 border border-accent-200 text-xs text-accent-700 text-center">
            Demo-Modus — Zugangsdaten bereits eingetragen
          </div>
        )}

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
        </form>
      </div>
    </div>
  )
}
