import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabaseClient'
import { useHealthConfig } from '@/hooks/useHealthConfig'
import { useActivities } from '@/hooks/useActivities'
import { Icons } from '@/lib/icons'

const C = {
  navy: '#173557', navyDeep: '#0f2540',
  bg: '#f4f5f7', surface: '#ffffff',
  ink: '#0e223a', ink2: '#3b4a5e', ink3: '#6b7889', ink4: '#9aa5b5',
  line: 'rgba(15,34,58,0.09)', lineStrong: 'rgba(15,34,58,0.16)',
  red: '#d64545', redSoft: '#fbe9e9',
  amber: '#d98b28', amberSoft: '#fbf0de',
  green: '#2f9e70', greenSoft: '#e3f2ea',
  dimUso: '#59c2ed', dimSuporte: '#b46cd1', dimRel: '#d98b28',
  dimFin: '#2f9e70', dimProj: '#d3da47',
  sky: '#59c2ed', skySoft: '#e8f6fd', skyDeep: '#2b7aa4',
  limeDeep: '#6b7020',
}

const todayStr = new Date().toISOString().slice(0, 10)
const ago30Str = (() => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().slice(0, 10) })()

function MetricRow({ label, value }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '2px 0' }}>
      <span style={{ fontSize: 11.5, color: C.ink3, fontWeight: 500 }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 600, color: C.ink, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </div>
  )
}

const DIMS = [
  { key: 'health_uso',            label: 'Uso',            color: C.dimUso,    cls: 'uso' },
  { key: 'health_suporte',        label: 'Suporte',        color: C.dimSuporte, cls: 'suporte' },
  { key: 'health_relacionamento', label: 'Relacionamento', color: C.dimRel,    cls: 'rel' },
  { key: 'health_financeiro',     label: 'Financeiro',     color: C.dimFin,    cls: 'fin' },
  { key: 'health_projeto',        label: 'Projeto',        color: C.dimProj,   cls: 'proj' },
]

const QC_ICONS = {
  red: Icons.Check,
  amber: Icons.Phone,
  sky: Icons.Rocket,
  navy: Icons.Plus,
}

function daysSince(dateStr) {
  if (!dateStr) return null
  return Math.floor((new Date() - new Date(dateStr + 'T00:00:00')) / 86400000)
}

function fmtDate(str) {
  if (!str) return '—'
  return new Date(str + 'T00:00:00').toLocaleDateString('pt-BR')
}

function scoreBand(s) {
  if (s < 50) return 'red'
  if (s < 75) return 'amber'
  return 'green'
}

function scoreBandColor(s) {
  if (s < 50) return C.red
  if (s < 75) return C.amber
  return C.green
}

function scoreBandLabel(s) {
  if (s < 50) return 'risco'
  if (s < 75) return 'atenção'
  return 'saudável'
}

function getDimensionInsights(client, dimKey, dimCls, rules) {
  const dimScore = client[dimKey] ?? 20
  const dimRules = rules.filter(r => r.dimension === dimCls || r.dimension === dimKey)

  if (dimScore >= 20) return { violated: [], toImprove: [] }

  const violated = dimRules.filter(r => r.points < 0)
  const toImprove = dimRules.filter(r => r.points > 0)
  return { violated, toImprove }
}

function tempVencida(client) {
  if (client.csm_temperature === -7 || client.csm_temperature === -3) return true
  if (!client.temperature_updated_at) return true
  return daysSince(client.temperature_updated_at.slice(0, 10)) > 30
}

