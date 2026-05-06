import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Mitarbeiter } from '@/types/database'

export function useMitarbeiter() {
  return useQuery<Mitarbeiter[]>({
    queryKey: ['mitarbeiter'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('mitarbeiter')
        .select('*')
        .eq('aktiv', true)
        .order('name')
      if (error) throw error
      return (data ?? []) as Mitarbeiter[]
    },
    staleTime: 5 * 60 * 1000,
  })
}
