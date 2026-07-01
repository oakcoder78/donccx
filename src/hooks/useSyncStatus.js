import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabaseClient'

export function useSyncStatus({ enabled } = {}) {
  return useQuery({
    queryKey: ['sync_status'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sync_log')
        .select('*')
        .eq('job_name', 'monthly-sync')
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (error) throw error
      return data
    },
    enabled,
    staleTime: 30_000,
    refetchInterval: 5 * 60 * 1000,
  })
}
