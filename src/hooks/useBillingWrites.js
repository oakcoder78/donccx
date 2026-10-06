import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'

// Escrita do faturamento. Toda regra (saldo, teto, estorno, auditoria) fica no
// banco: a tela so envia o que a pessoa digitou e mostra o erro que o banco
// devolve. Depois de cada acao, as leituras que mudam sao refeitas.

export function useBillingLancamentos(invoiceId, enabled = true) {
  return useQuery({
    queryKey: ['billing_lancamentos', invoiceId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('billing_cockpit_lancamentos', { p_invoice_id: invoiceId })
      if (error) throw error
      return data || []
    },
    enabled: enabled && !!invoiceId,
    staleTime: 0,
  })
}

function useInvalidarFaturamento() {
  const qc = useQueryClient()
  return (competencia) => {
    qc.invalidateQueries({ queryKey: ['billing_clientes', competencia] })
    qc.invalidateQueries({ queryKey: ['billing_motivos', competencia] })
    qc.invalidateQueries({ queryKey: ['billing_faturas'] })
    qc.invalidateQueries({ queryKey: ['billing_lancamentos'] })
    qc.invalidateQueries({ queryKey: ['billing_extrato'] })
  }
}

function rpc(name, args) {
  return supabase.rpc(name, args).then(({ data, error }) => {
    if (error) throw error
    return data
  })
}

// Baixa: pagamento parcial ou total. Valor nao pode passar do saldo.
export function useSettle(competencia) {
  const invalidar = useInvalidarFaturamento()
  return useMutation({
    mutationFn: ({ invoiceId, amount, happenedAt, method, externalRef, note }) =>
      rpc('settle_invoice', {
        p_invoice_id: invoiceId,
        p_amount: amount,
        p_happened_at: happenedAt,
        p_method: method,
        p_external_ref: externalRef || null,
        p_note: note || null,
        p_batch_id: null,
      }),
    onSuccess: () => invalidar(competencia),
  })
}

// Desconto de uma fatura (modo aplicar). Motivo obrigatorio no banco.
export function useDiscount(competencia) {
  const invalidar = useInvalidarFaturamento()
  return useMutation({
    mutationFn: ({ invoiceId, amount, reason }) =>
      rpc('discount_invoice', { p_invoice_id: invoiceId, p_amount: amount, p_reason: reason, p_batch_id: null }),
    onSuccess: () => invalidar(competencia),
  })
}

// Desconto distribuido entre faturas escolhidas, proporcional com teto.
export function useDiscountBatch(competencia) {
  const invalidar = useInvalidarFaturamento()
  return useMutation({
    mutationFn: ({ invoiceIds, total, reason }) =>
      rpc('discount_batch', { p_invoice_ids: invoiceIds, p_total: total, p_reason: reason }),
    onSuccess: () => invalidar(competencia),
  })
}

// Baixa por perda (incobravel). Tipo proprio, separado de desconto.
export function useWriteOff(competencia) {
  const invalidar = useInvalidarFaturamento()
  return useMutation({
    mutationFn: ({ invoiceId, amount, reason, happenedAt }) =>
      rpc('write_off_invoice', {
        p_invoice_id: invoiceId, p_amount: amount, p_reason: reason, p_happened_at: happenedAt || null,
      }),
    onSuccess: () => invalidar(competencia),
  })
}

// Estorno de um lancamento. Valor padrao: o restante estornavel.
export function useReverse(competencia) {
  const invalidar = useInvalidarFaturamento()
  return useMutation({
    mutationFn: ({ entryId, reason, amount }) =>
      rpc('reverse_entry', { p_entry_id: entryId, p_reason: reason, p_amount: amount ?? null, p_happened_at: null }),
    onSuccess: () => invalidar(competencia),
  })
}

// Ajuste de valor da fatura, com motivo e auditoria. Abaixo do liquidado, recusa.
export function useAdjust(competencia) {
  const invalidar = useInvalidarFaturamento()
  return useMutation({
    mutationFn: ({ invoiceId, newAmount, reason }) =>
      rpc('adjust_invoice', { p_invoice_id: invoiceId, p_new_amount: newAmount, p_reason: reason }),
    onSuccess: () => invalidar(competencia),
  })
}

// Cancelamento. Se `substituta` e true (so recorrencia), o motor reemite a
// competencia daquela serie. O valor e recalculado: pode diferir do cancelado.
export function useCancel(competencia) {
  const invalidar = useInvalidarFaturamento()
  return useMutation({
    mutationFn: async ({ invoiceId, reason, substituta, seriesId }) => {
      await rpc('cancel_invoice', { p_invoice_id: invoiceId, p_reason: reason })
      if (substituta && seriesId) {
        await rpc('close_competencia', {
          p_competencia: competencia, p_mode: 'real', p_force: false, p_series_ids: [seriesId],
        })
      }
      return true
    },
    onSuccess: () => invalidar(competencia),
  })
}

// Encerrar com corte: cobra a competencia corrente da serie (base integral +
// excedente ate hoje) e encerra a serie. O banco confere uso e emissao.
export function useEncerrarComCorte(competencia) {
  const invalidar = useInvalidarFaturamento()
  return useMutation({
    mutationFn: ({ seriesId, motivo, confirmoUso }) =>
      rpc('encerrar_com_corte', { p_series_id: seriesId, p_motivo: motivo, p_confirmo_uso: confirmoUso }),
    onSuccess: () => invalidar(competencia),
  })
}
