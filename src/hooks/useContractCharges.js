import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'
import toast from 'react-hot-toast'

export function useContractCharges(clientId) {
  return useQuery({
    queryKey: ['contract_charges', clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contract_charges')
        .select('*')
        .eq('client_id', clientId)
        .order('month_index')
      if (error) throw error
      return data ?? []
    },
  })
}

export function useContractSeries(clientId) {
  return useQuery({
    queryKey: ['contract_series', clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contract_series')
        .select('*')
        .eq('client_id', clientId)
        .order('billing_start')
      if (error) throw error
      return data ?? []
    },
  })
}

export function useContractSeriesMutations(clientId) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ series, clientId: overrideId, userId }) => {
      // series: { id?, label, kind, billing_start, billing_end, due_day, auto_renew, status, reason }
      const id = overrideId || clientId
      if (!id) throw new Error('Cliente não identificado para salvar a série')
      if (series.kind === 'renegociacao' && !(series.reason || '').trim()) {
        throw new Error('Renegociação exige motivo (mínimo 10 caracteres)')
      }
      const payload = {
        client_id: id,
        label: series.label || 'Contrato original',
        kind: series.kind || 'original',
        billing_start: series.billing_start,
        billing_end: series.billing_end || null,
        due_day: series.due_day || Number(String(series.billing_start).slice(8, 10)) || 5,
        auto_renew: !!series.auto_renew,
        status: series.status || 'ativa',
        reason: series.reason || null,
        created_by: userId || null,
      }
      let query = supabase.from('contract_series')
      if (series.id) {
        query = query.update(payload).eq('id', series.id)
      } else {
        query = query.insert(payload)
      }
      const { data, error } = await query.select().single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contract_series', clientId] })
      toast.success('Série salva')
    },
    onError: (e) => toast.error(e.message),
  })
}

export function useContractChargesMutations(clientId) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ charges, clientId: overrideId, seriesId, userId }) => {
      // charges: expanded array of { month_index, kind, mode, amount, percent, label, installment_group, installments_total, ref_month, reason }
      // clientId override lets the create flow target the freshly created client id
      // seriesId scopes the replace to one series (outras séries intactas)
      const id = overrideId || clientId
      if (!id) throw new Error('Cliente não identificado para salvar o contrato')
      // Validate reason length BEFORE delete (DB CHECK >= 10)
      for (const c of charges || []) {
        if (c.reason != null && String(c.reason).trim() !== '' && String(c.reason).trim().length < 10) {
          throw new Error('Motivo precisa de ao menos 10 caracteres')
        }
      }
      let del = supabase.from('contract_charges').delete().eq('client_id', id)
      if (seriesId) del = del.eq('series_id', seriesId)
      const { error: delErr } = await del
      if (delErr) throw delErr
      if (!charges || charges.length === 0) return []
      const payload = charges.map(c => ({
        client_id: id,
        series_id: c.series_id || seriesId || null,
        kind: c.kind || 'recorrencia',
        mode: c.mode,
        month_index: c.month_index,
        ref_month: c.ref_month || null,
        amount: c.mode === 'absolute' ? c.amount : null,
        percent: c.mode === 'percent' ? c.percent : null,
        installment_group: c.installment_group || null,
        installments_total: c.installments_total || null,
        label: c.label || null,
        reason: c.reason || null,
        created_by: userId || null,
      }))
      const { data, error } = await supabase.from('contract_charges').insert(payload).select()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contract_charges', clientId] })
      toast.success('Regras de contrato salvas')
    },
    onError: (e) => toast.error(e.message),
  })
}