function getSignals(client, lastActivityMap) {
  const signals = []
  const last = lastActivityMap[client.id]
  const ds = last ? daysSince(last) : null

  if ((ds === null || ds > 60) && (client.health_total || 0) < 75)
    signals.push({ kind: 'urgent', title: 'Sem interação recente', sub: ds ? `Última atividade há ${ds} dias` : 'Sem interação registrada', action: '→ registrar contato hoje' })
  else if (ds !== null && ds > 30)
    signals.push({ kind: 'warn', title: `Sem interação há ${ds} dias`, sub: `Última atividade: ${fmtDate(last)}`, action: '→ agendar contato' })

  if ((client.delay_days || 0) > 0)
    signals.push({ kind: 'urgent', title: 'Fatura em atraso', sub: `${client.delay_days} dias em atraso`, action: '→ verificar financeiro' })

  if ((client.health_uso || 0) < 10)
    signals.push({ kind: 'warn', title: 'Uso em queda', sub: `Score de uso: ${client.health_uso || 0}/10`, action: '→ investigar uso operacional' })

  if ((client.health_suporte || 0) < 10)
    signals.push({ kind: 'warn', title: 'Suporte com problemas', sub: `Score de suporte: ${client.health_suporte || 0}/10`, action: '→ revisar tickets abertos' })

  if ((client.health_relacionamento || 0) < 10)
    signals.push({ kind: 'warn', title: 'Relacionamento fraco', sub: `Score de relacionamento: ${client.health_relacionamento || 0}/10`, action: '→ agendar reunião de alinhamento' })

  if ((client.health_financeiro || 0) < 10)
    signals.push({ kind: 'warn', title: 'Saúde financeira em alerta', sub: `Score financeiro: ${client.health_financeiro || 0}/10`, action: '→ verificar pagamentos' })

  if ((client.health_projeto || 0) < 10)
    signals.push({ kind: 'warn', title: 'Projeto em risco', sub: `Score de projeto: ${client.health_projeto || 0}/10`, action: '→ revisar milestones' })

  if (tempVencida(client))
    signals.push({ kind: 'warn', title: 'Temperatura vencida', sub: 'Avaliação de temperatura desatualizada', action: '→ avaliar temperatura' })

  if (signals.length === 0)
    signals.push({ kind: 'gray', title: 'Sem sinais críticos', sub: 'Cliente saudável no momento', action: '→ ver perfil completo' })

  return signals
}

function buildReasons(client, lastActivityMap, overdueOnboardingFases, overdueActivityClientIds) {
  const reasons = []
  if (overdueOnboardingFases.some(f => f.clientId === client.id))
    reasons.push({ kind: 'red', label: 'Onboarding vencido' })
  if (overdueActivityClientIds.includes(client.id))
    reasons.push({ kind: 'red', label: 'Atividade atrasada' })
  if (client.csm_temperature === -7)
    reasons.push({ kind: 'red', label: 'Temperatura muito fria' })
  const last = lastActivityMap[client.id]
  if (!last || last < ago30Str)
    reasons.push({ kind: 'amber', label: last ? `Sem interação há ${daysSince(last)}d` : 'Sem interação registrada' })
  if (!client.temperature_updated_at || daysSince(client.temperature_updated_at.slice(0, 10)) > 30)
    reasons.push({ kind: 'amber', label: 'Temperatura desatualizada' })
  if (client.csm_temperature === -3)
    reasons.push({ kind: 'amber', label: 'Temperatura fria' })
  return reasons
}

