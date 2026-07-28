import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'

export function useProfissionaisCockpit(refMonth) {
  const { profile } = useAuth()

  // Available months for the selector dropdown
  // Only months targeted by donc-api-sync (any status) — reflects what the
  // DONC API actually populated, excluding pre-API legacy data.
  const monthsQuery = useQuery({
    queryKey: ['profissionais_available_months'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sync_service_log')
        .select('ref_month')
        .eq('service_name', 'donc-api')

      if (error) throw error
      return [...new Set((data || []).map(r => r.ref_month))].sort().reverse()
    },
    staleTime: 10 * 60 * 1000,
  })

  // Main cockpit data
  const dataQuery = useQuery({
    queryKey: ['profissionais_cockpit', refMonth],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_profissionais_cockpit', {
        p_ref_month: refMonth,
      })
      if (error) throw error
      return data || []
    },
    staleTime: 5 * 60 * 1000,
    enabled: !!profile && !!refMonth,
  })

  return {
    months: monthsQuery.data || [],
    monthsLoading: monthsQuery.isLoading,
    data: dataQuery.data || [],
    isLoading: dataQuery.isLoading,
    error: dataQuery.error,
    refetch: dataQuery.refetch,
  }
}
