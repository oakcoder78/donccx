import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'
import { calculateHealthScore } from '../lib/healthScore'
import toast from 'react-hot-toast'

const FULL_CLIENT_SELECT = `
  *,
  stage:stages(*),
  csm:profiles!clients_csm_id_fkey(id, name, email),
  client_catalog(id, catalog_item_id, status, catalog_items(*)),
  contact_links(*, contacts(*, contact_phones(*))),
  activities(*, responsible:profiles(id,name), contacts(id,name)),
  milestones(*, milestone_tasks(*)),
  projects(id, status, end_date, milestones(id, title, due_date, status, milestone_tasks(id, done, due_date))),
  client_usage(*),
  client_support(*),
  client_catalog_history(*, catalog_items(type))
`

async function fetchRules() {
  const { data, error } = await supabase.from('health_rules').select('*')
  if (error) { console.error('[useHealthScore] fetchRules error:', error); return [] }
  return data ?? []
}

async function fetchWeights() {
  const { data, error } = await supabase
    .from('health_dimension_weights')
    .select('stage_group, dimension, weight')
  if (error) { console.error('[fetchWeights]', error); return null }

  const weights = {}
  for (const row of data ?? []) {
    if (!weights[row.stage_group]) weights[row.stage_group] = {}
    weights[row.stage_group][row.dimension] = row.weight
  }
  return weights
}

/**
 * Busca do banco os arrays necessários para o cálculo do health score.
 * Não depende do estado do React Query cache.
 */
async function fetchClientArrays(clientId) {
  const d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const activityCutoff = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

  const [usageRes, supportRes, activitiesRes, milestonesRes, historyRes, projectsRes] = await Promise.all([
    supabase
      .from('client_usage')
      .select('ref_month, os_created, active_users, pending, partial_day')
      .eq('client_id', clientId)
      .order('ref_month', { ascending: false }),
    supabase
      .from('client_support')
      .select('ref_month, tickets_opened, tickets_resolved, sla_first_response')
      .eq('client_id', clientId)
      .order('ref_month', { ascending: false }),
    supabase
      .from('activities')
      .select('type, activity_date')
      .eq('client_id', clientId)
      .gte('activity_date', activityCutoff),
    supabase
      .from('milestones')
      .select('id, title, due_date, status, milestone_tasks(id, done, due_date)')
      .eq('client_id', clientId),
    supabase
      .from('client_catalog_history')
      .select('catalog_item_id, status_novo, status_anterior, changed_at, catalog_items(type)')
      .eq('client_id', clientId)
      .order('changed_at', { ascending: false }),
    supabase
      .from('projects')
      .select('id, status, end_date, milestones(id, title, due_date, status, milestone_tasks(id, done, due_date))')
      .eq('client_id', clientId),
  ])

  if (usageRes.error)      console.error('[fetchClientArrays] client_usage error:', usageRes.error)
  if (supportRes.error)    console.error('[fetchClientArrays] client_support error:', supportRes.error)
  if (activitiesRes.error) console.error('[fetchClientArrays] activities error:', activitiesRes.error)
  if (milestonesRes.error) console.error('[fetchClientArrays] milestones error:', milestonesRes.error)
  if (historyRes.error)    console.error('[fetchClientArrays] catalog_history error:', historyRes.error)
  if (projectsRes.error)   console.error('[fetchClientArrays] projects error:', projectsRes.error)

  return {
    client_usage:           usageRes.data      ?? [],
    client_support:         supportRes.data    ?? [],
    activities:             activitiesRes.data ?? [],
    milestones:             milestonesRes.data ?? [],
    client_catalog_history: historyRes.data    ?? [],
    projects:               projectsRes.data   ?? [],
  }
}

/**
 * Calcula o health score a partir do objeto cliente e persiste no banco.
 * Busca os arrays de dados diretamente do banco para garantir dados frescos.
 * Se rules não for fornecido, busca do banco automaticamente.
 */
export async function recalculateAndSave(client, rules, weights) {
  const [effectiveRules, freshArrays, effectiveWeights] = await Promise.all([
    rules != null ? Promise.resolve(rules) : fetchRules(),
    fetchClientArrays(client.id),
    weights != null ? Promise.resolve(weights) : fetchWeights(),
  ])

  const enrichedClient = { ...client, ...freshArrays }

  const scores = calculateHealthScore(enrichedClient, effectiveRules, effectiveWeights)

  const now = new Date().toISOString()
  const { error } = await supabase
    .from('clients')
    .update({
      health_uso:            scores.uso,
      health_suporte:        scores.suporte,
      health_relacionamento: scores.relacionamento,
      health_financeiro:     scores.financeiro,
      health_projeto:        scores.projeto,
      health_total:          scores.total,
      health_calculated_at:  now,
      updated_at:            now,
    })
    .eq('id', client.id)

  if (error) throw error

  const refMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`
  const historyRow = {
    client_id:             client.id,
    ref_month:             refMonth,
    health_uso:            scores.uso,
    health_suporte:        scores.suporte,
    health_relacionamento: scores.relacionamento,
    health_financeiro:     scores.financeiro,
    health_projeto:        scores.projeto,
    health_total:          scores.total,
    recorded_at:           new Date().toISOString(),
  }
  const { error: histErr } = await supabase
    .from('health_score_history')
    .upsert(historyRow, { onConflict: 'client_id,ref_month' })
  if (histErr) console.error('[recalculateAndSave] health_score_history upsert error:', histErr)

  return scores
}

/**
 * Busca todos os clientes ativos com dados completos, recalcula o health
 * score de cada um e persiste. Retorna a quantidade de clientes atualizados.
 */
export async function recalculateAllHealthScores() {
  const [clientsResult, rules, weights] = await Promise.all([
    supabase.from('clients').select(FULL_CLIENT_SELECT).eq('contract_active', true),
    fetchRules(),
    fetchWeights(),
  ])

  if (clientsResult.error) throw clientsResult.error
  const clients = clientsResult.data ?? []
  if (!clients.length) return 0

  await Promise.all(clients.map(c => recalculateAndSave(c, rules, weights)))
  return clients.length
}

/**
 * Hook que expõe uma mutation para recalcular e salvar o health score.
 *
 * Uso:
 *   const recalculate = useRecalculateHealth()
 *   recalculate.mutate({ client, rules })   // passa rules diretamente (evita fetch extra)
 *   recalculate.mutate({ client })          // busca rules automaticamente via fetchRules()
 */
export function useRecalculateHealth() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: ({ client, rules }) => recalculateAndSave(client, rules),
    onSuccess: (scores, { client }) => {
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
