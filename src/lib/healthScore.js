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
  let pts = 0

  // Módulos contratados (type === 'solucao')
  const solucoes = (client.client_catalog ?? [])
    .filter(cc => cc.catalog_items?.type === 'solucao').length

  if (solucoes >= 4)      pts += 10
  else if (solucoes >= 2) pts += 7
  else if (solucoes === 1) pts += 3

  // Isenção para clientes em Onboarding: sem penalidade de OS ou usuários ativos
  if (client.stage?.name === 'Onboarding') {
    return clamp(pts + 5, 0, 20)
  }

  // 2 meses mais recentes de client_usage
  const usage = [...(client.client_usage ?? [])]
    .sort((a, b) => b.ref_month.localeCompare(a.ref_month))
  const cur = usage[0]
  const prev = usage[1]

  if (cur && prev) {
    // Usuários ativos: crescimento vs mês anterior
    const userChg = prev.active_users > 0
      ? (cur.active_users - prev.active_users) / prev.active_users
      : 0
    if (userChg >= 0.1)       pts += 5   // crescimento ≥10%
    else if (userChg >= -0.1) pts += 3   // estável
    else if (userChg >= -0.3) pts += 0   // queda 10-30%
    else                      pts -= 5   // queda >30%

    // Volume OS
    const osChg = prev.os_created > 0
      ? (cur.os_created - prev.os_created) / prev.os_created
      : 0
    if (osChg < -0.2)  pts -= 3   // queda >20%
    else if (osChg > 0) pts += 2  // qualquer crescimento
    // estável: +0
  } else if (cur) {
    pts += 3  // só um mês disponível: assume estável
  }

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
