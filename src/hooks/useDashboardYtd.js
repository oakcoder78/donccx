import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabaseClient'

/**
 * Year-to-date ecosystem numbers for the "Nossa força em Números" block.
 * Company-wide, identical for every role (RPC is SECURITY DEFINER — SDD §4.2).
 *
 * Returns a single object or null:
 *   { clientes, clientes_novos_ano, os_criadas_ano,
 *     profissionais_pico, profissionais_pico_mes, health_media }
 */
export function useDashboardYtd(options = {}) {
  return useQuery({
    queryKey: ['dashboard_ytd'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_dashboard_ytd')
      if (error) throw error
      return data?.[0] ?? null
    },
    staleTime: 10 * 60 * 1000,
    ...options,
  })
}

/**
 * Current-month vs trailing-90-day average for OS and profissionais.
 * Feeds the HERO deltas ("+8% vs média 90 dias").
 *
 * Returns { os, profissionais } where each is
 *   { mes_atual, media_90d, delta_pct } | undefined
 */
export function useOperational90dAvg(options = {}) {
  return useQuery({
    queryKey: ['operational_90d_avg'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_operational_90d_avg')
      if (error) throw error
      const rows = data ?? []
      return {
        os: rows.find(r => r.metric === 'os'),
        profissionais: rows.find(r => r.metric === 'profissionais'),
      }
    },
    staleTime: 10 * 60 * 1000,
    ...options,
  })
}
