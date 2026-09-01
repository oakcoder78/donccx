import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'
import toast from 'react-hot-toast'

export function useBillingOsTiers(clientId) {
  return useQuery({
    queryKey: ['billing_os_tiers', clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('billing_os_tiers')
        .select('*')
        .eq('client_id', clientId)
        .order('tier_order')
      if (error) throw error
      return data ?? []
    },
  })
}

export function useBillingOsTiersMutations(clientId) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ tiers }) => {
      const { error: delErr } = await supabase.from('billing_os_tiers').delete().eq('client_id', clientId)
      if (delErr) throw delErr
      if (!tiers || tiers.length === 0) return []
      const payload = tiers.map(t => ({
        client_id: clientId,
        tier_order: t.tier_order,
        limit_to: t.limit_to,
        fixed_value: t.fixed_value,
        excess_unit_price: t.excess_unit_price ?? 0.95,
      }))
      const { data, error } = await supabase.from('billing_os_tiers').insert(payload).select()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['billing_os_tiers', clientId] })
      toast.success('Faixas OS salvas')
    },
    onError: (e) => toast.error(e.message),
  })
}
