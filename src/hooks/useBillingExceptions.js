import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'

/**
 * Client's negotiation exceptions (`billing_exceptions`).
 * Visible to admin/manager/finance/sales (RLS SELECT), used by the cockpit
 * row detail, the client detail mirror and the Empresas contract tab (Q8).
 */
export function useBillingExceptions(clientId) {
  return useQuery({
    queryKey: ['billing_exceptions', clientId],
    enabled: !!clientId,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('billing_exceptions')
        .select('*')
        .eq('client_id', clientId)
        .order('valid_from', { ascending: false })
      if (error) throw error
      return data ?? []
    },
  })
}
