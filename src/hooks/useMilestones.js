import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'
import toast from 'react-hot-toast'

export function useMilestones(clientId) {
  return useQuery({
    queryKey: ['milestones', clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('milestones')
        .select('*')
        .eq('client_id', clientId)
        .order('created_at')
      if (error) { console.error('[useMilestones] query error:', error); return [] }
      return data ?? []
    },
    retry: 0,
  })
}

export function useAllMilestones() {
  return useQuery({
    queryKey: ['milestones_all'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('milestones')
        .select('*, client:clients(id,name)')
        .order('due_date', { nullsFirst: false })
      if (error) { console.error('[useAllMilestones] query error:', error); return [] }
      return data ?? []
    },
    retry: 0,
  })
}

export function useUpdateMilestoneStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, status }) => {
      const { error } = await supabase.from('milestones').update({ status }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['milestones_all'] })
      qc.invalidateQueries({ queryKey: ['milestones'] })
      qc.invalidateQueries({ queryKey: ['client'] })
    },
    onError: (e) => toast.error(e.message),
  })
}

export function useMilestoneMutations(clientId) {
  const qc = useQueryClient()
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['milestones', clientId] })
    qc.invalidateQueries({ queryKey: ['milestones_all'] })
    qc.invalidateQueries({ queryKey: ['client', clientId] })
    qc.invalidateQueries({ queryKey: ['projects', clientId] })
    qc.invalidateQueries({ queryKey: ['projects_all'] })
  }

  const createMilestone = useMutation({
    mutationFn: async (payload) => {
      const { data, error } = await supabase.from('milestones').insert({ ...payload, client_id: clientId }).select().single()
      if (error) throw error
      return data
    },
    onSuccess: () => { invalidate(); toast.success('Milestone criado') },
    onError: (e) => toast.error(e.message),
  })

  const updateMilestone = useMutation({
    mutationFn: async ({ id, ...payload }) => {
      const { data, error } = await supabase.from('milestones').update(payload).eq('id', id).select().single()
      if (error) throw error
      return data
    },
    onSuccess: () => { invalidate(); toast.success('Milestone atualizado') },
    onError: (e) => toast.error(e.message),
  })

  const removeMilestone = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('milestones').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => { invalidate(); toast.success('Milestone removido') },
    onError: (e) => toast.error(e.message),
  })

  return { createMilestone, updateMilestone, removeMilestone }
}
