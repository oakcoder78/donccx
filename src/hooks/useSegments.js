import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'
import toast from 'react-hot-toast'

export function useSegments() {
  return useQuery({
    queryKey: ['segments'],
    retry: 0,
    queryFn: async () => {
      const { data, error } = await supabase.from('segments').select('*').order('name')
      if (error) { console.error('[useSegments] query error:', error); return [] }
      return data ?? []
    },
  })
}

export function useSegmentsMutations() {
  const qc = useQueryClient()
  const invalidate = () => qc.invalidateQueries({ queryKey: ['segments'] })

  const create = useMutation({
    mutationFn: async (name) => {
      const { data, error } = await supabase.from('segments').insert({ name }).select().single()
      if (error) throw error
      return data
    },
    onSuccess: () => { invalidate(); toast.success('Segmento criado') },
    onError: (e) => toast.error(e.message),
  })

  const update = useMutation({
    mutationFn: async ({ id, name }) => {
      const { data, error } = await supabase.from('segments').update({ name }).eq('id', id).select().single()
      if (error) throw error
      return data
    },
    onSuccess: () => { invalidate(); toast.success('Segmento atualizado') },
    onError: (e) => toast.error(e.message),
  })

  const remove = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('segments').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => { invalidate(); toast.success('Segmento removido') },
    onError: (e) => toast.error(e.message),
  })

  return { create, update, remove }
}
