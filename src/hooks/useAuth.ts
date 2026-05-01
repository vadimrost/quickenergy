import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

interface AuthState {
  user: User | null
  loading: boolean
  signOut: () => Promise<void>
}

const DEMO_MODE = import.meta.env.VITE_SUPABASE_URL === 'https://placeholder.supabase.co'

async function upsertProfile(user: User) {
  await supabase
    .from('profiles')
    .upsert({ id: user.id, email: user.email ?? '', updated_at: new Date().toISOString() })
}

export function useAuth(): AuthState {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(!DEMO_MODE)

  useEffect(() => {
    if (DEMO_MODE) return // skip Supabase network calls in demo mode

    supabase.auth.getSession().then(({ data: { session } }) => {
      const u = session?.user ?? null
      setUser(u)
      if (u) upsertProfile(u)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user ?? null
      setUser(u)
      if (u) upsertProfile(u)
    })

    return () => subscription.unsubscribe()
  }, [])

  const signOut = async () => {
    if (DEMO_MODE) {
      sessionStorage.removeItem('demo_auth')
      return
    }
    await supabase.auth.signOut()
  }

  return { user, loading, signOut }
}
