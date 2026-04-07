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

// Regras que entram em appliedRules mesmo com points = 0 (indicam estado)
const ALWAYS_INCLUDE = new Set(['no_proj', 'mp_ok'])

function applyRule(rules, key, appliedRules) {
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

// ─── USO ───────────────────────────────────────────────────────────────────────
function calcUso(client, rules) {
  if (isNeutralStage(client)) return { score: 20, appliedRules: [] }

  const usage = [...(client.client_usage ?? [])]
    .sort((a, b) => b.ref_month.localeCompare(a.ref_month))

  if (usage.length < 2) return { score: 20, appliedRules: [] }

  const appliedRules = []
  let mod = 0

  const cur   = usage[0]
  const last3 = usage.slice(1, 4)
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
  if (isNeutralStage(client)) return { score: 20, appliedRules: [] }

  const appliedRules = []
  let mod = 0

  const links = client.contact_links ?? []

  // Decisor
  const hasDecisor = links.some(l => l.papel === 'Decisor')
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
  // Sempre calcula — não respeita estágio neutro
  const appliedRules = []
  let mod = 0

  const d = client.delay_days ?? 0
  if (d === 0)      mod += applyRule(rules, 'fin_ok',  appliedRules)
  else if (d <= 30) mod += applyRule(rules, 'fin_30',  appliedRules)
  else if (d <= 60) mod += applyRule(rules, 'fin_60',  appliedRules)
  else              mod += applyRule(rules, 'fin_90',  appliedRules)

  return { score: clamp(20 + mod, 0, 20), appliedRules }
}

// ─── PROJETO ───────────────────────────────────────────────────────────────────
function calcProjeto(client, rules) {
  if (isNeutralStage(client)) return { score: 20, appliedRules: [] }

  const appliedRules = []
  let mod = 0

  const milestones = client.milestones ?? []

  if (milestones.length === 0) {
    applyRule(rules, 'no_proj', appliedRules) // 0 pts, entra para indicar estado
    return { score: 20, appliedRules }
  }

  // Onboarding atrasado: golive + 90 dias e há milestones 'onboarding' não concluídos
  if (client.golive) {
    const goliveDate = new Date(client.golive + 'T00:00:00')
    const cutoff90   = new Date(goliveDate.getTime() + 90 * 24 * 60 * 60 * 1000)
    if (new Date() > cutoff90) {
      const hasLateOnb = milestones.some(m => /onboarding/i.test(m.title) && m.status !== 'done')
      if (hasLateOnb) mod += applyRule(rules, 'ob_late', appliedRules)
    }
  }

  // Milestones atrasados (máx. 3 aplicações de mp_late)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const lateMilestones = milestones.filter(m =>
    m.status !== 'done' && m.due_date && new Date(m.due_date + 'T00:00:00') < today
  )
  const lateCount = Math.min(lateMilestones.length, 3)
  for (let i = 0; i < lateCount; i++) {
    mod += applyRule(rules, 'mp_late', appliedRules)
  }

  // Milestones no prazo: nenhum atrasado
  if (lateMilestones.length === 0) {
    applyRule(rules, 'mp_ok', appliedRules) // 0 pts, entra para indicar estado
  }

  return { score: clamp(20 + mod, 0, 20), appliedRules }
}

// ─── TOTAL ─────────────────────────────────────────────────────────────────────
export function calculateHealthScore(client, rules = []) {
  if (client.contract_active === false) {
    return {
      total: 0, uso: 0, suporte: 0, relacionamento: 0, financeiro: 0, projeto: 0,
      appliedRules: { uso: [], suporte: [], relacionamento: [], financeiro: [], projeto: [] },
    }
  }

  const uso           = calcUso(client, rules)
  const suporte       = calcSuporte(client, rules)
  const relacionamento = calcRelacionamento(client, rules)
  const financeiro    = calcFinanceiro(client, rules)
  const projeto       = calcProjeto(client, rules)

  const total = clamp(
    uso.score + suporte.score + relacionamento.score + financeiro.score + projeto.score,
    0, 100
  )

  return {
    total,
    uso:           uso.score,
    suporte:       suporte.score,
    relacionamento: relacionamento.score,
    financeiro:    financeiro.score,
    projeto:       projeto.score,
    appliedRules: {
      uso:           uso.appliedRules,
      suporte:       suporte.appliedRules,
      relacionamento: relacionamento.appliedRules,
      financeiro:    financeiro.appliedRules,
      projeto:       projeto.appliedRules,
    },
  }
}
