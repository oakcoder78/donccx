/**
 * health-recalc — Supabase Edge Function
 *
 * Recalcula o health score de clientes e persiste em clients + health_score_history.
 *
 * Body: { client_ids?: number[] }
 *   - Se client_ids fornecido: recalcula apenas esses clientes
 *   - Se omitido: recalcula todos com contract_active=true e lifecycle_stage='cliente'
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2"

// ─── CONSTANTS ─────────────────────────────────────────────────────────────────

const FASE_TYPE_IDS = {
  KICKOFF: 1, DEFINICAO_ESCOPO: 2, PROJETO_TECNICO: 3,
  PREPARACAO_PLATAFORMA: 4, TREINAMENTO: 5, GOLIVE: 6,
}
const NEUTRAL_STAGES = ['sem estágio', 'onboarding', 'estabilização', 'em espera', 'churned']
const ALWAYS_INCLUDE = new Set([
  'no_proj', 'mp_ok', 'os_stable', 'usr_stable',
  't0', 't15_ok', 'sla_ok', 'eng_high', 'fin_ok',
])

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

// ─── TYPES ─────────────────────────────────────────────────────────────────────

interface Rule {
  rule_key: string
  label: string
  points: number
}

interface AppliedRule {
  rule_key: string
  label: string
  points: number
}

// ─── HELPERS ───────────────────────────────────────────────────────────────────

function clamp(val: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, val))
}

function applyRule(rules: Rule[], key: string, appliedRules: AppliedRule[]): number {
  if (!Array.isArray(rules)) return 0
  const rule = rules.find(r => r.rule_key === key)
  if (!rule) return 0
  if (rule.points !== 0 || ALWAYS_INCLUDE.has(key)) {
    appliedRules.push({ rule_key: rule.rule_key, label: rule.label, points: rule.points })
  }
  return rule.points
}

function isNeutralStage(client: any): boolean {
  return NEUTRAL_STAGES.includes((client.stage?.name ?? '').toLowerCase().trim())
}

function resolveStageGroup(client: any): string {
  const stageName = (client.stage?.name ?? '').toLowerCase().trim()
  if (stageName === 'onboarding') return 'onboarding'
  const hasActiveProject = (client.projects ?? []).some((p: any) =>
    p.status === 'em_andamento' || p.status === 'planejado'
  )
  return hasActiveProject ? 'producao' : 'producao_sem_projeto'
}

function calcTemperatura(client: any): number {
  const temp = client.csm_temperature ?? 0
  const updatedAt = client.temperature_updated_at
  if (!updatedAt) return 0
  const daysSince = (Date.now() - new Date(updatedAt).getTime()) / (1000 * 60 * 60 * 24)
  if (daysSince > 30) return 0
  return temp
}

// ─── USO ───────────────────────────────────────────────────────────────────────

function calcUso(client: any, rules: Rule[]): { score: number; appliedRules: AppliedRule[] } {
  if (!Array.isArray(rules) || !rules.length) return { score: 20, appliedRules: [] }
  if (isNeutralStage(client)) return { score: 20, appliedRules: [] }

  const usage = [...(client.client_usage ?? [])].sort((a: any, b: any) =>
    b.ref_month.localeCompare(a.ref_month)
  )
  if (usage.length < 2) return { score: 20, appliedRules: [] }

  const effectiveUsage = usage.filter((u: any, idx: number) =>
    !(u.partial_day !== null && u.partial_day !== undefined && idx === 0)
  )
  if (effectiveUsage.length < 2) return { score: 20, appliedRules: [] }

  const appliedRules: AppliedRule[] = []
  let mod = 0

  const cur   = effectiveUsage[0]
  const last3 = effectiveUsage.slice(1, 4)
  const avg3OS    = last3.reduce((s: number, u: any) => s + (u.os_created   ?? 0), 0) / last3.length
  const avg3Users = last3.reduce((s: number, u: any) => s + (u.active_users ?? 0), 0) / last3.length

  const osChg = avg3OS > 0 ? ((cur.os_created ?? 0) - avg3OS) / avg3OS : 0
  if (osChg > 0.35)       mod += applyRule(rules, 'os_up',    appliedRules)
  else if (osChg < -0.35) mod += applyRule(rules, 'os_down',  appliedRules)
  else                    mod += applyRule(rules, 'os_stable', appliedRules)

  const userChg = avg3Users > 0 ? ((cur.active_users ?? 0) - avg3Users) / avg3Users : 0
  if (userChg > 0.35)       mod += applyRule(rules, 'usr_up',    appliedRules)
  else if (userChg < -0.35) mod += applyRule(rules, 'usr_down',  appliedRules)
  else                      mod += applyRule(rules, 'usr_stable', appliedRules)

  const refMonth = cur.ref_month
  const historyThisMonth = (client.client_catalog_history ?? []).filter((h: any) => {
    if (!h.changed_at) return false
    if (h.catalog_items?.type !== 'solucao') return false
    const d  = new Date(h.changed_at)
    const hm = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    return hm === refMonth
  })

  const implantadoApplied = new Set<number>()
  const abandonadoApplied = new Set<number>()

  historyThisMonth.forEach((h: any) => {
    const key = h.catalog_item_id
    if (
      h.status_novo === 'implantado' &&
      h.status_anterior != null &&
      h.status_anterior !== 'implantado' &&
      !implantadoApplied.has(key)
    ) {
      mod += applyRule(rules, 'mod_new', appliedRules)
      implantadoApplied.add(key)
    }
    if (
      h.status_novo === 'abandonado' &&
      h.status_anterior !== 'abandonado' &&
      !abandonadoApplied.has(key)
    ) {
      mod += applyRule(rules, 'mod_abandoned', appliedRules)
      abandonadoApplied.add(key)
    }
  })

  return { score: clamp(20 + mod, 0, 20), appliedRules }
}

// ─── SUPORTE ───────────────────────────────────────────────────────────────────

function calcSuporte(client: any, rules: Rule[]): { score: number; appliedRules: AppliedRule[] } {
  if (!Array.isArray(rules) || !rules.length) return { score: 20, appliedRules: [] }
  if (isNeutralStage(client)) return { score: 20, appliedRules: [] }

  const support = [...(client.client_support ?? [])].sort((a: any, b: any) =>
    b.ref_month.localeCompare(a.ref_month)
  )
  const latest = support[0]
  if (!latest) return { score: 20, appliedRules: [] }

  const appliedRules: AppliedRule[] = []
  let mod = 0

  const opened   = latest.tickets_opened   ?? 0
  const resolved = latest.tickets_resolved ?? 0
  const taxa     = opened > 0 ? resolved / opened : 1

  if (opened === 0) {
    mod += applyRule(rules, 't0', appliedRules)
  } else if (opened <= 15) {
    mod += applyRule(rules, taxa >= 0.9 ? 't15_ok' : 't15_nok', appliedRules)
  } else {
    mod += applyRule(rules, taxa >= 0.9 ? 'thi_ok' : 'thi_nok', appliedRules)
  }

  const sla = latest.sla_first_response ?? null
  if (sla !== null) {
    mod += applyRule(rules, sla <= 15 ? 'sla_ok' : 'sla_nok', appliedRules)
  }

  return { score: clamp(20 + mod, 0, 20), appliedRules }
}

// ─── RELACIONAMENTO ────────────────────────────────────────────────────────────

function calcRelacionamento(client: any, rules: Rule[]): { score: number; appliedRules: AppliedRule[] } {
  if (!Array.isArray(rules) || !rules.length) return { score: 20, appliedRules: [] }
  if (isNeutralStage(client)) return { score: 20, appliedRules: [] }

  const appliedRules: AppliedRule[] = []
  let mod = 0

  const links = client.contact_links ?? []

  const hasDecisor = links.some((l: any) => l.papel?.toLowerCase() === 'decisor')
  if (!hasDecisor) {
    const refDate = client.golive || client.contract_start
    let monthsSince = 0
    if (refDate) {
      const d   = new Date(refDate + 'T00:00:00')
      const now = new Date()
      monthsSince = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth())
    }
    if (monthsSince <= 1)      mod += applyRule(rules, 'nd_m1', appliedRules)
    else if (monthsSince <= 2) mod += applyRule(rules, 'nd_m2', appliedRules)
    else                       mod += applyRule(rules, 'nd_m3', appliedRules)
  }

  if (!links.some((l: any) => l.champion === true)) {
    mod += applyRule(rules, 'no_champ', appliedRules)
  }

  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const recentActs = (client.activities ?? []).filter((a: any) =>
    a.activity_date && new Date(a.activity_date + 'T00:00:00') >= cutoff
  )
  const hasHigh = recentActs.some((a: any) => a.type === 'reuniao' || a.type === 'ligacao')
  const hasMid  = recentActs.some((a: any) => a.type === 'email'   || a.type === 'whatsapp')

  if (recentActs.length === 0 || (!hasHigh && !hasMid)) {
    mod += applyRule(rules, 'eng_low', appliedRules)
  } else if (hasHigh) {
    mod += applyRule(rules, 'eng_high', appliedRules)
  } else {
    mod += applyRule(rules, 'eng_mid', appliedRules)
  }

  return { score: clamp(20 + mod, 0, 20), appliedRules }
}

// ─── FINANCEIRO ────────────────────────────────────────────────────────────────

function calcFinanceiro(client: any, rules: Rule[]): { score: number; appliedRules: AppliedRule[] } {
  if (!Array.isArray(rules) || !rules.length) return { score: 20, appliedRules: [] }
  const appliedRules: AppliedRule[] = []
  let mod = 0

  const days = parseInt(client.delay_days, 10) || 0
  if (days === 0)       mod += applyRule(rules, 'fin_ok', appliedRules)
  else if (days <= 30)  mod += applyRule(rules, 'fin_30', appliedRules)
  else if (days <= 60)  mod += applyRule(rules, 'fin_60', appliedRules)
  else                  mod += applyRule(rules, 'fin_90', appliedRules)

  return { score: clamp(20 + mod, 0, 20), appliedRules }
}

// ─── PROJETO ───────────────────────────────────────────────────────────────────

function calcProjeto(client: any, rules: Rule[]): { score: number; appliedRules: AppliedRule[] } {
  if (!Array.isArray(rules) || !rules.length) return { score: 20, appliedRules: [] }

  const appliedRules: AppliedRule[] = []
  let mod = 0

  const todayStr = new Date().toISOString().slice(0, 10)
  const activeOnboardings = (client.onboardings ?? []).filter((o: any) =>
    o.status !== 'concluido' && o.status !== 'cancelado'
  )

  if (activeOnboardings.length === 0) {
    applyRule(rules, 'no_proj', appliedRules)
    return { score: 20, appliedRules }
  }

  if (activeOnboardings.some((o: any) => o.status === 'travado')) {
    mod += applyRule(rules, 'onb_travado', appliedRules)
  }
  if (activeOnboardings.some((o: any) => o.status === 'atencao')) {
    mod += applyRule(rules, 'onb_atencao', appliedRules)
  }

  const lateFases = activeOnboardings.flatMap((o: any) =>
    (o.onboarding_fases ?? []).filter((f: any) =>
      f.status !== 'concluida' && f.planned_end && f.planned_end < todayStr
    )
  )
  for (let i = 0; i < Math.min(lateFases.length, 3); i++) {
    mod += applyRule(rules, 'mp_late', appliedRules)
  }
  if (lateFases.length === 0) applyRule(rules, 'mp_ok', appliedRules)

  const hasOverdueActivity = activeOnboardings.some((o: any) =>
    (o.onboarding_activities ?? []).some((a: any) =>
      a.status !== 'concluido' && a.due_date && a.due_date < todayStr
    )
  )
  if (hasOverdueActivity) mod += applyRule(rules, 'onb_atividade_vencida', appliedRules)

  const onboarding = activeOnboardings[0]
  if (onboarding) {
    const goLiveFase = onboarding.onboarding_fases?.find(
      (f: any) => f.fase_type_id === FASE_TYPE_IDS.GOLIVE
    )
    if (goLiveFase?.occurred_at) {
      const daysSinceGoLive =
        (Date.now() - new Date(goLiveFase.occurred_at).getTime()) / (1000 * 60 * 60 * 24)
      if (daysSinceGoLive > 90) {
        const hasPendingFases = onboarding.onboarding_fases?.some((f: any) => f.status !== 'concluida')
        if (hasPendingFases) mod += applyRule(rules, 'ob_late', appliedRules)
      }
    }
  }

  return { score: clamp(20 + mod, 0, 20), appliedRules }
}

// ─── CALCULATE HEALTH SCORE ────────────────────────────────────────────────────

function calculateHealthScore(
  client: any,
  rules: Rule[] = [],
  weights: Record<string, Record<string, number>> | null = null,
) {
  if (client.contract_active === false) {
    return {
      total: 0, uso: 0, suporte: 0, relacionamento: 0, financeiro: 0, projeto: 0, temperatura: 0,
      stageGroup: 'producao',
      appliedRules: { uso: [], suporte: [], relacionamento: [], financeiro: [], projeto: [] },
    }
  }

  const stageGroup = resolveStageGroup(client)
  const W = weights?.[stageGroup] ?? {
    uso: 20, relacionamento: 20, projeto: 20, suporte: 20, financeiro: 20, temperatura: 0,
  }

  const uso            = calcUso(client, rules)
  const suporte        = calcSuporte(client, rules)
  const relacionamento = calcRelacionamento(client, rules)
  const financeiro     = calcFinanceiro(client, rules)
  const projeto        = calcProjeto(client, rules)
  const temperaturaVal = calcTemperatura(client)

  const weightedUso            = W.uso            > 0 ? (uso.score            / 20) * W.uso            : 0
  const weightedSuporte        = W.suporte        > 0 ? (suporte.score        / 20) * W.suporte        : 0
  const weightedRelacionamento = W.relacionamento > 0 ? (relacionamento.score / 20) * W.relacionamento : 0
  const weightedFinanceiro     = W.financeiro     > 0 ? (financeiro.score     / 20) * W.financeiro     : 0
  const weightedProjeto        = W.projeto        > 0 ? (projeto.score        / 20) * W.projeto        : 0
  const weightedTemperatura    = W.temperatura    > 0 ? (temperaturaVal       / 20) * W.temperatura    : 0

  const total = clamp(
    Math.round(
      weightedUso + weightedSuporte + weightedRelacionamento +
      weightedFinanceiro + weightedProjeto + weightedTemperatura
    ),
    0, 100,
  )

  return {
    total,
    uso:            uso.score,
    suporte:        suporte.score,
    relacionamento: relacionamento.score,
    financeiro:     financeiro.score,
    projeto:        projeto.score,
    temperatura:    temperaturaVal,
    stageGroup,
    appliedRules: {
      uso:            uso.appliedRules,
      suporte:        suporte.appliedRules,
      relacionamento: relacionamento.appliedRules,
      financeiro:     financeiro.appliedRules,
      projeto:        projeto.appliedRules,
    },
  }
}

// ─── FETCH CLIENT ARRAYS ───────────────────────────────────────────────────────

async function fetchClientArrays(admin: SupabaseClient, clientId: number) {
  const d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const activityCutoff = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

  const [usageRes, supportRes, activitiesRes, historyRes, projectsRes, onboardingsRes] = await Promise.all([
    admin.from('client_usage')
      .select('ref_month, os_created, active_users, pending, partial_day')
      .eq('client_id', clientId)
      .order('ref_month', { ascending: false }),
    admin.from('client_support')
      .select('ref_month, tickets_opened, tickets_resolved, sla_first_response')
      .eq('client_id', clientId)
      .order('ref_month', { ascending: false }),
    admin.from('activities')
      .select('type, activity_date')
      .eq('client_id', clientId)
      .gte('activity_date', activityCutoff),
    admin.from('client_catalog_history')
      .select('catalog_item_id, status_novo, status_anterior, changed_at, catalog_items(type)')
      .eq('client_id', clientId)
      .order('changed_at', { ascending: false }),
    admin.from('projects')
      .select('id, status, end_date')
      .eq('client_id', clientId),
    admin.from('onboardings')
      .select('id, context, status, situacao_geral, created_at, end_date')
      .eq('client_id', clientId),
  ])

  const onboardings = onboardingsRes.data ?? []
  const onboardingIds = onboardings.map((o: any) => o.id)

  let fases: any[] = []
  let atividades: any[] = []

  if (onboardingIds.length > 0) {
    const [fasesRes, atividadesRes] = await Promise.all([
      admin.from('onboarding_fases')
        .select('id, onboarding_id, fase_type_id, status, planned_end, occurred_at')
        .in('onboarding_id', onboardingIds),
      admin.from('onboarding_activities')
        .select('id, onboarding_id, status, due_date, fase_id')
        .in('onboarding_id', onboardingIds),
    ])
    fases     = fasesRes.data     ?? []
    atividades = atividadesRes.data ?? []
  }

  const onboardingsComFases = onboardings.map((o: any) => ({
    ...o,
    onboarding_fases:      fases.filter((f: any) => f.onboarding_id === o.id),
    onboarding_activities: atividades.filter((a: any) => a.onboarding_id === o.id),
  }))

  return {
    client_usage:           usageRes.data      ?? [],
    client_support:         supportRes.data    ?? [],
    activities:             activitiesRes.data ?? [],
    client_catalog_history: historyRes.data    ?? [],
    projects:               projectsRes.data   ?? [],
    onboardings:            onboardingsComFases,
  }
}

// ─── MAIN ──────────────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
    if (!token) return json({ error: 'Unauthorized' }, 401)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    let authorized = false

    if (token === serviceKey) {
      authorized = true
    } else {
      const { data: { user }, error: authErr } = await admin.auth.getUser(token)
      if (!authErr && user) {
        const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).maybeSingle()
        authorized = ['admin', 'manager'].includes(profile?.role ?? '')
      }
    }

    if (!authorized) return json({ error: 'Forbidden' }, 403)

    const body = await req.json().catch(() => ({})) as { client_ids?: number[] }
    const clientIds = body.client_ids

    // Fetch rules and weights
    const [rulesRes, weightsRes] = await Promise.all([
      admin.from('health_rules').select('*'),
      admin.from('health_dimension_weights').select('stage_group, dimension, weight'),
    ])
    const rules = rulesRes.data ?? []
    const weightsRaw: Record<string, Record<string, number>> = {}
    for (const row of weightsRes.data ?? []) {
      if (!weightsRaw[row.stage_group]) weightsRaw[row.stage_group] = {}
      weightsRaw[row.stage_group][row.dimension] = row.weight
    }
    const weights = Object.keys(weightsRaw).length ? weightsRaw : null

    // Fetch clients
    let clientQuery = admin
      .from('clients')
      .select('id, name, contract_active, csm_temperature, temperature_updated_at, delay_days, golive, contract_start, stage:stages(name), contact_links(id, papel, champion)')
      .eq('contract_active', true)

    if (clientIds?.length) {
      clientQuery = clientQuery.in('id', clientIds)
    } else {
      clientQuery = clientQuery.eq('lifecycle_stage', 'cliente')
    }

    const { data: clients, error: clientsErr } = await clientQuery
    if (clientsErr) return json({ error: clientsErr.message }, 500)

    let recalculated = 0
    const errors: { client_id: number; error: string }[] = []

    for (const client of clients ?? []) {
      try {
        const arrays   = await fetchClientArrays(admin, client.id)
        const enriched = { ...client, ...arrays }
        const scores   = calculateHealthScore(enriched, rules, weights)

        const now = new Date().toISOString()
        const { error: updateErr } = await admin.from('clients').update({
          health_uso:            scores.uso,
          health_suporte:        scores.suporte,
          health_relacionamento: scores.relacionamento,
          health_financeiro:     scores.financeiro,
          health_projeto:        scores.projeto,
          health_total:          scores.total,
          health_calculated_at:  now,
          updated_at:            now,
        }).eq('id', client.id)
        if (updateErr) throw new Error(updateErr.message)

        const refMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`
        await admin.from('health_score_history').upsert({
          client_id:             client.id,
          ref_month:             refMonth,
          health_uso:            scores.uso,
          health_suporte:        scores.suporte,
          health_relacionamento: scores.relacionamento,
          health_financeiro:     scores.financeiro,
          health_projeto:        scores.projeto,
          health_total:          scores.total,
          recorded_at:           new Date().toISOString(),
        }, { onConflict: 'client_id,ref_month' })

        recalculated++
      } catch (err) {
        console.error(`health-recalc: client_id=${client.id}`, err)
        errors.push({ client_id: client.id, error: String(err) })
      }
    }

    return json({ recalculated, errors })
  } catch (err) {
    console.error('health-recalc:', err)
    return json({ error: String(err) }, 500)
  }
})
