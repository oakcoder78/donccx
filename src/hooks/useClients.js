import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'
import { useAuditLog } from './useAuditLog'
import toast from 'react-hot-toast'

const FINANCIAL_COLS = 'mrr,licencas,valor_lic,billing_type,billing_base_value,billing_floor,correction_index,billing_status,billing_suspended_until'
const SAFE_CLIENT_COLS = 'id,name,cnpj,segment,csm_id,stage_id,stage_override,abc_class,contract_start,contract_renewal,delay_days,onb_start,golive,health_uso,health_suporte,health_relacionamento,health_financeiro,health_projeto,health_total,created_at,updated_at,fantasy_name,logo_url,contract_active,unidades_total,unidades_donc,segment_id,site,address_cep,address_street,address_number,address_complement,address_neighborhood,address_city,address_state,contract_signed_date,description,freshdesk_company_id,health_calculated_at,freshdesk_company_ids,csm_temperature,temperature_updated_at,temperature_note,lifecycle_stage,comercial_id,erp,ti_tipo'

function getClientSelect(includeFinancial) {
  const cols = includeFinancial ? '*' : SAFE_CLIENT_COLS
  return `
  ${cols},
  stage:stages(*),
  csm:profiles!clients_csm_id_fkey(id, name, email),
  comercial:profiles!clients_comercial_id_fkey(id, name, email),
  client_catalog(id, catalog_item_id, status, catalog_items(*)),
  onboardings(id, context, status, situacao_geral, created_at, end_date, projects(id))
`
}

const CLIENT_SELECT = getClientSelect(true)
const CLIENT_SELECT_SAFE = getClientSelect(false)

function buildClientsQuery(filters, includeFinancial = true) {
  const sel = includeFinancial ? CLIENT_SELECT : CLIENT_SELECT_SAFE
  let q = supabase.from('clients').select(sel).order('name')
  if (filters.csm_id)   q = q.eq('csm_id', filters.csm_id)
  if (filters.comercial_id) q = q.eq('comercial_id', filters.comercial_id)
  if (filters._labs_dual_owner) q = q.or(`csm_id.eq.${filters._labs_dual_owner},comercial_id.eq.${filters._labs_dual_owner}`)
  if (filters.stage_id) q = q.eq('stage_id', filters.stage_id)
  if (filters.search)   q = q.or(`name.ilike.%${filters.search}%,fantasy_name.ilike.%${filters.search}%`)
  if (filters.abc_class) q = q.eq('abc_class', filters.abc_class)
  if (filters.lifecycle_stage) q = q.eq('lifecycle_stage', filters.lifecycle_stage)
  if (filters.address_state) q = q.eq('address_state', filters.address_state)
  return q
}

/** Default query — active companies only (contract_active = true). */
export function useClients(filters = {}, options = {}) {
  const { includeFinancial = true, ...rest } = options
  // include in queryKey so cache separates financial vs safe
  const qk = ['clients', filters, includeFinancial]
  return useQuery({
    queryKey: qk,
    ...rest,
    queryFn: async () => {
      const { data, error } = await buildClientsQuery(filters, includeFinancial).eq('contract_active', true)
      if (error) { console.error('[useClients] query error:', error); return [] }
      return data ?? []
    },
    retry: 0,
  })
}

/** Admin/recovery variant — includes inactive companies. */
export function useAllClients(filters = {}, options = {}) {
  const { includeFinancial = true, ...rest } = options
  const qk = ['clients_all', filters, includeFinancial]
  return useQuery({
    queryKey: qk,
    ...rest,
    queryFn: async () => {
      const { data, error } = await buildClientsQuery(filters, includeFinancial)
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
        .select('name, csm_id, comercial_id, stage_id')
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
        const currentIds = catalogItems.map(item =>
          typeof item === 'object' ? item.catalog_item_id : item
        )

        // Delete entries no longer in the selection
        let query = supabase.from('client_catalog').delete().eq('client_id', id)
        if (currentIds.length > 0) {
          query = query.filter('catalog_item_id', 'not.in', `(${currentIds.join(',')})`)
        }
        const { error: delErr } = await query
        if (delErr) throw delErr

        // Upsert current entries (handles duplicates via onConflict)
        if (catalogItems.length) {
          const { error: upsErr } = await supabase
            .from('client_catalog')
            .upsert(
              catalogItems.map(item => ({
                client_id: id,
                catalog_item_id: typeof item === 'object' ? item.catalog_item_id : item,
                status: typeof item === 'object' ? (item.status || 'implantado') : 'implantado',
              })),
              { onConflict: 'client_id,catalog_item_id' }
            )
          if (upsErr) throw upsErr
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
      if (payload.comercial_id !== undefined && payload.comercial_id !== oldData?.comercial_id) {
        await logAction('change_comercial', 'client', id, oldData?.name,
          { comercial_id: oldData?.comercial_id },
          { comercial_id: payload.comercial_id })
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
