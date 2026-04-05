import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'
import { calculateHealthScore } from '../lib/healthScore'
import toast from 'react-hot-toast'

const FULL_CLIENT_SELECT = `
  *,
  stage:stages(*),
  csm:profiles!clients_csm_id_fkey(id, name, email),
  client_catalog(catalog_item_id, catalog_items(*)),
  contact_links(*, contacts(*, contact_phones(*))),
  activities(*, responsible:profiles(id,name), contacts(id,name)),
  milestones(*, milestone_tasks(*)),
  client_usage(*),
  client_support(*)
`

/**
 * Calcula o health score a partir do objeto cliente e persiste no banco.
 * Pode ser chamado como função pura (fora de hooks) se necessário.
 */
export async function recalculateAndSave(client) {
  const scores = calculateHealthScore(client)

  const { error } = await supabase
    .from('clients')
    .update({
      health_uso:            scores.uso,
      health_suporte:        scores.suporte,
      health_relacionamento: scores.relacionamento,
      health_financeiro:     scores.financeiro,
      health_projeto:        scores.projeto,
      health_total:          scores.total,
      updated_at:            new Date().toISOString(),
    })
    .eq('id', client.id)

  if (error) throw error
  return scores
}

/**
 * Busca todos os clientes ativos com dados completos, recalcula o health
 * score de cada um e persiste. Retorna a quantidade de clientes atualizados.
 */
export async function recalculateAllHealthScores() {
  const { data: clients, error } = await supabase
    .from('clients')
    .select(FULL_CLIENT_SELECT)
    .eq('contract_active', true)

  if (error) throw error
  if (!clients?.length) return 0

  await Promise.all(clients.map(c => recalculateAndSave(c)))
  return clients.length
}

/**
 * Hook que expõe uma mutation para recalcular e salvar o health score.
 *
 * Uso:
 *   const recalculate = useRecalculateHealth()
 *   recalculate.mutate(client)          // sem feedback de toast
 *   recalculate.mutateAsync(client)     // com await
 */
export function useRecalculateHealth() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: recalculateAndSave,
    onSuccess: (scores, client) => {
      qc.invalidateQueries({ queryKey: ['client', String(client.id)] })
      qc.invalidateQueries({ queryKey: ['clients'] })
      toast.success(
        `Health Score atualizado: ${scores.total} pts`,
        { icon: '🩺' }
      )
    },
    onError: (e) => toast.error(e.message || 'Erro ao recalcular health score'),
  })
}
