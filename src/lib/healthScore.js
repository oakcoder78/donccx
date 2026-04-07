/**
 * calculateHealthScore(client)
 *
 * Recebe o objeto completo do cliente (conforme useClient.js) e retorna:
 * { total, uso, suporte, relacionamento, financeiro, projeto }
 *
 * Cada dimensão: 0–20 pts. Total: soma das 5, capped em [0, 100].
 */

// ─── FINANCEIRO ────────────────────────────────────────────────────────────────
function calcFinanceiro(client) {
  let pts = 0

  // ABC class
  const abc = { A: 15, B: 10, C: 5 }
  pts += abc[client.abc_class] ?? 0

  // Dias em atraso
  const d = client.delay_days ?? 0
  if (d === 0)      pts += 5
  else if (d <= 15) pts += 3
  else if (d <= 30) pts += 0
  else if (d <= 60) pts -= 3
  else              pts -= 5

  return clamp(pts, 0, 20)
}

// ─── USO ───────────────────────────────────────────────────────────────────────
function calcUso(client) {
  // Estágios que recebem pontuação neutra imediata (sem análise de tendência)
  const stageName = (client.stage?.name ?? '').toLowerCase().trim()
  const neutralStages = ['sem estágio', 'onboarding', 'estabilização', 'em espera', 'churned']
  if (neutralStages.includes(stageName)) return 6

  // Contrato inativo: sem pontuação
  if (client.contract_active === false) return 0

  // Tendência por métrica: compara valor atual com média dos 3 meses anteriores
  function scoreTrend(values) {
    if (values.length < 2) return 3               // histórico insuficiente: neutro
    const cur   = values[0]
    const prev3 = values.slice(1, 4)
    const avg   = prev3.reduce((s, v) => s + v, 0) / prev3.length
    if (cur > avg * 1.10) return  5               // crescimento > 10%
    if (cur < avg * 0.90) return -5               // queda > 10%
    return 3                                      // estável ±10%
  }

  const usage = [...(client.client_usage ?? [])]
    .sort((a, b) => b.ref_month.localeCompare(a.ref_month))

  let pts = 0
  pts += scoreTrend(usage.map(u => u.os_created   ?? 0))
  pts += scoreTrend(usage.map(u => u.active_users ?? 0))

  // Bônus/penalidades por mudança de status no mês corrente (via client_catalog_history)
  const now = new Date()
  const currentYM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  const historyThisMonth = (client.client_catalog_history ?? []).filter(h => {
    if (!h.changed_at) return false
    if (h.catalog_items?.type !== 'solucao') return false
    const d = new Date(h.changed_at)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` === currentYM
  })

  const implantadoApplied = new Set()
  const abandonadoApplied = new Set()

  historyThisMonth.forEach(h => {
    const key = h.catalog_item_id
    // Módulo concluiu implantação (+5, max uma vez por módulo)
    if (
      h.status_novo === 'implantado' &&
      h.status_anterior != null &&
      h.status_anterior !== 'implantado' &&
      !implantadoApplied.has(key)
    ) {
      pts += 5
      implantadoApplied.add(key)
    }
    // Módulo foi abandonado (-3, max uma vez por módulo)
    if (
      h.status_novo === 'abandonado' &&
      h.status_anterior !== 'abandonado' &&
      !abandonadoApplied.has(key)
    ) {
      pts -= 3
      abandonadoApplied.add(key)
    }
  })

  return clamp(pts, 0, 20)
}

// ─── SUPORTE ───────────────────────────────────────────────────────────────────
function calcSuporte(client) {
  const support = [...(client.client_support ?? [])]
    .sort((a, b) => b.ref_month.localeCompare(a.ref_month))
  const latest = support[0]

  if (!latest) return 10 // sem dados: score neutro

  let pts = 0
  const opened   = latest.tickets_opened   ?? 0
  const resolved = latest.tickets_resolved ?? 0

  // Tickets abertos
  if (opened === 0)      pts += 8
  else if (opened <= 3)  pts += 5
  else if (opened <= 7)  pts += 3
  else if (opened <= 15) pts += 0
  else                   pts -= 5

  // Taxa resolução (resolvidos / abertos)
  const taxa = opened > 0 ? resolved / opened : 1
  if (taxa >= 0.9)      pts += 7
  else if (taxa >= 0.7) pts += 4
  else if (taxa >= 0.5) pts += 0
  else                  pts -= 5

  // N3% — n3_pct armazena CONTAGEM de tickets N3 (não percentual)
  const n3Count = latest.n3_pct ?? 0
  const n3Pct   = resolved > 0 ? (n3Count / resolved) * 100 : 0
  if (n3Pct === 0)      pts += 5
  else if (n3Pct <= 5)  pts += 3
  else if (n3Pct <= 10) pts += 0
  else                  pts -= 5

  // SLA de primeira resposta (média em minutos)
  const slaFirst = latest.sla_first_response ?? null
  if (slaFirst !== null) {
    if (slaFirst <= 15)      pts += 3
    else if (slaFirst <= 60) pts += 1
    // > 60: +0
  }

  return clamp(pts, 0, 20)
}

// ─── RELACIONAMENTO ────────────────────────────────────────────────────────────
function calcRelacionamento(client) {
  let pts = 0

  // Atividades últimos 90 dias
  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
  const typeWeight = { email: 0.5, whatsapp: 1, reuniao: 2, ligacao: 1 }
  const actScore = (client.activities ?? [])
    .filter(a => a.activity_date && new Date(a.activity_date + 'T00:00:00') >= cutoff)
    .reduce((sum, a) => sum + (typeWeight[a.type] ?? 0), 0)
  pts += Math.min(10, actScore)

  // Contatos cadastrados via contact_links
  const links = client.contact_links ?? []
  if (links.length >= 3)      pts += 5
  else if (links.length >= 1) pts += 3

  // Mapa de poder: presença de Decisor
  const hasDecisao = links.some(l => l.papel === 'Decisor')
  if (hasDecisao) pts += 5

  // Champion
  const hasChampion = links.some(l => l.champion === true)
  if (hasChampion) pts += 3

  // Engajamento: bônus se maioria dos links é 'Alto'
  const engLinks = links.filter(l => l.engajamento != null)
  if (engLinks.length > 0) {
    const altoCount = engLinks.filter(l => l.engajamento === 'Alto').length
    if (altoCount > engLinks.length / 2) pts += 2
  }

  return clamp(pts, 0, 20)
}

// ─── PROJETO ───────────────────────────────────────────────────────────────────
function calcProjeto(client) {
  const milestones = client.milestones ?? []

  // Sem milestones: checar se está em produção há >120 dias
  if (milestones.length === 0) {
    const isProducao = client.stage?.name === 'Produção'
    if (isProducao && client.golive) {
      const days = Math.floor(
        (Date.now() - new Date(client.golive + 'T00:00:00').getTime()) / 86400000
      )
      if (days > 120) return 0 // sem milestones em produção → alerta
    }
    return 10 // neutro (onboarding sem milestones ainda)
  }

  let pts = 0
  const total = milestones.length
  const done  = milestones.filter(m => m.status === 'done').length
  const donePct = done / total

  // % milestones concluídos
  if (donePct === 1)        pts += 10
  else if (donePct >= 0.75) pts += 7
  else if (donePct >= 0.5)  pts += 4
  // abaixo de 50%: +0

  // Tarefas em atraso: tasks não concluídas em milestones com due_date passado
  const today = new Date(); today.setHours(0, 0, 0, 0)
  let overdueTaskCount = 0
  milestones.forEach(m => {
    if (m.status === 'done') return
    if (!m.due_date) return
    if (new Date(m.due_date + 'T00:00:00') >= today) return
    overdueTaskCount += (m.milestone_tasks ?? []).filter(t => !t.done).length
  })

  if (overdueTaskCount === 0)     pts += 10
  else if (overdueTaskCount <= 2) pts += 7
  else if (overdueTaskCount <= 5) pts += 4
  // acima de 5: +0

  return clamp(pts, 0, 20)
}

// ─── TOTAL ─────────────────────────────────────────────────────────────────────
export function calculateHealthScore(client) {
  const financeiro    = calcFinanceiro(client)
  const uso           = calcUso(client)
  const suporte       = calcSuporte(client)
  const relacionamento = calcRelacionamento(client)
  const projeto       = calcProjeto(client)

  const total = clamp(financeiro + uso + suporte + relacionamento + projeto, 0, 100)

  return { total, uso, suporte, relacionamento, financeiro, projeto }
}

function clamp(val, min, max) {
  return Math.min(max, Math.max(min, val))
}
