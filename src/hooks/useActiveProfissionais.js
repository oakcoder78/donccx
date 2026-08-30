import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabaseClient'
import { ymOffset } from '@/lib/scoring'

// Sum of active professionals for the last closed month. RLS-scoped, so it is
// automatically the carteira total for csm/sales and the company total for
// admin/manager/finance/analyst — feeds the HERO "Profissionais Ativos" card.
const refMonth = ymOffset(1)

export function useActiveProfissionais(options = {}) {
  return useQuery({
    queryKey: ['active_profissionais', refMonth],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_usage')
        .select('active_users, instance_id')
        .eq('ref_month', refMonth)
        .eq('pending', false)
      if (error) throw error
      return (data || [])
        .filter(r => r.instance_id != null)
        .reduce((s, r) => s + (r.active_users || 0), 0)
    },
    staleTime: 10 * 60 * 1000,
    ...options,
  })
}
