import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'
import toast from 'react-hot-toast'

const CLIENT_SELECT = `
  *,
  stage:stages(*),
  csm:profiles!clients_csm_id_fkey(id, name, email),
  client_catalog(catalog_item_id, catalog_items(*))
`

export function useClients(filters = {}, options = {}) {
  return useQuery({
    queryKey: ['clients', filters],
    ...options,
    queryFn: async () => {
      let q = supabase.from('clients').select(CLIENT_SELECT).order('name')

      if (filters.csm_id) q = q.eq('csm_id', filters.csm_id)
      if (filters.stage_id) q = q.eq('stage_id', filters.stage_id)
      if (filters.search) q = q.ilike('name', `%${filters.search}%`)
      if (filters.abc_class) q = q.eq('abc_class', filters.abc_class)

      const { data, error } = await q
      if (error) { console.error('[useClients] query error:', error); return [] }
      return data ?? []
    },
    retry: 0,
  })
}

export function useClientMutations() {
  const qc = useQueryClient()
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['clients'] })
    qc.invalidateQueries({ queryKey: ['client'] })
  }

  const create = useMutation({
    mutationFn: async ({ catalogItems, ...payload }) => {
      const { data, error } = await supabase.from('clients').insert(payload).select().single()
      if (error) throw error
      if (catalogItems?.length) {
        await supabase.from('client_catalog').insert(catalogItems.map(id => ({ client_id: data.id, catalog_item_id: id })))
      }
      return data
    },
    onSuccess: () => { invalidate(); toast.success('Cliente criado') },
    onError: (e) => toast.error(e.message),
  })

  const update = useMutation({
    mutationFn: async ({ id, catalogItems, ...payload }) => {
      const { data, error } = await supabase.from('clients').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', id).select().single()
      if (error) throw error
      if (catalogItems !== undefined) {
        await supabase.from('client_catalog').delete().eq('client_id', id)
        if (catalogItems.length) {
          await supabase.from('client_catalog').insert(catalogItems.map(cid => ({ client_id: id, catalog_item_id: cid })))
        }
      }
      return data
    },
    onSuccess: () => { invalidate(); toast.success('Cliente atualizado') },
    onError: (e) => toast.error(e.message),
  })

  const remove = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('clients').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => { invalidate(); toast.success('Cliente removido') },
    onError: (e) => toast.error(e.message),
  })

  return { create, update, remove }
}
