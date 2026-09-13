import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabaseClient'
import { ymOffset } from '@/lib/scoring'

// Sum of active professionals for the last closed month, feeds the HERO
// "Profissionais Ativos" card. Used to rely on RLS alone to scope rows (carteira
// for csm/sales, company-wide for the rest) — broke 2026-09-13 when client_usage
// got a global SELECT policy (view-everything model). Now filters explicitly by
// `clientIds` (pass the caller's own already-scoped client list, e.g. from
// useDashboardClients) so the number stays carteira-scoped for csm/sales
// regardless of what RLS itself allows; pass `null`/`undefined` for company-wide.
const refMonth = ymOffset(1)

export function useActiveProfissionais(clientIds, options = {}) {
  return useQuery({
    queryKey: ['active_profissionais', refMonth, clientIds ? [...clientIds].sort((a, b) => a - b) : 'all'],
    queryFn: async () => {
      let query = supabase
        .from('client_usage')
        .select('active_users, instance_id, client_id')
        .eq('ref_month', refMonth)
        .eq('pending', false)
      if (clientIds) query = query.in('client_id', clientIds.length ? clientIds : [-1])
      const { data, error } = await query
      if (error) throw error
      return (data || [])
        .filter(r => r.instance_id != null)
        .reduce((s, r) => s + (r.active_users || 0), 0)
    },
    staleTime: 10 * 60 * 1000,
    ...options,
  })
}
