import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'
import { calculateHealthScore } from '../lib/healthScore'
import toast from 'react-hot-toast'

/**
 * Calcula o health score a partir do objeto cliente e persiste no banco.
 * Pode ser chamado como função pura (fora de hooks) se necessário.
 */
export async function recalculateAndSave(client) {
  const scores = calculateHealthScore(client)

  const { error } = await supabase
    .from('clients')
    .update({
      health_total:          scores.total,
      health_uso:            scores.uso,
      health_suporte:        scores.suporte,
      health_relacionamento: scores.relacionamento,
      health_financeiro:     scores.financeiro,
      health_projeto:        scores.projeto,
      updated_at:            new Date().toISOString(),
    })
    .eq('id', client.id)

  if (error) throw error
  return scores
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
      qc.invalidateQueries({ queryKey: ['client', client.id] })
      qc.invalidateQueries({ queryKey: ['clients'] })
      toast.success(
        `Health Score atualizado: ${scores.total} pts`,
        { icon: '🩺' }
      )
    },
    onError: (e) => toast.error(e.message || 'Erro ao recalcular health score'),
  })
}
