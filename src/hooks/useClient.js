import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'
import toast from 'react-hot-toast'

export function useClient(id) {
  return useQuery({
    queryKey: ['client', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clients')
        .select(`
          *,
          stage:stages(*),
          csm:profiles!clients_csm_id_fkey(id, name, email),
          client_catalog(catalog_item_id, catalog_items(*)),
          contact_links(*, contacts(*)),
          activities(*, responsible:profiles(id,name), contacts(id,name)),
          milestones(*, milestone_tasks(*)),
          client_usage(*),
          client_support(*),
          onboarding_phases(*, onboarding_tasks(*))
        `)
        .eq('id', id)
        .single()
      if (error) throw error
      return data
    },
  })
}

export function useClientUsageMutations() {
  const qc = useQueryClient()

  const upsert = useMutation({
    mutationFn: async (payload) => {
      const { data, error } = await supabase.from('client_usage').upsert(payload, { onConflict: 'client_id,ref_month' }).select().single()
      if (error) throw error
      return data
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['client', vars.client_id] })
      toast.success('Dados salvos')
    },
    onError: (e) => toast.error(e.message),
  })

  return { upsert }
}

export function useClientSupportMutations() {
  const qc = useQueryClient()

  const upsert = useMutation({
    mutationFn: async (payload) => {
      const { data, error } = await supabase.from('client_support').upsert(payload, { onConflict: 'client_id,ref_month' }).select().single()
      if (error) throw error
      return data
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['client', vars.client_id] })
      toast.success('Dados salvos')
    },
    onError: (e) => toast.error(e.message),
  })

  return { upsert }
}
