/**
 * calculateHealthScore(client, rules)
 *
 * Recebe o objeto completo do cliente e o array de health_rules do banco.
 * Cada dimensão parte de 20 e recebe modificadores negativos.
 * Retorna: { total, uso, suporte, relacionamento, financeiro, projeto, appliedRules }
 */

// ─── HELPERS ───────────────────────────────────────────────────────────────────

function clamp(val, min, max) {
  return Math.min(max, Math.max(min, val))
}

// Regras que entram em appliedRules mesmo com points = 0 (indicam estado saudável/neutro)
const ALWAYS_INCLUDE = new Set([
  'no_proj', 'mp_ok',
  'os_stable', 'usr_stable',
  't0', 't15_ok', 'sla_ok',
  'eng_high',
  'fin_ok',
])

function applyRule(rules, key, appliedRules) {
  if (!Array.isArray(rules)) return 0
  const rule = rules.find(r => r.rule_key === key)
  if (!rule) return 0
  if (rule.points !== 0 || ALWAYS_INCLUDE.has(key)) {
    appliedRules.push({ rule_key: rule.rule_key, label: rule.label, points: rule.points })
  }
  return rule.points
}

const NEUTRAL_STAGES = ['sem estágio', 'onboarding', 'estabilização', 'em espera', 'churned']

function isNeutralStage(client) {
  return NEUTRAL_STAGES.includes((client.stage?.name ?? '').toLowerCase().trim())
}

function resolveStageGroup(client) {
  const stageName = (client.stage?.name ?? '').toLowerCase().trim()
  const onboardingStages = ['onboarding']
  if (onboardingStages.includes(stageName)) return 'onboarding'

  const hasActiveProject = (client.projects ?? []).some(p =>
    p.status === 'em_andamento' || p.status === 'planejado'
  )
  return hasActiveProject ? 'producao' : 'producao_sem_projeto'
}

function calcTemperatura(client) {
  const temp = client.csm_temperature ?? 0
  const updatedAt = client.temperature_updated_at
  if (!updatedAt) return 0
  const daysSince = (Date.now() - new Date(updatedAt).getTime()) / (1000 * 60 * 60 * 24)
  if (daysSince > 30) return 0
  return temp
}

