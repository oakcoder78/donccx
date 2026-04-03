import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'
import toast from 'react-hot-toast'

export function useCatalog() {
  return useQuery({
    queryKey: ['catalog'],
    queryFn: async () => {
      const { data, error } = await supabase.from('catalog_items').select('*').order('type').order('name')
      if (error) { console.error('[useCatalog] query error:', error); throw error }
      return data
    },
  })
}

export function useCatalogMutations() {
  const qc = useQueryClient()
  const invalidate = () => qc.invalidateQueries({ queryKey: ['catalog'] })

  const create = useMutation({
    mutationFn: async (payload) => {
      const { data, error } = await supabase.from('catalog_items').insert(payload).select().single()
      if (error) throw error
      return data
    },
    onSuccess: () => { invalidate(); toast.success('Item criado') },
    onError: (e) => toast.error(e.message),
  })

  const update = useMutation({
    mutationFn: async ({ id, ...payload }) => {
      const { data, error } = await supabase.from('catalog_items').update(payload).eq('id', id).select().single()
      if (error) throw error
      return data
    },
    onSuccess: () => { invalidate(); toast.success('Item atualizado') },
    onError: (e) => toast.error(e.message),
  })

  const remove = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('catalog_items').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => { invalidate(); toast.success('Item removido') },
    onError: (e) => toast.error(e.message),
  })

  return { create, update, remove }
}
