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
          client_catalog_history(*, catalog_items(type)),
          onboardings(id, context, status, situacao_geral, created_at, end_date)
        `)
        .eq('id', id)
        .single()
      if (error) { console.error('[useClient] query error:', error); throw error }

      const onboardings = data.onboardings ?? []
      const onboardingIds = onboardings.map(o => o.id)

      if (onboardingIds.length === 0) {
        return { ...data, onboardings: [] }
      }

      const [fasesRes, atividadesRes] = await Promise.all([
        supabase
          .from('onboarding_fases')
          .select('id, onboarding_id, status, planned_end, onboarding_fase_types(name, is_milestone)')
          .in('onboarding_id', onboardingIds),
        supabase
          .from('onboarding_activities')
          .select('id, onboarding_id, status, due_date, fase_id')
          .in('onboarding_id', onboardingIds),
      ])

      if (fasesRes.error) console.error('[useClient] onboarding_fases error:', fasesRes.error)
      if (atividadesRes.error) console.error('[useClient] onboarding_activities error:', atividadesRes.error)

      const fases = fasesRes.data ?? []
      const atividades = atividadesRes.data ?? []

      const onboardingsComFases = onboardings.map(o => ({
        ...o,
        onboarding_fases: fases.filter(f => f.onboarding_id === o.id),
        onboarding_activities: atividades.filter(a => a.onboarding_id === o.id),
      }))

      return { ...data, onboardings: onboardingsComFases }
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
