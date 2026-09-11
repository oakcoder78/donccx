import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'

/**
 * Finance cockpit data hooks (SDD v0.3 §4.3).
 * months: `sync_service_log` service `donc-api` (same source as Profissionais).
 * cockpit: RPC `get_financeiro_cockpit` (series-aware engine).
 */
export function useFinanceiroCockpit(refMonth) {
  const { profile } = useAuth()

  const monthsQuery = useQuery({
    queryKey: ['financeiro_available_months'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sync_service_log')
        .select('ref_month')
        .eq('service_name', 'donc-api')

      if (error) throw error
      return [...new Set((data || []).map((r) => r.ref_month).filter(Boolean))].sort().reverse()
    },
    staleTime: 10 * 60 * 1000,
  })

  const dataQuery = useQuery({
    queryKey: ['financeiro_cockpit', refMonth],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_financeiro_cockpit', {
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

/** Lazy accordion payload (1 RPC per first expand). */
export function useFinanceiroDetalhe(clientId, refMonth, enabled = true) {
  return useQuery({
    queryKey: ['financeiro_detalhe', clientId, refMonth],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_financeiro_detalhe', {
        p_client_id: clientId,
        p_ref_month: refMonth,
      })
      if (error) throw error
      return data?.[0] || null
    },
    staleTime: 5 * 60 * 1000,
    enabled: !!clientId && !!refMonth && enabled,
  })
}

/** Last DONC sync log for the ref_month (status + finished_at) — Q9 support banner. */
export function useLastDoncSync(refMonth) {
  return useQuery({
    queryKey: ['last_donc_sync', refMonth],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sync_service_log')
        .select('status, finished_at')
        .eq('service_name', 'donc-api')
        .eq('ref_month', refMonth)
        .order('finished_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw error
      return data || null
    },
    staleTime: 5 * 60 * 1000,
    enabled: !!refMonth,
  })
}

/** Pendências de adimplência: faturas de meses anteriores sem status. */
export function useFinanceiroPendencias(monthsBack = 3) {
  return useQuery({
    queryKey: ['financeiro_pendencias', monthsBack],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_financeiro_pendencias', {
        p_months_back: monthsBack,
      })
      if (error) throw error
      return data || []
    },
    staleTime: 5 * 60 * 1000,
  })
}