// ─── USO ───────────────────────────────────────────────────────────────────────
function calcUso(client, rules) {
  if (!Array.isArray(rules) || !rules.length) return { score: 20, appliedRules: [] }
  if (isNeutralStage(client)) return { score: 20, appliedRules: [] }

  const usage = [...(client.client_usage ?? [])]
    .sort((a, b) => b.ref_month.localeCompare(a.ref_month))

  if (usage.length < 2) return { score: 20, appliedRules: [] }

  const effectiveUsage = usage.filter((u, idx) => !(u.partial_day !== null && u.partial_day !== undefined && idx === 0))
  if (effectiveUsage.length < 2) return { score: 20, appliedRules: [] }

  const appliedRules = []
  let mod = 0

  const cur   = effectiveUsage[0]
  const last3 = effectiveUsage.slice(1, 4)
  const avg3OS    = last3.reduce((s, u) => s + (u.os_created   ?? 0), 0) / last3.length
  const avg3Users = last3.reduce((s, u) => s + (u.active_users ?? 0), 0) / last3.length

  // Tendência OS
  const osChg = avg3OS > 0 ? ((cur.os_created ?? 0) - avg3OS) / avg3OS : 0
  if (osChg > 0.35)       mod += applyRule(rules, 'os_up',     appliedRules)
  else if (osChg < -0.35) mod += applyRule(rules, 'os_down',   appliedRules)
  else                    mod += applyRule(rules, 'os_stable',  appliedRules)

  // Tendência usuários ativos
  const userChg = avg3Users > 0 ? ((cur.active_users ?? 0) - avg3Users) / avg3Users : 0
  if (userChg > 0.35)       mod += applyRule(rules, 'usr_up',    appliedRules)
  else if (userChg < -0.35) mod += applyRule(rules, 'usr_down',  appliedRules)
  else                      mod += applyRule(rules, 'usr_stable', appliedRules)

  // Bônus/penalidades por mudança de status no ref_month do registro mais recente
  const refMonth = cur.ref_month
  const historyThisMonth = (client.client_catalog_history ?? []).filter(h => {
    if (!h.changed_at) return false
    if (h.catalog_items?.type !== 'solucao') return false
    const d  = new Date(h.changed_at)
    const hm = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    return hm === refMonth
  })

  const implantadoApplied = new Set()
  const abandonadoApplied = new Set()

  historyThisMonth.forEach(h => {
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
function calcSuporte(client, rules) {
  if (!Array.isArray(rules) || !rules.length) return { score: 20, appliedRules: [] }
  if (isNeutralStage(client)) return { score: 20, appliedRules: [] }

  const support = [...(client.client_support ?? [])]
    .sort((a, b) => b.ref_month.localeCompare(a.ref_month))
  const latest = support[0]

  if (!latest) return { score: 20, appliedRules: [] }

  const appliedRules = []
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
function calcRelacionamento(client, rules) {
  if (!Array.isArray(rules) || !rules.length) return { score: 20, appliedRules: [] }
  if (isNeutralStage(client)) return { score: 20, appliedRules: [] }

  const appliedRules = []
  let mod = 0

  const links = client.contact_links ?? []

  // Decisor
  const hasDecisor = links.some(l => l.papel?.toLowerCase() === 'decisor')
  if (!hasDecisor) {
    const refDate = client.golive || client.contract_start
    let monthsSince = 0
    if (refDate) {
      const d   = new Date(refDate + 'T00:00:00')
      const now = new Date()
      monthsSince = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth())
    }
    if (monthsSince <= 1)     mod += applyRule(rules, 'nd_m1', appliedRules)
    else if (monthsSince <= 2) mod += applyRule(rules, 'nd_m2', appliedRules)
    else                       mod += applyRule(rules, 'nd_m3', appliedRules)
  }

  // Champion
  if (!links.some(l => l.champion === true)) {
    mod += applyRule(rules, 'no_champ', appliedRules)
  }

  // Engajamento: atividades últimos 30 dias
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const recentActs = (client.activities ?? []).filter(a =>
    a.activity_date && new Date(a.activity_date + 'T00:00:00') >= cutoff
  )
  const hasHigh = recentActs.some(a => a.type === 'reuniao' || a.type === 'ligacao')
  const hasMid  = recentActs.some(a => a.type === 'email'   || a.type === 'whatsapp')

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
function calcFinanceiro(client, rules) {
  if (!Array.isArray(rules) || !rules.length) return { score: 20, appliedRules: [] }
  // Sempre calcula — não respeita estágio neutro
  const appliedRules = []
  let mod = 0

  const days = parseInt(client.delay_days, 10) || 0
  if (days === 0)       mod += applyRule(rules, 'fin_ok',  appliedRules)
  else if (days <= 30)  mod += applyRule(rules, 'fin_30',  appliedRules)
  else if (days <= 60)  mod += applyRule(rules, 'fin_60',  appliedRules)
  else                  mod += applyRule(rules, 'fin_90',  appliedRules)

  return { score: clamp(20 + mod, 0, 20), appliedRules }
}

// ─── PROJETO ───────────────────────────────────────────────────────────────────
function calcProjeto(client, rules) {
  if (!Array.isArray(rules) || !rules.length) return { score: 20, appliedRules: [] }

  const appliedRules = []
  let mod = 0

  const todayStr = new Date().toISOString().slice(0, 10)
  const activeOnboardings = (client.onboardings ?? []).filter(o =>
    o.status !== 'concluido' && o.status !== 'cancelado'
  )

  if (activeOnboardings.length === 0) {
    applyRule(rules, 'no_proj', appliedRules)
    return { score: 20, appliedRules }
  }

  // onb_travado: onboarding bloqueado
  if (activeOnboardings.some(o => o.status === 'travado')) {
    mod += applyRule(rules, 'onb_travado', appliedRules)
  }

  // onb_atencao: onboarding requer atenção
  if (activeOnboardings.some(o => o.status === 'atencao')) {
    mod += applyRule(rules, 'onb_atencao', appliedRules)
  }

  // mp_late: fases com planned_end vencido (máx. 3)
  const lateFases = activeOnboardings.flatMap(o =>
    (o.onboarding_fases ?? []).filter(f =>
      f.status !== 'concluida' && f.planned_end && f.planned_end < todayStr
    )
  )
  for (let i = 0; i < Math.min(lateFases.length, 3); i++) {
    mod += applyRule(rules, 'mp_late', appliedRules)
  }
  if (lateFases.length === 0) applyRule(rules, 'mp_ok', appliedRules)

  // onb_atividade_vencida: atividade de onboarding vencida
  const hasOverdueActivity = activeOnboardings.some(o =>
    (o.onboarding_activities ?? []).some(a =>
      a.status !== 'concluido' && a.due_date && a.due_date < todayStr
    )
  )
  if (hasOverdueActivity) mod += applyRule(rules, 'onb_atividade_vencida', appliedRules)

  // ob_late: Go-Live concluído há 90+ dias e ainda há fases pendentes
  const onboarding = activeOnboardings[0]
  if (onboarding) {
    const goLiveFase = onboarding.onboarding_fases?.find(f => f.onboarding_fase_types?.name === 'Go-Live')
    if (goLiveFase?.occurred_at) {
      const daysSinceGoLive = (Date.now() - new Date(goLiveFase.occurred_at).getTime()) / (1000 * 60 * 60 * 24)
      if (daysSinceGoLive > 90) {
        const hasPendingFases = onboarding.onboarding_fases?.some(f => f.status !== 'concluida')
        if (hasPendingFases) mod += applyRule(rules, 'ob_late', appliedRules)
      }
    }
  }

  return { score: clamp(20 + mod, 0, 20), appliedRules }
}

// ─── TOTAL ─────────────────────────────────────────────────────────────────────
export function calculateHealthScore(client, rules = [], weights = null) {
  if (client.contract_active === false) {
    return {
      total: 0, uso: 0, suporte: 0, relacionamento: 0, financeiro: 0, projeto: 0, temperatura: 0,
      stageGroup: 'producao',
      appliedRules: { uso: [], suporte: [], relacionamento: [], financeiro: [], projeto: [] },
    }
  }

  const stageGroup = resolveStageGroup(client)

  const W = weights?.[stageGroup] ?? {
    uso: 20, relacionamento: 20, projeto: 20, suporte: 20, financeiro: 20, temperatura: 0
  }

  const uso            = calcUso(client, rules)
  const suporte        = calcSuporte(client, rules)
  const relacionamento = calcRelacionamento(client, rules)
  const financeiro     = calcFinanceiro(client, rules)
  const projeto = calcProjeto(client, rules)
  const temperaturaVal = calcTemperatura(client)

  const weightedUso            = W.uso            > 0 ? (uso.score            / 20) * W.uso            : 0
  const weightedSuporte        = W.suporte        > 0 ? (suporte.score        / 20) * W.suporte        : 0
  const weightedRelacionamento = W.relacionamento > 0 ? (relacionamento.score / 20) * W.relacionamento : 0
  const weightedFinanceiro     = W.financeiro     > 0 ? (financeiro.score     / 20) * W.financeiro     : 0
  const weightedProjeto        = W.projeto        > 0 ? (projeto.score        / 20) * W.projeto        : 0
  const weightedTemperatura    = W.temperatura    > 0 ? (temperaturaVal       / 20) * W.temperatura    : 0

  const total = clamp(
    Math.round(weightedUso + weightedSuporte + weightedRelacionamento + weightedFinanceiro + weightedProjeto + weightedTemperatura),
    0, 100
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
      uso:           uso.appliedRules,
      suporte:       suporte.appliedRules,
      relacionamento: relacionamento.appliedRules,
      financeiro:    financeiro.appliedRules,
      projeto:       projeto.appliedRules,
    },
  }
}
