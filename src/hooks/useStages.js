import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'
import toast from 'react-hot-toast'

export function useStages() {
  return useQuery({
    queryKey: ['stages'],
    queryFn: async () => {
      const { data, error } = await supabase.from('stages').select('*').order('display_order')
      if (error) { console.error('[useStages] query error:', error); throw error }
      return data
    },
  })
}

export function useStagesMutations() {
  const qc = useQueryClient()
  const invalidate = () => qc.invalidateQueries({ queryKey: ['stages'] })

  const create = useMutation({
    mutationFn: async (payload) => {
      const { data, error } = await supabase.from('stages').insert(payload).select().single()
      if (error) throw error
      return data
    },
    onSuccess: () => { invalidate(); toast.success('Estágio criado') },
    onError: (e) => toast.error(e.message),
  })

  const update = useMutation({
    mutationFn: async ({ id, ...payload }) => {
      const { data, error } = await supabase.from('stages').update(payload).eq('id', id).select().single()
      if (error) throw error
      return data
    },
    onSuccess: () => { invalidate(); toast.success('Estágio atualizado') },
    onError: (e) => toast.error(e.message),
  })

  const remove = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('stages').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => { invalidate(); toast.success('Estágio removido') },
    onError: (e) => toast.error(e.message),
  })

  return { create, update, remove }
}