function DimBadge({ cls, label }) {
  const colors = {
    uso:     { color: '#2b7aa4', bg: '#e8f6fd' },
    suporte: { color: '#7c3fa0', bg: '#f3e8f8' },
    rel:     { color: C.amber, bg: C.amberSoft },
    fin:     { color: C.green, bg: C.greenSoft },
    proj:    { color: C.limeDeep, bg: '#f6f8d9' },
  }
  const s = colors[cls] || { color: C.ink3, bg: '#f1f3f5' }
  return (
    <span style={{ fontSize: 10.5, fontWeight: 700, padding: '3px 7px', borderRadius: 5, letterSpacing: '0.02em', textTransform: 'uppercase', display: 'inline-flex', alignItems: 'center', gap: 4, color: s.color, background: s.bg }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor', flexShrink: 0 }} />
      {label}
    </span>
  )
}

export function ClientHealthDrawer({ client, onClose }) {
  const navigate = useNavigate()

  const { data: healthConfigData } = useHealthConfig()
  const healthRules = healthConfigData?.rules ?? []

  const { data: lastActivityMap = {} } = useQuery({
    queryKey: ['last_activity_map'],
    staleTime: 2 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase
        .from('activities')
        .select('client_id, activity_date')
        .order('activity_date', { ascending: false })
      const map = {}
      ;(data || []).forEach(a => { if (a.client_id && !map[a.client_id]) map[a.client_id] = a.activity_date })
      return map
    },
  })

  const { data: myTasksRaw = [] } = useActivities({ excludeStatuses: ['concluida', 'cancelada'] })

  const { data: overdueOnboardingFases = [] } = useQuery({
    queryKey: ['overdue_onboarding_fases_list_drawer'],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data: onboardings } = await supabase
        .from('onboardings')
        .select('id, client_id, title')
        .eq('status', 'ativo')
      if (!onboardings?.length) return []
      const onboardingIds = onboardings.map(o => o.id)
      const { data: fases } = await supabase
        .from('onboarding_fases')
        .select('id, onboarding_id, planned_end, status')
        .lt('planned_end', todayStr)
        .neq('status', 'concluida')
        .in('onboarding_id', onboardingIds)
        .order('planned_end', { ascending: true })
      return (fases || []).map(f => {
        const ob = onboardings.find(o => o.id === f.onboarding_id)
        return { ...f, clientId: ob?.client_id ?? null }
      })
    },
  })

  const { data: overdueOnboardingActivities = [] } = useQuery({
    queryKey: ['overdue_onboarding_activities_drawer'],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data: onboardings } = await supabase
        .from('onboardings')
        .select('id, client_id')
        .eq('status', 'ativo')
      if (!onboardings?.length) return []
      const onboardingIds = onboardings.map(o => o.id)
      const { data: acts } = await supabase
        .from('onboarding_activities')
        .select('id, due_date, status, onboarding_id')
        .lt('due_date', todayStr)
        .neq('status', 'concluida')
        .in('onboarding_id', onboardingIds)
      return (acts || []).map(a => {
        const ob = onboardings.find(o => o.id === a.onboarding_id)
        return { ...a, clientId: ob?.client_id ?? null }
      })
    },
  })

  const overdueActivityClientIds = useMemo(() => {
    const cutoff = (() => { const d = new Date(); d.setDate(d.getDate() - 7); return d.toISOString().slice(0, 10) })()
    const crmOverdue = myTasksRaw
      .filter(a => a.due_date && a.due_date < cutoff && a.status !== 'concluida' && a.status !== 'cancelada')
      .map(a => Number(a.client_id))
    const obActOverdue = overdueOnboardingActivities
      .filter(a => a.due_date && a.due_date < cutoff && a.status !== 'concluida')
      .map(a => Number(a.clientId))
    return [...new Set([...crmOverdue, ...obActOverdue])]
  }, [myTasksRaw, overdueOnboardingActivities])

  const { data: supportData } = useQuery({
    queryKey: ['client_support_drawer', client.id],
    staleTime: 2 * 60 * 1000,
    enabled: !!client.id,
    queryFn: async () => {
      const { data } = await supabase
        .from('client_support')
        .select('tickets_opened, tickets_resolved, sla_first_response')
        .eq('client_id', client.id)
        .order('ref_month', { ascending: false })
        .limit(1)
      return data?.[0] ?? null
    },
  })

  const { data: usageData = [] } = useQuery({
    queryKey: ['client_usage_drawer', client.id],
    staleTime: 2 * 60 * 1000,
    enabled: !!client.id,
    queryFn: async () => {
      const { data } = await supabase
        .from('client_usage')
        .select('ref_month, os_created, active_users')
        .eq('client_id', client.id)
        .order('ref_month', { ascending: false })
        .limit(2)
      return data ?? []
    },
  })

  const { data: contactData = [] } = useQuery({
    queryKey: ['contact_links_drawer', client.id],
    staleTime: 2 * 60 * 1000,
    enabled: !!client.id,
    queryFn: async () => {
      const { data } = await supabase
        .from('contact_links')
        .select('papel, champion, engajamento')
        .eq('client_id', client.id)
      return data ?? []
    },
  })

  const { data: onboardingData } = useQuery({
    queryKey: ['client_onboarding_drawer', client.id],
    staleTime: 2 * 60 * 1000,
    enabled: !!client.id,
    queryFn: async () => {
      const { data } = await supabase
        .from('onboardings')
        .select('situacao_geral, onboarding_fases(id, planned_end, status)')
        .eq('client_id', client.id)
        .eq('status', 'ativo')
        .maybeSingle()
      return data ?? null
    },
  })

  const [expandedDim, setExpandedDim] = useState(null)

  const dimMetrics = useMemo(() => {
    const lu = usageData[0]
    const pu = usageData[1]
    const osChg = lu && pu && pu.os_created > 0
      ? Math.round((lu.os_created - pu.os_created) / pu.os_created * 100) : null
    const usrChg = lu && pu && pu.active_users > 0
      ? Math.round((lu.active_users - pu.active_users) / pu.active_users * 100) : null
    const resolucaoPct = supportData?.tickets_opened > 0
      ? Math.round((supportData.tickets_resolved ?? 0) / supportData.tickets_opened * 100) : null
    const decisor = contactData.find(c => c.papel === 'Decisor')
    const champion = contactData.find(c => c.champion)
    const lowEng = contactData.some(c => c.engajamento === 'Baixo')
    const midEng = contactData.some(c => c.engajamento === 'Médio')
    const lateFases = onboardingData?.onboarding_fases?.filter(
      f => f.planned_end && f.planned_end < todayStr && f.status !== 'concluida'
    ) ?? []
    return { osChg, usrChg, resolucaoPct, decisor, champion, lowEng, midEng, lateFases }
  }, [usageData, supportData, contactData, onboardingData])

  function enrichDimLabel(rule, dimCls) {
    switch (rule.rule_key) {
      case 'sla_nok':
        return `SLA: ${supportData?.sla_first_response ?? '?'} min (meta ≤15 min)`
      case 't15_nok': case 'thi_nok': {
        const pct = dimMetrics.resolucaoPct
        const op = supportData?.tickets_opened ?? 0
        const rs = supportData?.tickets_resolved ?? 0
        return `Resolução: ${pct ?? '?'}%${op > 0 ? ` (${rs}/${op})` : ''}`
      }
      case 'os_down': case 'os_up': {
        const curr = usageData[0]?.os_created ?? 0
        const prev = usageData[1]?.os_created ?? 0
        const chg = dimMetrics.osChg
        return `OS: ${curr}${prev > 0 ? ` (vs ${prev}, ${chg > 0 ? '+' : ''}${chg}%)` : ''}`
      }
      case 'usr_down': case 'usr_up': {
        const curr = usageData[0]?.active_users ?? 0
        const prev = usageData[1]?.active_users ?? 0
        const chg = dimMetrics.usrChg
        return `Usuários: ${curr}${prev > 0 ? ` (vs ${prev}, ${chg > 0 ? '+' : ''}${chg}%)` : ''}`
      }
      case 'nd_m1': case 'nd_m2': case 'nd_m3': {
        const months = client.golive ? Math.floor(daysSince(client.golive) / 30) : 0
        return `Sem decisor (${months > 0 ? `${months} meses` : 'desde o início'})`
      }
      case 'no_champ':
        return dimMetrics.champion ? `Champion: ${dimMetrics.champion}` : 'Sem champion identificado'
      case 'eng_low': case 'eng_mid': case 'eng_high': {
        const nivel = { eng_low: 'Baixo', eng_mid: 'Médio', eng_high: 'Alto' }[rule.rule_key]
        const last = lastActivityMap[client.id]
        const ds = last ? daysSince(last) : null
        return `Engajamento: ${nivel}${ds !== null ? ` (${ds}d sem interação)` : ''}`
      }
      case 'onb_travado':
        return `Onboarding: travado`
      case 'onb_atencao':
        return `Onboarding: atenção`
      case 'mp_late':
        return dimMetrics.lateFases.length > 0
          ? `Milestones atrasadas: ${dimMetrics.lateFases.length}`
          : rule.label
      case 'ob_late': {
        const ds = client.golive ? daysSince(client.golive) : null
        return ds ? `Onboarding incompleto (${ds}d de go-live)` : rule.label
      }
      default:
        return rule.label
    }
  }

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  if (!client) return null

  const score = client.health_total || 0
  const band = scoreBand(score)
  const color = scoreBandColor(score)
  const label = scoreBandLabel(score)
  const signals = getSignals(client, lastActivityMap)
  const alertReasons = buildReasons(client, lastActivityMap, overdueOnboardingFases, overdueActivityClientIds)

  const trendVal = client.health_trend || 0
  const trendDir = trendVal > 0 ? 'up' : trendVal < 0 ? 'down' : 'flat'
  const trendTxt = trendDir === 'flat' ? '→ estável' : trendDir === 'down' ? `▼ ${Math.abs(trendVal)} pts` : `▲ ${trendVal} pts`
  const trendColor = trendDir === 'down' ? C.red : trendDir === 'up' ? C.green : C.ink3

  const tempLabel = (() => {
    if (client.csm_temperature === 3) return 'Quente'
    if (client.csm_temperature === 0) return 'Neutra'
    if (client.csm_temperature === -3) return 'Fria'
    if (client.csm_temperature === -7) return 'Muito fria'
    return 'Não avaliada'
  })()

  const overdueAct = myTasksRaw.find(a => a.client_id === client.id && a.activity_date && a.activity_date < todayStr && a.status !== 'concluida' && a.status !== 'cancelada')

  const qaItems = []
  if (overdueAct) qaItems.push({ tone: 'red', iconKey: 'red', label: 'Concluir atividade atrasada', onClick: () => { onClose(); navigate(`/empresas/${client.id}?tab=atividades`) } })
  if (signals.some(s => /milestone|onboarding/i.test(s.title))) qaItems.push({ tone: 'red', iconKey: 'red', label: 'Ver onboarding atrasado', onClick: () => { onClose(); navigate(`/empresas/${client.id}?tab=onboarding`) } })
  if (signals.some(s => /interação|contato/i.test(s.title))) qaItems.push({ tone: 'amber', iconKey: 'amber', label: 'Registrar contato agora', onClick: () => { onClose(); navigate(`/empresas/${client.id}?tab=atividades`) } })
  qaItems.push({ tone: 'amber', iconKey: 'amber', label: 'Atualizar temperatura', onClick: () => { onClose(); navigate(`/empresas/${client.id}?tab=health`) } })
  qaItems.push({ tone: 'navy', iconKey: 'navy', label: 'Registrar atividade', onClick: () => { onClose(); navigate(`/empresas/${client.id}?tab=atividades`) } })

  const QAColors = { red: [C.redSoft, C.red], amber: [C.amberSoft, C.amber], sky: [C.skySoft, C.skyDeep], navy: ['#eef2f7', C.navy] }

  return (
    <>
      <div style={{ padding: '22px 24px 18px', borderBottom: `0.5px solid ${C.line}` }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.ink4 }}>Cliente</div>
            <h2 style={{ margin: '4px 0 0', fontSize: 19, fontWeight: 700, letterSpacing: '-0.02em', color: C.ink }}>{client.fantasy_name || client.name}</h2>
            <div style={{ marginTop: 8 }}>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', padding: '3px 8px', borderRadius: 999, background: band === 'red' ? C.redSoft : band === 'amber' ? C.amberSoft : C.greenSoft, color }}>
                {label.charAt(0).toUpperCase() + label.slice(1)}
              </span>
            </div>
          </div>
          <button onClick={onClose} style={{ border: 0, background: 'transparent', color: C.ink3, width: 32, height: 32, borderRadius: 8, cursor: 'pointer', display: 'grid', placeItems: 'center', marginTop: -6 }}
            onMouseEnter={e => { e.currentTarget.style.background = '#f1f3f5'; e.currentTarget.style.color = C.ink }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = C.ink3 }}>
            <Icons.X size={16} />
          </button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', marginTop: 16, border: `0.5px solid ${C.line}`, borderRadius: 12, overflow: 'hidden' }}>
          {[
            { k: 'Score', v: score, vc: color },
            { k: 'Tendência', v: trendTxt, vc: trendColor },
            { k: 'Temperatura', v: tempLabel, vc: C.ink },
          ].map((cell, i) => (
            <div key={i} style={{ padding: '10px 12px', borderRight: i < 2 ? `0.5px solid ${C.line}` : 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.ink4 }}>{cell.k}</span>
              <span style={{ fontSize: i === 0 ? 16 : 12.5, fontWeight: 700, color: cell.vc, letterSpacing: '-0.01em' }}>{cell.v}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px 12px', display: 'flex', flexDirection: 'column', gap: 22 }}>
        {alertReasons.length > 0 && (
          <div>
            <h4 style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.ink3, margin: '0 0 12px' }}>
              Motivo do alerta · {alertReasons.length}
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {alertReasons.map((r, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', border: `0.5px solid ${r.kind === 'red' ? C.redSoft : C.amberSoft}`, borderRadius: 8, background: r.kind === 'red' ? C.redSoft : C.amberSoft }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: r.kind === 'red' ? C.red : C.amber, flexShrink: 0 }} />
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: r.kind === 'red' ? C.red : C.amber }}>{r.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <h4 style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.ink3, margin: '0 0 12px' }}>
            Sinais ativos · {signals.length}
          </h4>
          {signals.map((s, i) => {
            const icoColors = s.kind === 'urgent' ? [C.redSoft, C.red] : s.kind === 'warn' ? [C.amberSoft, C.amber] : ['#f1f3f5', C.ink3]
            return (
              <div key={i} style={{ display: 'flex', gap: 12, padding: 12, border: `0.5px solid ${C.line}`, borderRadius: 12, marginBottom: 8 }}>
                <div style={{ width: 28, height: 28, flexShrink: 0, borderRadius: 8, display: 'grid', placeItems: 'center', background: icoColors[0], color: icoColors[1] }}>
                  {s.kind === 'urgent' ? <Icons.Zap size={14} /> : s.kind === 'warn' ? <Icons.Clock size={14} /> : <Icons.Thermometer size={14} />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.ink, lineHeight: 1.35 }}>{s.title}</div>
                  <div style={{ fontSize: 11.5, color: C.ink3, marginTop: 2, fontWeight: 500 }}>{s.sub}</div>
                  <span style={{ fontSize: 11.5, color: C.navy, fontWeight: 600, marginTop: 8, cursor: 'pointer', display: 'inline-block', letterSpacing: '-0.005em' }}>{s.action}</span>
                </div>
              </div>
            )
          })}
        </div>

        <div>
          <h4 style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.ink3, margin: '0 0 12px' }}>Ações rápidas</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {qaItems.slice(0, 5).map((qa, i) => {
              const [bg, clr] = QAColors[qa.tone] || QAColors.navy
              const QAIcon = QC_ICONS[qa.iconKey] || Icons.Plus
              return (
                <button key={i} onClick={qa.onClick} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, border: `0.5px solid ${C.line}`, borderRadius: 12, background: 'transparent', cursor: 'pointer', textAlign: 'left', width: '100%' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = C.lineStrong; e.currentTarget.style.background = '#fafbfc' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = C.line; e.currentTarget.style.background = 'transparent' }}>
                  <div style={{ width: 26, height: 26, flexShrink: 0, borderRadius: 7, display: 'grid', placeItems: 'center', background: bg, color: clr }}><QAIcon size={13} /></div>
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: C.ink }}>{qa.label}</span>
                  <span style={{ color: C.ink4 }}><Icons.ChevronRight size={14} /></span>
                </button>
              )
            })}
          </div>
        </div>

        <div>
          <h4 style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.ink3, margin: '0 0 12px' }}>Saúde por dimensão</h4>
          {DIMS.every(d => (client[d.key] ?? 0) >= 20) ? (
            <div style={{ fontSize: 13, fontWeight: 600, color: C.green, padding: '14px 16px', border: `0.5px solid ${C.greenSoft}`, borderRadius: 10, background: C.greenSoft, textAlign: 'center' }}>
              Todas as dimensões saudáveis ✓
            </div>
          ) : (
            <>
              {DIMS.filter(d => (client[d.key] ?? 0) < 20).map(d => {
                const dimScore = client[d.key] ?? 0
                const pct = Math.min(100, Math.round((dimScore / 20) * 100))
                const { violated, toImprove } = getDimensionInsights(client, d.key, d.cls, healthRules)
                const isExpanded = expandedDim === d.key

                const enrichedViolated = violated.map(r => ({
                  ...r,
                  enrichedLabel: enrichDimLabel(r, d.cls),
                }))
                const enrichedToImprove = toImprove.map(r => ({
                  ...r,
                  enrichedLabel: enrichDimLabel(r, d.cls),
                }))

                return (
                  <div key={d.key} style={{ border: `0.5px solid ${C.line}`, borderRadius: 12, overflow: 'hidden', marginBottom: 10 }}>
                    <button
                      onClick={() => setExpandedDim(prev => prev === d.key ? null : d.key)}
                      style={{
                        width: '100%', border: 0, background: 'transparent', cursor: 'pointer',
                        padding: '14px 14px 12px', display: 'flex', alignItems: 'center', gap: 8,
                        textAlign: 'left',
                      }}
                    >
                      <span style={{ color: C.ink4, flexShrink: 0, transition: 'transform 0.2s', transform: isExpanded ? 'rotate(90deg)' : 'none' }}>
                        <Icons.ChevronRight size={14} />
                      </span>
                      <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: C.ink }}>{d.label}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: d.color, fontVariantNumeric: 'tabular-nums' }}>{dimScore}/20</span>
                    </button>
                    <div style={{ padding: '0 14px 4px 36px' }}>
                      <div style={{ height: 6, borderRadius: 4, background: C.bg, overflow: 'hidden' }}>
                        <div style={{ width: `${pct}%`, height: '100%', background: d.color, borderRadius: 4 }} />
                      </div>
                    </div>

                    {isExpanded && (
                      <div style={{ padding: '0 14px 16px 36px' }}>
                        {d.cls === 'suporte' && supportData && (
                          <div style={{ margin: '10px 0', display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <MetricRow label="Tickets abertos" value={String(supportData.tickets_opened ?? 0)} />
                            <MetricRow label="Resolvidos" value={supportData.tickets_opened > 0
                              ? `${supportData.tickets_resolved ?? 0} (${dimMetrics.resolucaoPct ?? 0}%)`
                              : '0 (0%)'} />
                            <MetricRow label="SLA 1ª resposta" value={supportData.sla_first_response != null
                              ? `${supportData.sla_first_response} min`
                              : '—'} />
                          </div>
                        )}

                        {d.cls === 'uso' && usageData[0] && (
                          <div style={{ margin: '10px 0', display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <MetricRow label="OS criadas (mês)" value={String(usageData[0].os_created ?? 0)} />
                            {usageData[1] && (
                              <MetricRow label="OS mês anterior" value={`${usageData[1].os_created ?? 0}${dimMetrics.osChg != null ? ` (${dimMetrics.osChg > 0 ? '+' : ''}${dimMetrics.osChg}%)` : ''}`} />
                            )}
                            <MetricRow label="Usuários ativos" value={String(usageData[0].active_users ?? 0)} />
                            {usageData[1] && (
                              <MetricRow label="Usuários mês ant." value={`${usageData[1].active_users ?? 0}${dimMetrics.usrChg != null ? ` (${dimMetrics.usrChg > 0 ? '+' : ''}${dimMetrics.usrChg}%)` : ''}`} />
                            )}
                          </div>
                        )}

                        {d.cls === 'rel' && (
                          <div style={{ margin: '10px 0', display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <MetricRow label="Decisor" value={dimMetrics.decisor ? 'Sim' : 'Não'} />
                            <MetricRow label="Champion" value={dimMetrics.champion ? 'Sim' : 'Não'} />
                            <MetricRow label="Engajamento" value={dimMetrics.lowEng ? 'Baixo' : dimMetrics.midEng ? 'Médio' : contactData.length > 0 ? 'Alto' : '—'} />
                            {lastActivityMap[client.id] && (
                              <MetricRow label="Última interação" value={`${daysSince(lastActivityMap[client.id])} dias`} />
                            )}
                          </div>
                        )}

                        {d.cls === 'fin' && (
                          <div style={{ margin: '10px 0', display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <MetricRow label="Atraso" value={(client.delay_days ?? 0) > 0 ? `${client.delay_days} dias` : 'Em dia'} />
                          </div>
                        )}

                        {d.cls === 'proj' && (
                          <div style={{ margin: '10px 0', display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <MetricRow label="Situação" value={onboardingData?.situacao_geral ?? 'Sem onboarding ativo'} />
                            {dimMetrics.lateFases.length > 0 && (
                              <MetricRow label="Fases atrasadas" value={String(dimMetrics.lateFases.length)} />
                            )}
                          </div>
                        )}

                        {enrichedViolated.length > 0 && (
                          <div style={{ marginTop: 12 }}>
                            <div style={{ fontSize: 10.5, fontWeight: 700, color: C.ink4, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Penalizando</div>
                            {enrichedViolated.map((r, i) => (
                              <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '5px 0', borderBottom: i < enrichedViolated.length - 1 ? `0.5px solid ${C.line}` : 0 }}>
                                <span style={{ fontSize: 11.5, color: C.ink2, fontWeight: 500, flex: 1, minWidth: 0 }}>{r.enrichedLabel}</span>
                                <span style={{ fontSize: 11, fontWeight: 700, color: C.red, background: C.redSoft, padding: '2px 6px', borderRadius: 6, flexShrink: 0 }}>−{Math.abs(r.points)} pts</span>
                              </div>
                            ))}
                          </div>
                        )}

                        {enrichedToImprove.length > 0 && (
                          <div style={{ marginTop: 10, padding: '10px 12px', background: C.amberSoft, borderRadius: 8 }}>
                            <div style={{ fontSize: 10.5, fontWeight: 700, color: C.amber, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Como melhorar</div>
                            {enrichedToImprove.map((r, i) => (
                              <div key={i} style={{ fontSize: 11.5, color: C.ink2, fontWeight: 500, marginBottom: i < enrichedToImprove.length - 1 ? 4 : 0 }}>
                                Resolver <b>{r.enrichedLabel}</b> → +{Math.abs(r.points)} pts
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </>
          )}
        </div>
      </div>

      <div style={{ padding: '16px 24px 22px', borderTop: `0.5px solid ${C.line}`, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <button onClick={() => { onClose(); navigate(`/empresas/${client.id}`) }}
          style={{ background: C.navy, color: '#fff', border: 0, padding: '12px 16px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, letterSpacing: '-0.005em' }}
          onMouseEnter={e => e.currentTarget.style.background = C.navyDeep}
          onMouseLeave={e => e.currentTarget.style.background = C.navy}>
          Abrir cliente completo →
        </button>
        <button onClick={onClose} style={{ background: 'transparent', border: 0, cursor: 'pointer', color: C.ink3, fontSize: 11.5, fontWeight: 500, textAlign: 'center' }}>Fechar</button>
      </div>
    </>
  )
}
