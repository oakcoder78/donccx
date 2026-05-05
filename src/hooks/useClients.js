import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'
import { useAuditLog } from './useAuditLog'
import toast from 'react-hot-toast'

const CLIENT_SELECT = `
  *,
  stage:stages(*),
  csm:profiles!clients_csm_id_fkey(id, name, email),
  client_catalog(id, catalog_item_id, status, catalog_items(*))
`

function buildClientsQuery(filters) {
  let q = supabase.from('clients').select(CLIENT_SELECT).order('name')
  if (filters.csm_id)   q = q.eq('csm_id', filters.csm_id)
  if (filters.stage_id) q = q.eq('stage_id', filters.stage_id)
  if (filters.search)   q = q.ilike('name', `%${filters.search}%`)
  if (filters.abc_class) q = q.eq('abc_class', filters.abc_class)
  if (filters.lifecycle_stage) q = q.eq('lifecycle_stage', filters.lifecycle_stage)
  return q
}

/** Default query — active companies only (contract_active = true). */
export function useClients(filters = {}, options = {}) {
  return useQuery({
    queryKey: ['clients', filters],
    ...options,
    queryFn: async () => {
      const { data, error } = await buildClientsQuery(filters).eq('contract_active', true)
      if (error) { console.error('[useClients] query error:', error); return [] }
      return data ?? []
    },
    retry: 0,
  })
}

/** Admin/recovery variant — includes inactive companies. */
export function useAllClients(filters = {}, options = {}) {
  return useQuery({
    queryKey: ['clients_all', filters],
    ...options,
    queryFn: async () => {
      const { data, error } = await buildClientsQuery(filters)
      if (error) { console.error('[useAllClients] query error:', error); return [] }
      return data ?? []
    },
    retry: 0,
  })
}

export function useClientMutations() {
  const qc = useQueryClient()
  const { logAction } = useAuditLog()

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['clients'] })
    qc.invalidateQueries({ queryKey: ['client'] })
  }

  const create = useMutation({
    mutationFn: async ({ catalogItems, ...payload }) => {
      const { data, error } = await supabase.from('clients').insert(payload).select().single()
      if (error) throw error
      if (catalogItems?.length) {
        await supabase.from('client_catalog').insert(
          catalogItems.map(item => {
            const cid = typeof item === 'object' ? item.catalog_item_id : item
            const st  = typeof item === 'object' ? (item.status || 'implantado') : 'implantado'
            return { client_id: data.id, catalog_item_id: cid, status: st }
          })
        )
      }
      await logAction('create_client', 'client', data.id, data.name, null, payload)
      return data
    },
    onSuccess: () => { invalidate(); toast.success('Cliente criado') },
    onError: (e) => toast.error(e.message),
  })

  const update = useMutation({
    mutationFn: async ({ id, catalogItems, ...payload }) => {
      // Fetch old data to detect field changes for audit
      const { data: oldData } = await supabase
        .from('clients')
        .select('name, csm_id, stage_id')
        .eq('id', id)
        .single()

      const { data, error } = await supabase
        .from('clients')
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single()
      if (error) throw error

      if (catalogItems !== undefined) {
        await supabase.from('client_catalog').delete().eq('client_id', id)
        if (catalogItems.length) {
          await supabase.from('client_catalog').insert(
            catalogItems.map(item => {
              const cid = typeof item === 'object' ? item.catalog_item_id : item
              const st  = typeof item === 'object' ? (item.status || 'implantado') : 'implantado'
              return { client_id: id, catalog_item_id: cid, status: st }
            })
          )
        }
      }

      // Log generic update
      await logAction('update_client', 'client', id, oldData?.name || String(id), oldData, payload)

      // Log specific changes
      if (payload.csm_id !== undefined && payload.csm_id !== oldData?.csm_id) {
        await logAction('change_csm', 'client', id, oldData?.name,
          { csm_id: oldData?.csm_id },
          { csm_id: payload.csm_id })
      }
      if (payload.stage_id !== undefined && payload.stage_id !== oldData?.stage_id) {
        await logAction('change_stage', 'client', id, oldData?.name,
          { stage_id: oldData?.stage_id },
          { stage_id: payload.stage_id })
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
      await logAction('delete_client', 'client', id, String(id), null, null)
    },
    onSuccess: () => { invalidate(); toast.success('Cliente removido') },
    onError: (e) => toast.error(e.message),
  })

  return { create, update, remove }
}
