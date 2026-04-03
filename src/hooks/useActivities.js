import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'
import toast from 'react-hot-toast'

export function useActivities(filters = {}) {
  return useQuery({
    queryKey: ['activities', filters],
    queryFn: async () => {
      let q = supabase
        .from('activities')
        .select(`*, client:clients(id,name), contact:contacts(id,name), responsible:profiles(id,name), activity_attachments(*)`)
        .order('activity_date', { ascending: false })
        .order('created_at', { ascending: false })

      if (filters.client_id) q = q.eq('client_id', filters.client_id)
      if (filters.type) q = q.eq('type', filters.type)
      if (filters.status) q = q.eq('status', filters.status)
      if (filters.responsible_id) q = q.eq('responsible_id', filters.responsible_id)
      if (filters.search) q = q.ilike('description', `%${filters.search}%`)

      const { data, error } = await q
      if (error) { console.error('[useActivities] query error:', error); throw error }
      return data
    },
  })
}

export function useActivityMutations() {
  const qc = useQueryClient()
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['activities'] })
    qc.invalidateQueries({ queryKey: ['client'] })
  }

  const create = useMutation({
    mutationFn: async (payload) => {
      const { data, error } = await supabase.from('activities').insert(payload).select().single()
      if (error) throw error
      return data
    },
    onSuccess: () => { invalidate(); toast.success('Atividade criada') },
    onError: (e) => toast.error(e.message),
  })

  const update = useMutation({
    mutationFn: async ({ id, ...payload }) => {
      const { data, error } = await supabase.from('activities').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', id).select().single()
      if (error) throw error
      return data
    },
    onSuccess: () => { invalidate(); toast.success('Atividade atualizada') },
    onError: (e) => toast.error(e.message),
  })

  const remove = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('activities').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => { invalidate(); toast.success('Atividade removida') },
    onError: (e) => toast.error(e.message),
  })

  return { create, update, remove }
}
