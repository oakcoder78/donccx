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
          client_catalog(id, catalog_item_id, status, catalog_items(*)),
          contact_links(*, contacts(*, contact_phones(*))),
          activities(*, responsible:profiles(id,name), contacts(id,name)),
          projects(*, responsible:profiles(id, name)),
          client_usage(*, client_donc_instances(id, label)),
          client_support(*),
          client_catalog_history(*, catalog_items(type))
        `)
        .eq('id', id)
        .single()
      if (error) { console.error('[useClient] query error:', error); throw error }
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['client'] })
    },
    onError: (e) => toast.error(e.message),
  })

  const remove = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('client_usage').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['client'] })
      toast.success('Registro removido')
    },
    onError: (e) => toast.error(e.message),
  })

  return { upsert, remove }
}

export function useClientSupport(clientId) {
  return useQuery({
    queryKey: ['client_support', clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_support')
        .select('*')
        .eq('client_id', clientId)
        .order('ref_month')
      if (error) throw error
      return data ?? []
    },
  })
}

export function useClientSupportMutations() {
  const qc = useQueryClient()

  const upsert = useMutation({
    mutationFn: async (payload) => {
      const { data, error } = await supabase.from('client_support').upsert(payload, { onConflict: 'client_id,ref_month' }).select().single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['client'] })
      qc.invalidateQueries({ queryKey: ['client_support'] })
    },
    onError: (e) => toast.error(e.message),
  })

  const remove = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('client_support').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['client'] })
      qc.invalidateQueries({ queryKey: ['client_support'] })
      toast.success('Registro removido')
    },
    onError: (e) => toast.error(e.message),
  })

  return { upsert, remove }
}
