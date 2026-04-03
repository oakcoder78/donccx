import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'

export function useModulePricing(clientId) {
  return useQuery({
    queryKey: ['module_pricing', clientId],
    enabled: !!clientId,
    retry: 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('module_pricing')
        .select('*, catalog_items(*)')
        .eq('client_id', clientId)
      if (error) { console.error('[useModulePricing] error:', error); return [] }
      return data ?? []
    },
  })
}

export function useModulePricingMutations() {
  const qc = useQueryClient()

  const saveAll = useMutation({
    mutationFn: async ({ clientId, items }) => {
      await supabase.from('module_pricing').delete().eq('client_id', clientId)
      if (items.length > 0) {
        const { error } = await supabase.from('module_pricing').insert(items)
        if (error) throw error
      }
    },
    onSuccess: (_, { clientId }) => {
      qc.invalidateQueries({ queryKey: ['module_pricing', clientId] })
      qc.invalidateQueries({ queryKey: ['client', String(clientId)] })
    },
  })

  return { saveAll }
}
