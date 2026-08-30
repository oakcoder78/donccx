import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabaseClient'

// Company-wide ("geral") sources for the Dashboard v3 blocks that must show the
// same numbers to every role. csm/sales can't SELECT company-wide directly (RLS),
// so these go through SECURITY DEFINER RPCs (migration 20260830000004).
// No mrr/billing — aggregates + non-sensitive per-client fields only.

/** All active clients with health dims + UF. Feeds Saúde por dimensão + Mapa. */
export function useDashboardClientsOverview(options = {}) {
  return useQuery({
    queryKey: ['dashboard_clients_overview'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_dashboard_clients_overview')
      if (error) throw error
      return data ?? []
    },
    staleTime: 5 * 60 * 1000,
    ...options,
  })
}

/** One row per client with an open project. Feeds Projetos em aberto. */
export function useOpenProjectsOverview(options = {}) {
  return useQuery({
    queryKey: ['open_projects_overview'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_open_projects_overview')
      if (error) throw error
      return data ?? []
    },
    staleTime: 5 * 60 * 1000,
    ...options,
  })
}
