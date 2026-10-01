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

/** PostgREST/RLS failures as a readable PT-BR message (406/PGRST116 = 0 rows via RLS). */
export function friendlyDbError(e) {
  const msg = String(e?.message || '')
  if (e?.code === '42501' || e?.status === 406 || e?.code === 'PGRST116'
    || /cannot coerce/i.test(msg) || /row-level security/i.test(msg)) {
    return 'Sem permissão para salvar o contrato — fale com um administrador'
  }
  // CHECK violations surface as the raw Postgres text; map the ones reachable from the form
  if (/contract_series_check/.test(msg)) return 'O fim da cobrança não pode ser antes do início.'
  if (/correction_percent_check/.test(msg)) return 'Percentual do reajuste precisa ser maior que 0 e no máximo 50.'
  if (/contract_series_due_day_check/.test(msg)) return 'Dia de vencimento precisa estar entre 1 e 31.'
  if (/chk_series_reason/.test(msg)) return 'Renegociação exige motivo com pelo menos 10 caracteres.'
  if (/chk_amount_xor_percent|amount_check|percent_check/.test(msg)) {
    return 'Valor e percentual são mutuamente exclusivos: informe apenas um, maior que zero.'
  }
  if (/invalid input syntax for type date/.test(msg)) return 'Data inválida — use o formato dd/mm/aaaa.'
  if (e?.code === '23514') return 'Valor fora do intervalo permitido — revise os campos informados.'
  return msg || 'Erro ao salvar'
}

/**
 * Materializes the recurrence horizon for one series: the signed term, plus 12
 * months ahead while the series rolls month to month, and past months marked as
 * adimplente. Called after the rules are saved (it replicates the last recurrence
 * row) and by the monthly job — the same DB function, so the two cannot drift.
 */
export async function ensureSeriesHorizon(seriesId) {
  const { error } = await supabase.rpc('ensure_series_horizon', { p_series_id: seriesId })
  if (error) throw error
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
        billing_type: series.billing_type || 'por_licenca',
        billing_base_value: series.billing_base_value ?? 0,
        billing_floor: series.billing_floor ?? 0,
        billing_status: series.billing_status || 'ativo',
        billing_suspended_until: series.billing_suspended_until || null,
        correction_index: series.correction_index || null,
        correction_anniversary: series.correction_anniversary || null,
        correction_percent: series.correction_percent !== '' && series.correction_percent != null
          ? Number(series.correction_percent) : null,
        correction_rule: series.correction_rule || null,
        usage_driven: series.usage_driven ?? false,
        contract_signed_date: series.contract_signed_date || null,
        // Signed term. Drives the horizon and the derived contract_renewal.
        contract_months: Number(series.contract_months) || null,
        // contract_renewal is NOT sent: it is derived from billing_start +
        // contract_months by trg_sync_contract_renewal. Sending it would be
        // ignored on update and rejected on insert.
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
    // No onError toast: the sole caller (ClientFormContent) toasts with context
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
        due_date: c.due_date || null,
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
    // No onError toast: the sole caller (ClientFormContent) toasts with context
  })
}

/**
 * Séries ativas cujo contrato assinado acabou e que ninguém decidiu o destino
 * ainda. Antes desta RPC a série simplesmente silenciava: parava de ser lançada
 * e sumia do cockpit, sem sinal de que havia uma decisão pendente.
 *
 * Séries com auto_renew não entram — rolar é a decisão que já foi tomada.
 */
export function useSeriesVencidas(enabled = true) {
  return useQuery({
    queryKey: ['series_vencidas'],
    enabled,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_series_vencidas')
      if (error) throw error
      return data ?? []
    },
  })
}

/**
 * Lifecycle actions on an expired series. Both are ordinary series writes, so
 * RLS already gates them through series_write; the UI additionally checks the
 * `contract_series_lifecycle` flag so Financeiro can restrict without a deploy.
 */
export function useSeriesLifecycleMutations() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ seriesId, action, reason }) => {
      if (action === 'encerrar') {
        const { error } = await supabase
          .from('contract_series')
          .update({ status: 'encerrada', reason: reason || null })
          .eq('id', seriesId)
        if (error) throw error
        return
      }
      if (action === 'renovar') {
        const { error } = await supabase
          .from('contract_series')
          .update({ auto_renew: true })
          .eq('id', seriesId)
        if (error) throw error
        // Roll immediately instead of waiting for the monthly job, so the
        // decision shows up in the cockpit right away.
        await ensureSeriesHorizon(seriesId)
        return
      }
      throw new Error(`Ação desconhecida: ${action}`)
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['series_vencidas'] })
      qc.invalidateQueries({ queryKey: ['contract_series'] })
      toast.success(vars.action === 'encerrar'
        ? 'Série encerrada'
        : 'Renovação automática ativada — a recorrência continua sendo lançada')
    },
    onError: (e) => toast.error(friendlyDbError(e)),
  })
}
