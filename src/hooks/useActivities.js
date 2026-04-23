import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'
import toast from 'react-hot-toast'

export function useActivities(filters = {}, options = {}) {
  return useQuery({
    queryKey: ['activities', filters],
    ...options,
    queryFn: async () => {
      let q = supabase
        .from('activities')
        .select(`
          *,
          client:clients(id,name,fantasy_name),
          contact:contacts(id,name),
          responsible:profiles(id,name),
          activity_attachments (
            id
          )
        `)
        .order('activity_date', { ascending: false })
        .order('created_at', { ascending: false })

      if (filters.client_id) q = q.eq('client_id', filters.client_id)
      if (filters.type) q = q.eq('type', filters.type)
      if (filters.status) q = q.eq('status', filters.status);
    if (filters.excludeStatuses) q = q.not('status', 'in', filters.excludeStatuses);
      if (filters.responsible_id) q = q.eq('responsible_id', filters.responsible_id)
      if (filters.search) q = q.ilike('description', `%${filters.search}%`)

      const { data, error } = await q
      if (error) { console.error('[useActivities] query error:', error); return [] }

      // Add has_attachments flag for each activity
      const formatted = data.map(a => ({
        ...a,
        has_attachments:
          a.activity_attachments &&
          a.activity_attachments.length > 0
      }))

      return formatted ?? []
    },
    retry: 0,
  })
}

const DATE_FIELDS = ['due_date', 'scheduled_at', 'date', 'activity_date']

function sanitizeDates(payload) {
  const result = { ...payload }
  for (const field of DATE_FIELDS) {
    if (field in result && !result[field]) result[field] = null
  }
  return result
}

export function useActivityMutations() {
  const qc = useQueryClient()
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['activities'] })
    qc.invalidateQueries({ queryKey: ['client'] })
  }

  const create = useMutation({
    mutationFn: async (payload) => {
      const { data, error } = await supabase.from('activities').insert(sanitizeDates(payload)).select().single()
      if (error) throw error
      return data
    },
    onSuccess: () => { invalidate(); toast.success('Atividade criada') },
    onError: (e) => toast.error(e.message),
  })

  const update = useMutation({
    mutationFn: async ({ id, ...payload }) => {
      const { data, error } = await supabase.from('activities').update({ ...sanitizeDates(payload), updated_at: new Date().toISOString() }).eq('id', id).select().single()
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
