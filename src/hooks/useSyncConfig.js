import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabaseClient'

const VITE_SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const VITE_SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

export function useSyncConfig() {
  return useQuery({
    queryKey: ['sync-config'],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Sessão expirada')

      const res = await fetch(`${VITE_SUPABASE_URL}/functions/v1/sync-schedule`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          apikey: VITE_SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'get-config' }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || `HTTP ${res.status}`)
      return result
    },
    staleTime: Infinity,
    retry: 1,
  })
}
