import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'

// Extrato da competencia de um cliente: emissoes, ajustes e lancamentos em ordem
// cronologica, com o saldo devedor acumulado (RPC billing_cockpit_extrato).
export function useBillingExtrato(clientId, competencia, enabled = true) {
  return useQuery({
    queryKey: ['billing_extrato', clientId, competencia],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('billing_cockpit_extrato', {
        p_client_id: clientId,
        p_competencia: competencia,
      })
      if (error) throw error
      return data || []
    },
    enabled: enabled && !!clientId && !!competencia,
    staleTime: 30 * 1000,
  })
}
