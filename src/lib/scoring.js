// Central scoring helpers — single source for health/usage signals
// Extracted from DashboardPage.jsx and ClientHealthDrawer to avoid fork
// Thresholds for scoreBand must come from health_config (threshold_healthy/threshold_attention), not hardcode

export const C = {
  navy: '#173557',
  navyDeep: '#0f2540',
  navySoft: '#1f4068',
  navyLine: 'rgba(255,255,255,0.10)',
  navyLineStrong: 'rgba(255,255,255,0.18)',
  navyTextMuted: 'rgba(255,255,255,0.62)',
  navyTextSoft: 'rgba(255,255,255,0.78)',
  sky: '#59c2ed',
  skySoft: '#e8f6fd',
  skyDeep: '#2b7aa4',
  lime: '#d3da47',
  limeSoft: '#f6f8d9',
  limeDeep: '#6b7020',
  bg: '#f4f5f7',
  surface: '#ffffff',
  ink: '#0e223a',
  ink2: '#3b4a5e',
  ink3: '#6b7889',
  ink4: '#9aa5b5',
  line: 'rgba(15,34,58,0.09)',
  lineStrong: 'rgba(15,34,58,0.16)',
  red: '#d64545',
  redSoft: '#fbe9e9',
  amber: '#d98b28',
  amberSoft: '#fbf0de',
  green: '#2f9e70',
  greenSoft: '#e3f2ea',
  dimUso: '#59c2ed',
  dimSuporte: '#b46cd1',
  dimRel: '#d98b28',
  dimFin: '#2f9e70',
  dimProj: '#d3da47',
}

export const HEALTH_ICONS = {
  health_uso: 'BarChart3',
  health_suporte: 'Target',
  health_relacionamento: 'Handshake',
  health_financeiro: 'Wallet',
  health_projeto: 'Rocket',
}

export const ago30Str = (() => {
  const d = new Date()
  d.setDate(d.getDate() - 30)
  return d.toISOString().slice(0, 10)
})()

export function fmtDate(str) {
  if (!str) return '—'
  return new Date(str + 'T00:00:00').toLocaleDateString('pt-BR')
}

export function daysSince(dateStr) {
  if (!dateStr) return null
  return Math.floor((new Date() - new Date(dateStr + 'T00:00:00')) / 86400000)
}

export function scoreBand(s, thresholds = { threshold_healthy: 75, threshold_attention: 50 }) {
  const healthy = thresholds.threshold_healthy ?? 75
  const attention = thresholds.threshold_attention ?? 50
  if (s < attention) return 'red'
  if (s < healthy) return 'amber'
  return 'green'
}

export function scoreBandColor(s, thresholds) {
  const band = scoreBand(s, thresholds)
  if (band === 'red') return C.red
  if (band === 'amber') return C.amber
  return C.green
}

export function scoreBandLabel(s, thresholds) {
  const band = scoreBand(s, thresholds)
  if (band === 'red') return 'risco'
  if (band === 'amber') return 'atenção'
  return 'saudável'
}

export function tempVencida(client) {
  if (client.csm_temperature === -7 || client.csm_temperature === -3) return true
  if (!client.temperature_updated_at) return true
  return daysSince(client.temperature_updated_at.slice(0, 10)) > 30
}

export function getSignals(client, lastActivityMap) {
  const signals = []
  const last = lastActivityMap[client.id]
  const ds = last ? daysSince(last) : null

  if ((ds === null || ds > 60) && (client.health_total || 0) < 75)
    signals.push({
      kind: 'urgent',
      title: 'Sem interação recente',
      sub: ds ? `Última atividade há ${ds} dias` : 'Sem interação registrada',
      action: '→ registrar contato hoje',
    })
  else if (ds !== null && ds > 30)
    signals.push({
      kind: 'warn',
      title: `Sem interação há ${ds} dias`,
      sub: `Última atividade: ${fmtDate(last)}`,
      action: '→ agendar contato',
    })

  if ((client.delay_days || 0) > 0)
    signals.push({
      kind: 'urgent',
      title: 'Fatura em atraso',
      sub: `${client.delay_days} dias em atraso`,
      action: '→ verificar financeiro',
    })

  if ((client.health_uso || 0) < 10)
    signals.push({
      kind: 'warn',
      title: 'Uso em queda',
      sub: `Score de uso: ${client.health_uso || 0}/10`,
      action: '→ investigar uso operacional',
    })

  if ((client.health_suporte || 0) < 10)
    signals.push({
      kind: 'warn',
      title: 'Suporte com problemas',
      sub: `Score de suporte: ${client.health_suporte || 0}/10`,
      action: '→ revisar tickets abertos',
    })

  if ((client.health_relacionamento || 0) < 10)
    signals.push({
      kind: 'warn',
      title: 'Relacionamento fraco',
      sub: `Score de relacionamento: ${client.health_relacionamento || 0}/10`,
      action: '→ agendar reunião de alinhamento',
    })

  if ((client.health_financeiro || 0) < 10)
    signals.push({
      kind: 'warn',
      title: 'Saúde financeira em alerta',
      sub: `Score financeiro: ${client.health_financeiro || 0}/10`,
      action: '→ verificar pagamentos',
    })

  if ((client.health_projeto || 0) < 10)
    signals.push({
      kind: 'warn',
      title: 'Projeto em risco',
      sub: `Score de projeto: ${client.health_projeto || 0}/10`,
      action: '→ revisar milestones',
    })

  if (tempVencida(client) && (client.temperature_updated_at || client.csm_temperature != null)) {
    // Only push if temp was ever set; tempVencida already checks -7/-3
    const alreadyUrgent = signals.some(s => s.title === 'Sem interação recente')
    if (!alreadyUrgent) {
      signals.push({
        kind: 'warn',
        title: 'Temperatura vencida',
        sub: client.temperature_updated_at ? `Atualizada há ${daysSince(client.temperature_updated_at.slice(0, 10))} dias` : 'Temperatura fria',
        action: '→ atualizar temperatura',
      })
    }
  }

  return signals
}

export function buildReasons(client, lastActivityMap, overdueOnboardingFases = [], overdueActivityClientIds = []) {
  const reasons = []
  if (overdueOnboardingFases.some(f => f.clientId === client.id))
    reasons.push({ kind: 'red', label: 'Onboarding vencido' })
  if (overdueActivityClientIds.includes(client.id))
    reasons.push({ kind: 'red', label: 'Atividade atrasada' })
  if (client.csm_temperature === -7)
    reasons.push({ kind: 'red', label: 'Temperatura muito fria' })
  const last = lastActivityMap[client.id]
  const ago30 = ago30Str
  if (!last || last < ago30)
    reasons.push({ kind: 'amber', label: last ? `Sem interação há ${daysSince(last)}d` : 'Sem interação registrada' })
  if (!client.temperature_updated_at || daysSince(client.temperature_updated_at.slice(0, 10)) > 30)
    reasons.push({ kind: 'amber', label: 'Temperatura desatualizada' })
  if (client.csm_temperature === -3)
    reasons.push({ kind: 'amber', label: 'Temperatura fria' })
  return reasons
}
