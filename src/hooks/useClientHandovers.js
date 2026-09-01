import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'
import toast from 'react-hot-toast'

export function useClientHandovers(clientId) {
  return useQuery({
    queryKey: ['client_handovers', clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_handovers')
        .select('*')
        .eq('client_id', clientId)
        .maybeSingle()
      if (error) throw error
      return data
    },
  })
}

export function useHandoverTemplates() {
  return useQuery({
    queryKey: ['handover_templates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_handover_templates')
        .select('*')
        .order('version')
      if (error) throw error
      return data ?? []
    },
    staleTime: 5 * 60 * 1000,
  })
}

export function useHandoverMutations(clientId) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ answers, template_version = 'v1' }) => {
      const { data, error } = await supabase
        .from('client_handovers')
        .upsert(
          { client_id: clientId, answers, template_version, updated_at: new Date().toISOString() },
          { onConflict: 'client_id' }
        )
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['client_handovers', clientId] })
      qc.invalidateQueries({ queryKey: ['client', clientId] })
      toast.success('Handoff salvo')
    },
    onError: (e) => toast.error(e.message),
  })
}
