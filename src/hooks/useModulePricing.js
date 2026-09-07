import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'
import toast from 'react-hot-toast'

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
    mutationFn: async ({ clientId, items, seriesId, clearNulls }) => {
      // Scoped por série quando informado; legado (sem série) só toca linhas sem série.
      // clearNulls (original): absorve linhas legadas sem série na série original.
      let del = supabase.from('module_pricing').delete().eq('client_id', clientId)
      if (seriesId && clearNulls) {
        del = del.or(`series_id.eq.${seriesId},series_id.is.null`)
      } else if (seriesId) {
        del = del.eq('series_id', seriesId)
      } else {
        del = del.is('series_id', null)
      }
      const { error: delErr } = await del
      if (delErr) throw delErr
      if (items.length > 0) {
        const payload = items.map(i => ({ ...i, series_id: i.series_id || seriesId || null }))
        const { error } = await supabase.from('module_pricing').insert(payload)
        if (error) throw error
      }
    },
    onSuccess: (_, { clientId }) => {
      qc.invalidateQueries({ queryKey: ['module_pricing', clientId] })
      qc.invalidateQueries({ queryKey: ['client', String(clientId)] })
    },
    onError: (e) => toast.error('Erro ao salvar módulos: ' + e.message),
  })

  return { saveAll }
}
