import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

// Ziel des Links aus der "Passwort zurücksetzen"-Mail. Der Supabase-Client liest den
// Token aus dem URL-Hash und meldet den Nutzer damit an; hier wird dann das neue
// Passwort gesetzt.

// Fehler im Link (z.B. abgelaufen) stehen ebenfalls im Hash — vor dem Client lesen
const LINK_FEHLER = typeof window !== 'undefined'
  ? new URLSearchParams(window.location.hash.slice(1)).get('error_description')
  : null

type Zustand = 'pruefen' | 'bereit' | 'ungueltig'

export function PasswortNeuPage() {
  const navigate = useNavigate()
  const [zustand, setZustand] = useState<Zustand>(LINK_FEHLER ? 'ungueltig' : 'pruefen')
  const [passwort, setPasswort] = useState('')
  const [wiederholung, setWiederholung] = useState('')
  const [speichert, setSpeichert] = useState(false)

  useEffect(() => {
    if (LINK_FEHLER) return
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || session) setZustand('bereit')
    })
    // getSession wartet, bis der Client den Token aus dem Link verarbeitet hat
    supabase.auth.getSession().then(({ data: { session } }) => {
      setZustand(session ? 'bereit' : 'ungueltig')
    })
    return () => subscription.unsubscribe()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (passwort.length < 8) { toast.error('Das Passwort muss mindestens 8 Zeichen haben.'); return }
    if (passwort !== wiederholung) { toast.error('Die beiden Passwörter stimmen nicht überein.'); return }
    setSpeichert(true)
    const { error } = await supabase.auth.updateUser({ password: passwort })
    setSpeichert(false)
    if (error) {
      toast.error(/different from the old/i.test(error.message)
        ? 'Das neue Passwort muss sich vom alten unterscheiden.'
        : `Passwort konnte nicht gespeichert werden: ${error.message}`)
      return
    }
    toast.success('Neues Passwort gespeichert')
    navigate('/', { replace: true })
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: '#8BC34A' }}>
      <div className="card-base p-10 w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <img src="/logo.svg" alt="QuickEnergy" className="w-24 h-24 mb-4" />
          <p className="text-sm text-ink-muted">Neues Passwort festlegen</p>
        </div>

        {zustand === 'pruefen' && (
          <div className="flex justify-center py-6">
            <div className="w-6 h-6 border-2 border-accent-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {zustand === 'ungueltig' && (
          <div className="space-y-4 text-sm text-ink">
            <p>Der Link ist ungültig oder abgelaufen. Links zum Zurücksetzen gelten eine Stunde und nur einmal.</p>
            <Button type="button" className="w-full bg-accent-500 hover:bg-accent-600 text-white border-0" onClick={() => navigate('/login', { replace: true })}>
              Neuen Link anfordern
            </Button>
          </div>
        )}

        {zustand === 'bereit' && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="pw-neu" className="label-caps">Neues Passwort</Label>
              <Input
                id="pw-neu"
                type="password"
                placeholder="Mindestens 8 Zeichen"
                value={passwort}
                onChange={(e) => setPasswort(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pw-wdh" className="label-caps">Passwort wiederholen</Label>
              <Input
                id="pw-wdh"
                type="password"
                value={wiederholung}
                onChange={(e) => setWiederholung(e.target.value)}
                required
                autoComplete="new-password"
              />
            </div>
            <Button type="submit" disabled={speichert} className="w-full bg-accent-500 hover:bg-accent-600 text-white border-0 mt-2">
              {speichert ? 'Wird gespeichert…' : 'Passwort speichern'}
            </Button>
          </form>
        )}
      </div>
    </div>
  )
}
