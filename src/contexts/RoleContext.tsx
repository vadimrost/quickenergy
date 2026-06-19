import { createContext, useContext, type ReactNode } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'

export interface Profile {
  id: string
  email: string
  rolle: 'admin' | 'setter'
  setter_name: string | null
  created_at: string
  updated_at: string
}

interface RoleContextValue {
  rolle: 'admin' | 'setter'
  setterName: string | null
  isAdmin: boolean
  isSetter: boolean
  isLoading: boolean
}

const RoleContext = createContext<RoleContextValue>({
  rolle: 'admin',
  setterName: null,
  isAdmin: true,
  isSetter: false,
  isLoading: false,
})

export function RoleProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()

  const { data: profile, isLoading } = useQuery({
    queryKey: ['profile', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user!.id)
        .single()
      if (error) throw error
      return data as Profile
    },
    enabled: !!user,
    staleTime: 1000 * 60 * 10,
  })

  const rolle = profile?.rolle ?? 'admin'

  return (
    <RoleContext.Provider value={{
      rolle,
      setterName: profile?.setter_name ?? null,
      isAdmin: rolle === 'admin',
      isSetter: rolle === 'setter',
      isLoading: isLoading && !!user,
    }}>
      {children}
    </RoleContext.Provider>
  )
}

export function useRole() {
  return useContext(RoleContext)
}

// ─── Admin: Alle Profile verwalten ───────────────────────────────────────────

export function useAllProfiles() {
  return useQuery({
    queryKey: ['profiles_all'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at')
      if (error) throw error
      return data as Profile[]
    },
  })
}

export function useUpdateProfile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...update }: Partial<Profile> & { id: string }) => {
      const { error } = await supabase
        .from('profiles')
        .update({ ...update, updated_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['profiles_all'] })
      qc.invalidateQueries({ queryKey: ['profile'] })
    },
  })
}
