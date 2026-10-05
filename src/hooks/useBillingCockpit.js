import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'

// Cockpit novo de faturamento (Fase 4). Consome as RPCs de leitura da migration
// 20261005150000 e os dois modos do motor (close_competencia). Nada aqui calcula
// valor: o motor e a unica fonte de cobranca.

export function useBillingClientes(competencia, enabled = true) {
  return useQuery({
    queryKey: ['billing_clientes', competencia],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('billing_cockpit_clientes', { p_competencia: competencia })
      if (error) throw error
      return data || []
    },
    enabled: enabled && !!competencia,
    staleTime: 60 * 1000,
  })
}

// Motivo e projecao por serie: so quem pode escrever recebe linhas (ver migration).
export function useBillingMotivos(competencia, enabled = true) {
  return useQuery({
    queryKey: ['billing_motivos', competencia],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('billing_cockpit_motivos', { p_competencia: competencia })
      if (error) throw error
      return data || []
    },
    enabled: enabled && !!competencia,
    staleTime: 60 * 1000,
  })
}

export function useBillingFaturas(clientId, competencia, enabled = true) {
  return useQuery({
    queryKey: ['billing_faturas', clientId, competencia],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('billing_cockpit_faturas', {
        p_client_id: clientId,
        p_competencia: competencia,
      })
      if (error) throw error
      return data || []
    },
    enabled: enabled && !!clientId && !!competencia,
    staleTime: 60 * 1000,
  })
}

// Preview: calcula o que o fechamento emitiria, sem gravar nada.
export function useClosePreview() {
  return useMutation({
    mutationFn: async (competencia) => {
      const { data, error } = await supabase.rpc('close_competencia', {
        p_competencia: competencia,
        p_mode: 'preview',
        p_force: false,
        p_series_ids: null,
      })
      if (error) throw error
      return data || []
    },
  })
}

// Real: emite as faturas. Idempotente pelo motor; o cache das leituras e refeito.
export function useCloseCompetencia() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (competencia) => {
      const { data, error } = await supabase.rpc('close_competencia', {
        p_competencia: competencia,
        p_mode: 'real',
        p_force: false,
        p_series_ids: null,
      })
      if (error) throw error
      return data || []
    },
    onSuccess: (_data, competencia) => {
      qc.invalidateQueries({ queryKey: ['billing_clientes', competencia] })
      qc.invalidateQueries({ queryKey: ['billing_motivos', competencia] })
      qc.invalidateQueries({ queryKey: ['billing_faturas'] })
    },
  })
}
