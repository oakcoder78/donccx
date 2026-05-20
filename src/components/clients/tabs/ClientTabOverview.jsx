import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabaseClient'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { Icons } from '@/lib/icons'

const ACTIVITY_ICONS = {
  reuniao: Icons.Calendar,
  ligacao: Icons.Phone,
  email: Icons.Mail,
  whatsapp: Icons.MessageCircle,
  tarefa: Icons.CheckSquare,
  nota: Icons.FileText,
  relatorio: Icons.FileText,
}
import { syncClient } from '@/lib/clientSync'
import { TemperaturaCSM } from '../TemperaturaCSM'
import { useCatalog } from '@/hooks/useCatalog'
import { useHealthConfig } from '@/hooks/useHealthConfig'
import { Bar, Line } from 'react-chartjs-2'
import { Chart, CategoryScale, LinearScale, BarElement, Tooltip, PointElement, LineElement, Filler, LineController } from 'chart.js'
import toast from 'react-hot-toast'

Chart.register(CategoryScale, LinearScale, BarElement, Tooltip, PointElement, LineElement, Filler, LineController)

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtMonth(ym) {
  if (!ym) return ''
  const [y, m] = ym.split('-')
  const months = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
  return `${months[parseInt(m, 10) - 1]}/${y.slice(2)}`
}

function fmtNum(v) {
  if (v === null || v === undefined) return '—'
  return Number(v).toLocaleString('pt-BR')
}

function pct(a, b) {
  if (!b || b === 0) return null
  return Math.round(((a - b) / b) * 100)
}

function formatDate(d) {
  if (!d) return '—'
  return new Date(d + 'T00:00:00').toLocaleDateString('pt-BR')
}

function getRelevanceScore(cl) {
  const { champion, papel, engajamento } = cl
  if (champion && papel === 'Decisor') return 7
  if (papel === 'Decisor') return 6
  if (champion && papel === 'Influenciador') return 5
  if (papel === 'Influenciador') return 4
  if (champion) return 4
  if (papel === 'Técnico') return 3
  if (papel === 'Usuário') return 2
  const engScore = engajamento === 'Alto' ? 2 : engajamento === 'Médio' ? 1 : 0
  return engScore
}

const DIMS = [
  { key: 'uso',            label: 'Uso',        color: '#59c2ed' },
  { key: 'suporte',        label: 'Suporte',    color: '#1D9E75' },
  { key: 'relacionamento', label: 'Relac.',     color: '#d3da47' },
  { key: 'financeiro',     label: 'Financeiro', color: '#185FA5' },
  { key: 'projeto',        label: 'Projeto',    color: '#534AB7' },
]

// ── Sparkline inline SVG ──────────────────────────────────────────────────────
function Sparkline({ data, color = '#59c2ed', width = 80, height = 32 }) {
  if (!data || data.length < 2) return null
  const max = Math.max(...data, 1)
  const min = Math.min(...data)
  const range = max - min || 1
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width
    const y = height - ((v - min) / range) * (height - 4) - 2
    return `${x},${y}`
  }).join(' ')
  const lastPt = pts.split(' ').pop().split(',')
  return (
    <svg width={width} height={height} style={{ overflow: 'visible' }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lastPt[0]} cy={lastPt[1]} r="2.5" fill={color} />
    </svg>
  )
}

// ── Metric card ───────────────────────────────────────────────────────────────
function MetricCard({ label, value, delta, sparkData, sparkColor, sub }) {
  const deltaColor = delta === null ? '#888780' : delta >= 0 ? '#1D9E75' : '#E24B4A'
  const deltaArrow = delta === null ? '' : delta >= 0 ? '▲' : '▼'
  return (
    <div style={{
      background: '#fff',
      border: '1px solid #e8e7e3',
      borderRadius: 10,
      padding: '14px 16px',
      display: 'flex',
      flexDirection: 'column',
      gap: 4,
    }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: '#888780', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8 }}>
        <div>
          <div style={{ fontSize: 26, fontWeight: 700, color: '#1a1a18', lineHeight: 1.1 }}>{value}</div>
          {delta !== null && (
            <div style={{ fontSize: 11, fontWeight: 600, color: deltaColor, marginTop: 2 }}>
              {deltaArrow} {Math.abs(delta)}% vs mês ant.
            </div>
          )}
          {sub && <div style={{ fontSize: 11, color: '#888780', marginTop: 2 }}>{sub}</div>}
        </div>
        {sparkData && <Sparkline data={sparkData} color={sparkColor || '#59c2ed'} />}
      </div>
    </div>
  )
}

// ── Alert pill ────────────────────────────────────────────────────────────────
function AlertPill({ text, color, bg }) {
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '6px 12px', borderRadius: 20,
      background: bg, color, fontSize: 12, fontWeight: 600,
      border: `1px solid ${color}30`,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />
      {text}
    </div>
  )
}

// ── Health dimension helpers ───────────────────────────────────────────────────

const C_DIMS = {
  uso:        '#59c2ed',
  suporte:    '#b46cd1',
  rel:        '#d98b28',
  fin:        '#2f9e70',
  proj:       '#d3da47',
}

const DIM_KEYS = [
  { key: 'health_uso',            label: 'Uso',        color: C_DIMS.uso,    cls: 'uso' },
  { key: 'health_suporte',        label: 'Suporte',    color: C_DIMS.suporte, cls: 'suporte' },
  { key: 'health_relacionamento', label: 'Relac.',     color: C_DIMS.rel,    cls: 'rel' },
  { key: 'health_financeiro',     label: 'Financeiro', color: C_DIMS.fin,    cls: 'fin' },
  { key: 'health_projeto',        label: 'Projeto',    color: C_DIMS.proj,   cls: 'proj' },
]

function daysSince(dateStr) {
  if (!dateStr) return null
  return Math.floor((new Date() - new Date(dateStr + 'T00:00:00')) / 86400000)
}

function getDimensionInsights(client, dimKey, dimCls, rules) {
  const dimScore = client[dimKey] ?? 20
  const dimRules = rules.filter(r => r.dimension === dimCls || r.dimension === dimKey)
  if (dimScore >= 20) return { violated: [], toImprove: [] }
  const violated = dimRules.filter(r => r.points < 0)
  const toImprove = dimRules.filter(r => r.points > 0)
  return { violated, toImprove }
}

function enrichDimLabel(rule, dimCls, usageCurr, usagePrev, supportCurr, contactLinks, onboardings, delayDays, lastActivityDate) {
  switch (rule.rule_key) {
    case 'sla_nok':
      return `SLA: ${supportCurr?.sla_first_response ?? '?'} min (meta ≤15 min)`
    case 't15_nok': case 'thi_nok': {
      const op = supportCurr?.tickets_opened ?? 0
      const rs = supportCurr?.tickets_resolved ?? 0
      const pct = op > 0 ? Math.round(rs / op * 100) : null
      return `Resolução: ${pct ?? '?'}%${op > 0 ? ` (${rs}/${op})` : ''}`
    }
    case 'os_down': case 'os_up': {
      const curr = usageCurr?.os_created ?? 0
      const prev = usagePrev?.os_created
      const chg = usageCurr && usagePrev && usagePrev.os_created > 0
        ? Math.round((usageCurr.os_created - usagePrev.os_created) / usagePrev.os_created * 100) : null
      return `OS: ${curr}${prev != null ? ` (vs ${prev}${chg != null ? `, ${chg > 0 ? '+' : ''}${chg}%` : ''})` : ''}`
    }
    case 'usr_down': case 'usr_up': {
      const curr = usageCurr?.active_users ?? 0
      const prev = usagePrev?.active_users
      const chg = usageCurr && usagePrev && usagePrev.active_users > 0
        ? Math.round((usageCurr.active_users - usagePrev.active_users) / usagePrev.active_users * 100) : null
      return `Usuários: ${curr}${prev != null ? ` (vs ${prev}${chg != null ? `, ${chg > 0 ? '+' : ''}${chg}%` : ''})` : ''}`
    }
    case 'mod_abandoned': case 'mod_new': return rule.label
    case 'nd_m1': case 'nd_m2': case 'nd_m3': {
      const months = client.golive ? Math.floor(daysSince(client.golive) / 30) : 0
      return `Sem decisor (${months > 0 ? `${months} meses` : 'desde o início'})`
    }
    case 'no_champ': return 'Sem champion identificado'
    case 'eng_low': case 'eng_mid': case 'eng_high': {
      const nivel = { eng_low: 'Baixo', eng_mid: 'Médio', eng_high: 'Alto' }[rule.rule_key]
      const ds = lastActivityDate ? daysSince(lastActivityDate) : null
      return `Engajamento: ${nivel}${ds !== null ? ` (${ds}d sem interação)` : ''}`
    }
    case 'fin_30': case 'fin_60': case 'fin_90':
      return `Fatura atrasada ${delayDays ?? 0} dias`
    case 'onb_travado': return 'Onboarding: travado'
    case 'onb_atencao': return 'Onboarding: atenção'
    case 'mp_late': {
      const lateFases = (onboardings || []).flatMap(o =>
        (o.onboarding_fases || []).filter(f => f.planned_end && f.planned_end < todayStr && f.status !== 'concluida')
      )
      return lateFases.length > 0 ? `Milestones atrasadas: ${lateFases.length}` : rule.label
    }
    case 'ob_late': {
      const ds = client.golive ? daysSince(client.golive) : null
      return ds ? `Onboarding incompleto (${ds}d de go-live)` : rule.label
    }
    default:
      return rule.label
  }
}

function MetricRow({ label, value }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '2px 0' }}>
      <span style={{ fontSize: 11.5, color: '#888780', fontWeight: 500 }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 600, color: '#1a1a18', fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </div>
  )
}

// ── Modal de progresso de sync ────────────────────────────────────────────────
function SyncModal({ step, result, client, onClose }) {
  const steps = [
    { key: 'donc',      label: 'API DONC',    desc: 'Sincronizando dados operacionais' },
    { key: 'freshdesk', label: 'Freshdesk',   desc: 'Sincronizando tickets de suporte' },
    { key: 'health',    label: 'Health Score', desc: 'Recalculando score' },
    { key: 'done',      label: 'Concluído',   desc: 'Sincronização finalizada' },
  ]

  const currentIdx = steps.findIndex(s => s.key === step)
  const isDone = step === 'done'
  const progress = isDone ? 100 : Math.round(((currentIdx + 1) / (steps.length)) * 85)

  function fmtNum(v) {
    if (v === null || v === undefined) return '—'
    return Number(v).toLocaleString('pt-BR')
  }

  function Delta({ before, after, label }) {
    if (before === null && after === null) return null
    const changed = before !== after
    const increased = after > before
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f0efed' }}>
        <span style={{ fontSize: 12, color: '#4a4a46' }}>{label}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, color: '#888780' }}>{fmtNum(before)}</span>
          <span style={{ fontSize: 10, color: '#888780' }}>→</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: changed ? (increased ? '#1D9E75' : '#E24B4A') : '#1a1a18' }}>
            {fmtNum(after)}
            {changed && <span style={{ fontSize: 10, marginLeft: 3 }}>{increased ? '▲' : '▼'}</span>}
          </span>
        </div>
      </div>
    )
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(2px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 16,
    }}>
      <div style={{
        background: '#fff', borderRadius: 14, width: '100%', maxWidth: 440,
        boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
        overflow: 'hidden',
      }}>
        {/* Header navy */}
        <div style={{ background: '#173557', padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>Sincronização</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>{client.fantasy_name || client.name}</div>
          </div>
          {isDone && (
            <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 6, color: '#fff', fontSize: 12, fontWeight: 600, padding: '4px 10px', cursor: 'pointer' }}>
              Fechar
            </button>
          )}
        </div>

        {/* Barra de progresso */}
        <div style={{ padding: '16px 20px 0' }}>
          <div style={{ height: 6, background: '#f0efed', borderRadius: 3, overflow: 'hidden', marginBottom: 12 }}>
            <div style={{
              height: '100%', borderRadius: 3,
              background: isDone ? '#1D9E75' : '#59c2ed',
              width: `${progress}%`,
              transition: 'width 0.5s ease, background 0.3s ease',
            }} />
          </div>

          {/* Steps */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
            {steps.filter(s => s.key !== 'done').map((s, i) => {
              const idx = steps.findIndex(x => x.key === step)
              const done = i < idx || isDone
              const active = s.key === step && !isDone
              return (
                <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 10, opacity: (!done && !active) ? 0.35 : 1 }}>
                  <div style={{
                    width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                    background: done ? '#1D9E75' : active ? '#173557' : '#f0efed',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 10, fontWeight: 700,
                    color: (done || active) ? '#fff' : '#888780',
                    transition: 'all 0.3s',
                  }}>
                    {done ? '✓' : i + 1}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#1a1a18' }}>{s.label}</div>
                    {active && <div style={{ fontSize: 11, color: '#888780' }}>{s.desc}...</div>}
                  </div>
                  {active && (
                    <div style={{ width: 14, height: 14, border: '2px solid #59c2ed', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Resumo — só quando done */}
        {isDone && result && (
          <div style={{ padding: '0 20px 20px' }}>
            <div style={{ borderTop: '1px solid #e8e7e3', paddingTop: 14, marginBottom: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#888780', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Resumo das alterações</div>

              {result.healthScoreBefore !== null && result.healthScore !== null && (
                <Delta before={result.healthScoreBefore} after={result.healthScore} label="Health Score" />
              )}

              {result.usage?.after && (
                <>
                  <Delta before={result.usage.before?.os_created ?? null} after={result.usage.after?.os_created ?? null} label="OS Criadas" />
                  <Delta before={result.usage.before?.active_users ?? null} after={result.usage.after?.active_users ?? null} label="Usuários Ativos" />
                </>
              )}

              {result.support?.after && (
                <>
                  <Delta before={result.support.before?.tickets_opened ?? null} after={result.support.after?.tickets_opened ?? null} label="Tickets Abertos" />
                  <Delta before={result.support.before?.tickets_resolved ?? null} after={result.support.after?.tickets_resolved ?? null} label="Tickets Resolvidos" />
                </>
              )}

              {result.errors?.length > 0 && (
                <div style={{ marginTop: 10, padding: '8px 10px', background: '#FEF2F2', borderRadius: 6, border: '1px solid #E24B4A30' }}>
                  {result.errors.map((e, i) => (
                    <div key={i} style={{ fontSize: 11, color: '#E24B4A', fontWeight: 500 }}>⚠ {e}</div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────
export function ClientTabOverview({ client }) {
  const navigate   = useNavigate()
  const qc         = useQueryClient()
  const { data: catalog = [] } = useCatalog()
  const { data: healthConfigData } = useHealthConfig()
  const healthRules = healthConfigData?.rules ?? []
  const [expandedDim, setExpandedDim] = useState(null)
  const [syncing, setSyncing]  = useState(false)
  const [syncStep, setSyncStep]     = useState(null)
  const [syncResult, setSyncResult] = useState(null)

  // Histórico de health score
  const { data: healthHistory = [] } = useQuery({
    queryKey: ['health_history', client.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('health_score_history')
        .select('ref_month, health_total, health_uso, health_suporte, health_relacionamento, health_financeiro, health_projeto')
        .eq('client_id', client.id)
        .order('ref_month', { ascending: true })
        .limit(6)
      return data ?? []
    },
  })

  // ── Dados derivados ──────────────────────────────────────────────────────────

  const lastActivity = [...(client.activities || [])]
    .sort((a, b) => b.activity_date?.localeCompare(a.activity_date))[0] ?? null

  const nextActivity = [...(client.activities || [])]
    .filter(a => a.status === 'pendente' && a.due_date)
    .sort((a, b) => a.due_date.localeCompare(b.due_date))[0] ?? null

  const usageSorted = [...(client.client_usage || [])]
    .sort((a, b) => b.ref_month.localeCompare(a.ref_month))
  // Agrupa por ref_month somando os valores de múltiplas instâncias
  const usageByMonth = {}
  for (const u of client.client_usage || []) {
    const m = u.ref_month
    if (!usageByMonth[m]) usageByMonth[m] = { ref_month: m, os_created: 0, active_users: 0, partial_day: u.partial_day }
    usageByMonth[m].os_created   += u.os_created   ?? 0
    usageByMonth[m].active_users += u.active_users  ?? 0
    if (u.partial_day != null) usageByMonth[m].partial_day = u.partial_day
  }
  const usageConsolidated = Object.values(usageByMonth)
    .sort((a, b) => a.ref_month.localeCompare(b.ref_month))
  const usageLast6 = usageConsolidated.slice(-6)
  const curUsage  = [...usageConsolidated].reverse()[0] ?? null
  const prevUsage = [...usageConsolidated].reverse()[1] ?? null
  const osVar      = curUsage && prevUsage ? pct(curUsage.os_created, prevUsage.os_created) : null
  const userVar    = curUsage && prevUsage ? pct(curUsage.active_users, prevUsage.active_users) : null

  const supportSorted = [...(client.client_support || [])]
    .sort((a, b) => b.ref_month.localeCompare(a.ref_month))
  const curSupport  = supportSorted[0] ?? null
  const openTickets = curSupport
    ? Math.max(0, (curSupport.tickets_opened ?? 0) - (curSupport.tickets_resolved ?? 0))
    : 0

  const delayDays = client.delay_days ?? 0
  const decisor   = client.contact_links?.find(l => l.papel === 'Decisor')

  const renewalDays = client.contract_renewal
    ? Math.ceil((new Date(client.contract_renewal + 'T00:00:00') - new Date()) / (1000 * 60 * 60 * 24))
    : null

  const todayStr = new Date().toISOString().slice(0, 10)
  const lateMilestones = (client.milestones || [])
    .filter(m => m.status !== 'done' && m.due_date && m.due_date < todayStr)

  const allSolucoes  = catalog.filter(c => c.type === 'solucao')
  const catalogMap   = {}
  client.client_catalog?.forEach(cc => { catalogMap[cc.catalog_item_id] = cc })
  const contractedIds = new Set(Object.keys(catalogMap).map(Number))
  const expansao     = allSolucoes.filter(sol => !contractedIds.has(sol.id))

  const tempDs = client.temperature_updated_at ? daysSince(client.temperature_updated_at.slice(0, 10)) : null
  const alerts = []
  if (renewalDays !== null && renewalDays < 0)
    alerts.push({ color: '#E24B4A', bg: '#FEF2F2', text: `Renovação vencida há ${Math.abs(renewalDays)} dias` })
  if (renewalDays !== null && renewalDays >= 0 && renewalDays <= 60)
    alerts.push({ color: '#BA7517', bg: '#FFFBEB', text: `Renovação em ${renewalDays} dias` })
  if (lateMilestones.length > 0)
    alerts.push({ color: '#BA7517', bg: '#FFFBEB', text: `${lateMilestones.length} milestone${lateMilestones.length > 1 ? 's' : ''} atrasado${lateMilestones.length > 1 ? 's' : ''}` })
  if (openTickets > 0)
    alerts.push({ color: '#E24B4A', bg: '#FEF2F2', text: `${openTickets} ticket${openTickets > 1 ? 's' : ''} sem resolução` })
  if (delayDays > 0)
    alerts.push({ color: '#E24B4A', bg: '#FEF2F2', text: `Atraso financeiro: ${delayDays} dias` })
  const onboardingFasesVencidas = (client.onboardings || []).flatMap(o =>
    (o.onboarding_fases || []).filter(f => f.planned_end && f.planned_end < todayStr && f.status !== 'concluida')
  )
  if (onboardingFasesVencidas.length > 0)
    alerts.push({ color: '#E24B4A', bg: '#FEF2F2', text: `${onboardingFasesVencidas.length} fase${onboardingFasesVencidas.length > 1 ? 's' : ''} de onboarding vencida${onboardingFasesVencidas.length > 1 ? 's' : ''}` })
  if (lastActDays !== null && lastActDays > 30)
    alerts.push({ color: '#BA7517', bg: '#FFFBEB', text: `Sem interação há ${lastActDays} dias` })
  if (client.csm_temperature === -7)
    alerts.push({ color: '#E24B4A', bg: '#FEF2F2', text: 'Temperatura muito fria' })
  if (tempDs !== null && tempDs > 30)
    alerts.push({ color: '#BA7517', bg: '#FFFBEB', text: 'Temperatura desatualizada' })

  const score      = client.health_total ?? 0
  const scoreColor = score >= 75 ? '#1D9E75' : score >= 50 ? '#BA7517' : '#E24B4A'
  const scoreLabel = score >= 75 ? 'Saudável' : score >= 50 ? 'Atenção' : 'Em Risco'

  const hasSync = !!(client.client_donc_instances?.length || client.freshdesk_company_id)

  // ── Sinais ativos (mesmo padrão do drawer) ──────────────────────────────────

  const lastActDate = lastActivity?.activity_date ?? null
  const lastActDays = lastActDate ? daysSince(lastActDate) : null

  const signals = []
  if ((lastActDays === null || lastActDays > 60) && (score < 75))
    signals.push({ kind: 'urgent', title: 'Sem interação recente', sub: lastActDays ? `Última atividade há ${lastActDays} dias` : 'Sem interação registrada', action: '→ registrar contato hoje' })
  else if (lastActDays !== null && lastActDays > 30)
    signals.push({ kind: 'warn', title: `Sem interação há ${lastActDays} dias`, sub: `Última atividade: ${lastActivity ? formatDate(lastActivity.activity_date) : '—'}`, action: '→ agendar contato' })
  if (delayDays > 0)
    signals.push({ kind: 'urgent', title: 'Fatura em atraso', sub: `${delayDays} dias em atraso`, action: '→ verificar financeiro' })
  if ((client.health_uso || 0) < 10)
    signals.push({ kind: 'warn', title: 'Uso em queda', sub: `Score de uso: ${client.health_uso || 0}/10`, action: '→ investigar uso operacional' })
  if ((client.health_suporte || 0) < 10)
    signals.push({ kind: 'warn', title: 'Suporte com problemas', sub: `Score de suporte: ${client.health_suporte || 0}/10`, action: '→ revisar tickets abertos' })
  if ((client.health_relacionamento || 0) < 10)
    signals.push({ kind: 'warn', title: 'Relacionamento fraco', sub: `Score de relacionamento: ${client.health_relacionamento || 0}/10`, action: '→ agendar reunião' })
  if ((client.health_financeiro || 0) < 10)
    signals.push({ kind: 'warn', title: 'Saúde financeira em alerta', sub: `Score financeiro: ${client.health_financeiro || 0}/10`, action: '→ verificar pagamentos' })
  if ((client.health_projeto || 0) < 10)
    signals.push({ kind: 'warn', title: 'Projeto em risco', sub: `Score de projeto: ${client.health_projeto || 0}/10`, action: '→ revisar milestones' })
  if (!client.temperature_updated_at || tempDs > 30)
    signals.push({ kind: 'warn', title: 'Temperatura vencida', sub: 'Avaliação de temperatura desatualizada', action: '→ avaliar temperatura' })
  if (signals.length === 0)
    signals.push({ kind: 'gray', title: 'Sem sinais críticos', sub: 'Cliente saudável no momento', action: '→ ver perfil completo' })

  // ── Ações rápidas ───────────────────────────────────────────────────────────

  const overdueAct = (client.activities || []).find(a => a.due_date && a.due_date < todayStr && a.status !== 'concluida' && a.status !== 'cancelada')
  const qaItems = []
  if (overdueAct) qaItems.push({ tone: 'red', label: 'Concluir atividade atrasada', onClick: () => navigate(`/empresas/${client.id}?tab=atividades`) })
  if (signals.some(s => /milestone|onboarding/i.test(s.title))) qaItems.push({ tone: 'red', label: 'Ver onboarding atrasado', onClick: () => navigate(`/empresas/${client.id}?tab=onboarding`) })
  if (signals.some(s => /interação|contato/i.test(s.title))) qaItems.push({ tone: 'amber', label: 'Registrar contato agora', onClick: () => navigate(`/empresas/${client.id}?tab=atividades`) })
  qaItems.push({ tone: 'amber', label: 'Atualizar temperatura', onClick: () => navigate(`/empresas/${client.id}?tab=health`) })
  qaItems.push({ tone: 'navy', label: 'Registrar atividade', onClick: () => navigate(`/empresas/${client.id}?tab=atividades`) })

  // Gráfico de barras — OS últimos 6 meses
  const barChart = useMemo(() => ({
    labels: usageLast6.map(u => fmtMonth(u.ref_month)),
    datasets: [{
      label: 'OS Criadas',
      data: usageLast6.map(u => u.os_created ?? 0),
      backgroundColor: usageLast6.map((_, i) =>
        i === usageLast6.length - 1 ? '#173557' : '#59c2ed40'
      ),
      borderColor: usageLast6.map((_, i) =>
        i === usageLast6.length - 1 ? '#173557' : '#59c2ed'
      ),
      borderWidth: 1.5,
      borderRadius: 5,
    }],
  }), [usageLast6])

  const barOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: {
      callbacks: { label: ctx => ` ${fmtNum(ctx.raw)} OS` }
    }},
    scales: {
      x: { grid: { display: false }, ticks: { font: { size: 11 }, color: '#888780' } },
      y: { grid: { color: '#f0efed' }, ticks: { font: { size: 11 }, color: '#888780' }, border: { display: false } },
    },
  }

  // Gráfico de linha — health score histórico
  const healthChart = useMemo(() => ({
    labels: healthHistory.map(h => fmtMonth(h.ref_month)),
    datasets: [{
      label: 'Health Score',
      data: healthHistory.map(h => h.health_total),
      borderColor: scoreColor,
      backgroundColor: `${scoreColor}15`,
      fill: true,
      tension: 0.4,
      pointRadius: 4,
      pointBackgroundColor: scoreColor,
      borderWidth: 2,
    }],
  }), [healthHistory, scoreColor])

  const lineOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { grid: { display: false }, ticks: { font: { size: 11 }, color: '#888780' } },
      y: { min: 0, max: 100, grid: { color: '#f0efed' }, ticks: { font: { size: 11 }, color: '#888780' }, border: { display: false } },
    },
  }

  async function handleSync() {
    setSyncing(true)
    setSyncStep('donc')
    setSyncResult(null)
    try {
      const result = await syncClient(client)
      setSyncStep('done')
      setSyncResult(result)
      qc.invalidateQueries({ queryKey: ['client', String(client.id)] })
      qc.invalidateQueries({ queryKey: ['health_history', client.id] })
    } catch (e) {
      toast.error(e.message)
      setSyncing(false)
      setSyncStep(null)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ── Linha 0: Alertas + Sync ── */}
      {(alerts.length > 0 || hasSync) && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 12, flexWrap: 'wrap',
          padding: '10px 16px',
          background: '#fff',
          border: '1px solid #e8e7e3',
          borderRadius: 10,
        }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {alerts.length === 0
              ? <span style={{ fontSize: 12, color: '#888780' }}>Nenhum alerta no momento.</span>
              : alerts.map((a, i) => <AlertPill key={i} {...a} />)
            }
          </div>
          {hasSync && (
            <Button size="sm" variant="secondary" onClick={handleSync} disabled={syncing}>
              {syncing
                ? 'Sincronizando...'
                : <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Icons.RefreshCw style={{ width: 13, height: 13 }} /> Sincronizar
                  </span>
              }
            </Button>
          )}
        </div>
      )}

      {/* ── Linha 1: 4 métricas ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>

        {/* Health Score */}
        <div style={{
          background: '#173557',
          borderRadius: 10,
          padding: '14px 16px',
          display: 'flex', flexDirection: 'column', gap: 6,
          position: 'relative', overflow: 'hidden',
        }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Health Score</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
            <div style={{ fontSize: 36, fontWeight: 800, color: scoreColor, lineHeight: 1 }}>{score}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: scoreColor }}>{scoreLabel}</div>
              {client.health_trend != null && client.health_trend !== 0 && (
                <span style={{ fontSize: 11, fontWeight: 700, color: client.health_trend > 0 ? '#1D9E75' : '#E24B4A' }}>
                  {client.health_trend > 0 ? '▲' : '▼'} {Math.abs(client.health_trend)} pts
                </span>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 3, marginTop: 4 }}>
            {DIMS.map(d => {
              const val = client[`health_${d.key}`] ?? 0
              return (
                <div key={d.key} title={`${d.label}: ${val}/20`} style={{ flex: 1, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.1)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${(val / 20) * 100}%`, background: d.color, borderRadius: 2 }} />
                </div>
              )
            })}
          </div>
          <button
            onClick={() => navigate(`/empresas/${client.id}?tab=health`)}
            style={{ position: 'absolute', top: 12, right: 12, fontSize: 10, color: 'rgba(255,255,255,0.4)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          >
            detalhes →
          </button>
        </div>

        {/* OS do mês */}
        <MetricCard
          label={`OS Criadas — ${curUsage ? fmtMonth(curUsage.ref_month) : '—'}`}
          value={curUsage ? fmtNum(curUsage.os_created) : '—'}
          delta={osVar}
          sparkData={usageLast6.map(u => u.os_created ?? 0)}
          sparkColor="#59c2ed"
        />

        {/* Usuários ativos */}
        <MetricCard
          label="Usuários Ativos"
          value={curUsage ? fmtNum(curUsage.active_users) : '—'}
          delta={userVar}
          sparkData={usageLast6.map(u => u.active_users ?? 0)}
          sparkColor="#1D9E75"
          sub={curUsage?.active_users && curUsage?.os_created
            ? `${Math.round(curUsage.os_created / curUsage.active_users)} OS/usuário`
            : undefined
          }
        />

        {/* Tickets / Financeiro */}
        {openTickets > 0 ? (
          <MetricCard
            label="Tickets em Aberto"
            value={openTickets}
            delta={null}
            sparkData={null}
            sparkColor="#E24B4A"
            sub={curSupport ? `Ref. ${fmtMonth(curSupport.ref_month)}` : undefined}
          />
        ) : delayDays > 0 ? (
          <MetricCard
            label="Atraso Financeiro"
            value={`${delayDays}d`}
            delta={null}
            sparkData={null}
            sub="dias de atraso"
          />
        ) : (
          <MetricCard
            label="Suporte"
            value={curSupport ? `${curSupport.tickets_resolved ?? 0}/${curSupport.tickets_opened ?? 0}` : '—'}
            delta={null}
            sparkData={null}
            sub="resolvidos/abertos"
          />
        )}
      </div>

      {/* ── Linha 1.5: Sinais ativos ── */}
      <div style={{ background: '#fff', border: '1px solid #e8e7e3', borderRadius: 10, padding: '14px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#1a1a18' }}>Sinais ativos</span>
          {signals.length > 0 && (
            <span style={{ fontSize: 10, fontWeight: 700, color: '#888780', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              {signals.filter(s => s.kind !== 'gray').length} ativos
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
          {signals.map((s, i) => {
            const colors = s.kind === 'urgent' ? ['#FEF2F2', '#E24B4A'] : s.kind === 'warn' ? ['#FFFBEB', '#BA7517'] : ['#f7f7f5', '#888780']
            return (
              <div key={i} style={{ flexShrink: 0, width: 240, border: `1px solid ${s.kind === 'gray' ? '#e8e7e3' : colors[0]}`, borderRadius: 8, padding: 12, display: 'flex', gap: 10, background: colors[0] }}>
                <div style={{ width: 24, height: 24, borderRadius: 6, display: 'grid', placeItems: 'center', background: colors[1] + '20', color: colors[1], flexShrink: 0 }}>
                  {s.kind === 'urgent' ? <Icons.Zap size={13} /> : s.kind === 'warn' ? <Icons.Clock size={13} /> : <Icons.Thermometer size={13} />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: '#1a1a18', lineHeight: 1.3 }}>{s.title}</div>
                  <div style={{ fontSize: 11, color: '#888780', marginTop: 1, fontWeight: 500 }}>{s.sub}</div>
                  <span style={{ fontSize: 11, color: '#173557', fontWeight: 600, marginTop: 6, display: 'inline-block', cursor: 'pointer' }}
                    onClick={() => { if (s.action.includes('contato') || s.action.includes('agendar')) navigate(`/empresas/${client.id}?tab=atividades`); else if (s.action.includes('financeiro')) navigate(`/empresas/${client.id}?tab=operacional`); else navigate(`/empresas/${client.id}?tab=health`) }}
                  >{s.action}</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Linha 2: Gráfico de OS + Health Score histórico ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, alignItems: 'stretch' }}>

        {/* Barras OS */}
        <div style={{ background: '#fff', border: '1px solid #e8e7e3', borderRadius: 10, padding: '14px 16px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#1a1a18' }}>Ordens de Serviço — últimos 6 meses</span>
            <button onClick={() => navigate(`/empresas/${client.id}?tab=operacional&sub=uso`)} style={{ fontSize: 11, color: '#59c2ed', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>ver detalhes</button>
          </div>
          {usageLast6.length >= 2 ? (
            <div style={{ flex: 1, minHeight: 120 }}>
              <Bar data={barChart} options={{ ...barOptions, maintainAspectRatio: false }} />
            </div>
          ) : (
            <div style={{ height: 140, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 12, color: '#888780', fontStyle: 'italic' }}>Dados insuficientes para o gráfico.</span>
            </div>
          )}
        </div>

        {/* Health Score histórico */}
        <div style={{ background: '#fff', border: '1px solid #e8e7e3', borderRadius: 10, padding: '14px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#1a1a18' }}>Evolução do Health Score</span>
            <button onClick={() => navigate(`/empresas/${client.id}?tab=health`)} style={{ fontSize: 11, color: '#59c2ed', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>ver detalhes</button>
          </div>
          {healthHistory.length >= 2 ? (
            <div style={{ height: 140 }}>
              <Line data={healthChart} options={lineOptions} />
            </div>
          ) : (
            <div style={{ height: 140, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 12, color: '#888780', fontStyle: 'italic' }}>Histórico disponível a partir do próximo recálculo.</span>
            </div>
          )}
          <div style={{ borderTop: '1px solid #f0efed', marginTop: 12, paddingTop: 12 }} className="flex items-center gap-4">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: '#888780', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Temperatura CSM</span>
              <TemperaturaCSM client={client} compact={true} />
            </div>
            {client.temperature_note && (client.temperature_updated_at) && (() => {
              const days = Math.floor((Date.now() - new Date(client.temperature_updated_at).getTime()) / (1000*60*60*24))
              return days <= 30 ? (
                <span style={{ fontSize: 11, color: '#4a4a46', fontStyle: 'italic' }} className="min-w-0 flex-1 break-words">
                  "{client.temperature_note}"
                </span>
              ) : null
            })()}
          </div>
        </div>
      </div>

      {/* ── Linha 3: Ações + Power Map ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>

        {/* Ações */}
        <div style={{ background: '#fff', border: '1px solid #e8e7e3', borderRadius: 10, padding: '14px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#1a1a18' }}>Ações</span>
            <button onClick={() => navigate(`/empresas/${client.id}?tab=atividades`)} style={{ fontSize: 11, color: '#59c2ed', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>ver todas</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#888780', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Próxima atividade</div>
              {nextActivity ? (
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  {(() => { const Icon = ACTIVITY_ICONS[nextActivity.type] || Icons.FileText; return <Icon style={{ width: 15, height: 15, color: '#4a4a46', marginTop: 1, flexShrink: 0 }} strokeWidth={1.8} /> })()}
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: '#1a1a18' }}>{nextActivity.title || nextActivity.description}</div>
                    <div style={{ fontSize: 11, color: '#888780' }}>{formatDate(nextActivity.due_date)}</div>
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: 12, color: '#888780', fontStyle: 'italic' }}>Nenhuma atividade agendada</div>
              )}
            </div>
            <div style={{ borderTop: '1px solid #f0efed', paddingTop: 12 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#888780', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Última interação</div>
              {lastActivity ? (
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  {(() => { const Icon = ACTIVITY_ICONS[lastActivity.type] || Icons.FileText; return <Icon style={{ width: 15, height: 15, color: '#4a4a46', marginTop: 1, flexShrink: 0 }} strokeWidth={1.8} /> })()}
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: '#1a1a18' }}>{lastActivity.title || lastActivity.description}</div>
                    <div style={{ fontSize: 11, color: '#888780' }}>{formatDate(lastActivity.activity_date)} · {lastActivity.responsible?.name}</div>
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: 12, color: '#888780', fontStyle: 'italic' }}>Nenhuma atividade registrada</div>
              )}
            </div>
          </div>
          {qaItems.length > 0 && (
            <div style={{ borderTop: '1px solid #f0efed', paddingTop: 12, marginTop: 12 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#888780', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Atalhos</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {qaItems.map((qa, i) => {
                  const qaColors = { red: ['#FEF2F2', '#E24B4A'], amber: ['#FFFBEB', '#BA7517'], navy: ['#f0efed', '#173557'] }
                  const [bg, clr] = qaColors[qa.tone] || qaColors.navy
                  return (
                    <button key={i} onClick={qa.onClick} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', border: '1px solid #e8e7e3', borderRadius: 8, background: 'transparent', cursor: 'pointer', textAlign: 'left', width: '100%', fontSize: 12, fontWeight: 500, color: '#1a1a18' }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: clr, flexShrink: 0 }} />
                      {qa.label}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Power Map */}
        <div style={{ background: '#fff', border: '1px solid #e8e7e3', borderRadius: 10, padding: '14px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#1a1a18' }}>Mapa de Poder</span>
            <button onClick={() => navigate(`/empresas/${client.id}?tab=contatos`)} style={{ fontSize: 11, color: '#59c2ed', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>ver todos</button>
          </div>
          {client.contact_links?.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[...client.contact_links]
                .sort((a, b) => {
                  const sa = getRelevanceScore(a)
                  const sb = getRelevanceScore(b)
                  if (sa !== sb) return sb - sa
                  const engA = a.engajamento === 'Alto' ? 2 : a.engajamento === 'Médio' ? 1 : 0
                  const engB = b.engajamento === 'Alto' ? 2 : b.engajamento === 'Médio' ? 1 : 0
                  return engB - engA
                })
                .slice(0, 4)
                .map(cl => (
                <div key={cl.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Avatar name={cl.contacts?.name} size="sm" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: '#1a1a18', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cl.contacts?.name}</div>
                    <div style={{ fontSize: 11, color: '#888780', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cl.contacts?.cargo}</div>
                  </div>
                  <Badge variant={cl.papel === 'Decisor' ? 'navy' : cl.champion ? 'sky' : 'default'}>
                    {cl.champion ? 'Champion' : cl.papel}
                  </Badge>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: '#888780', fontStyle: 'italic' }}>Nenhum contato mapeado.</div>
          )}
          {expansao.length > 0 && (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #f0efed' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#888780', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Expansão potencial</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {expansao.slice(0, 6).map(sol => (
                  <span key={sol.id} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, border: '1px solid #e8e7e3', color: '#4a4a46', background: '#f7f7f5' }}>{sol.name}</span>
                ))}
                {expansao.length > 6 && <span style={{ fontSize: 11, color: '#888780' }}>+{expansao.length - 6}</span>}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Linha 4: Saúde por dimensão ── */}
      <div style={{ background: '#fff', border: '1px solid #e8e7e3', borderRadius: 10, padding: '14px 16px' }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#1a1a18', marginBottom: 12 }}>Saúde por dimensão</div>
        {DIM_KEYS.map(d => {
          const dimScore = client[d.key] ?? 0
          const pct = Math.min(100, Math.round((dimScore / 20) * 100))
          const isHealthy = dimScore >= 20
          const { violated, toImprove } = getDimensionInsights(client, d.key, d.cls, healthRules)
          const isExpanded = expandedDim === d.key
          const usageArr = (client.client_usage || []).sort((a, b) => b.ref_month?.localeCompare(a.ref_month))
          const supportArr = (client.client_support || []).sort((a, b) => b.ref_month?.localeCompare(a.ref_month))

          if (isHealthy) {
            return (
              <div key={d.key} style={{ borderBottom: '1px solid #f0efed', padding: '12px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: '#1a1a18' }}>{d.label}</span>
                <div style={{ width: 80, height: 5, borderRadius: 3, background: '#f0efed', overflow: 'hidden' }}>
                  <div style={{ width: '100%', height: '100%', background: d.color, borderRadius: 3 }} />
                </div>
                <span style={{ fontSize: 12, fontWeight: 700, color: d.color, fontVariantNumeric: 'tabular-nums', width: 36, textAlign: 'right' }}>{dimScore}/20</span>
              </div>
            )
          }

          const enrichedViolated = violated.map(r => ({
            ...r,
            enrichedLabel: enrichDimLabel(r, d.cls, usageArr[0], usageArr[1], supportArr[0], client.contact_links, client.onboardings, delayDays, lastActDate),
          }))
          const enrichedToImprove = toImprove.map(r => ({
            ...r,
            enrichedLabel: enrichDimLabel(r, d.cls, usageArr[0], usageArr[1], supportArr[0], client.contact_links, client.onboardings, delayDays, lastActDate),
          }))

          return (
            <div key={d.key} style={{ borderBottom: '1px solid #f0efed' }}>
              <button onClick={() => setExpandedDim(prev => prev === d.key ? null : d.key)}
                style={{ width: '100%', border: 0, background: 'transparent', cursor: 'pointer', padding: '12px 0', display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left' }}>
                <span style={{ color: '#888780', flexShrink: 0, transition: 'transform 0.2s', transform: isExpanded ? 'rotate(90deg)' : 'none' }}>
                  <Icons.ChevronRight size={14} />
                </span>
                <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: '#1a1a18' }}>{d.label}</span>
                <div style={{ width: 80, height: 5, borderRadius: 3, background: '#f0efed', overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: d.color, borderRadius: 3 }} />
                </div>
                <span style={{ fontSize: 12, fontWeight: 700, color: d.color, fontVariantNumeric: 'tabular-nums', width: 36, textAlign: 'right' }}>{dimScore}/20</span>
              </button>

              {isExpanded && (
                <div style={{ padding: '0 0 14px 22px' }}>
                  {d.cls === 'suporte' && supportArr[0] && (
                    <div style={{ marginBottom: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <MetricRow label="Tickets abertos" value={String(supportArr[0].tickets_opened ?? 0)} />
                      <MetricRow label="Resolvidos" value={supportArr[0].tickets_opened > 0
                        ? `${supportArr[0].tickets_resolved ?? 0} (${Math.round((supportArr[0].tickets_resolved ?? 0) / supportArr[0].tickets_opened * 100)}%)` : '0 (0%)'} />
                      <MetricRow label="SLA 1ª resposta" value={supportArr[0].sla_first_response != null ? `${supportArr[0].sla_first_response} min` : '—'} />
                    </div>
                  )}
                  {d.cls === 'uso' && usageArr[0] && (
                    <div style={{ marginBottom: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <MetricRow label="OS criadas (mês)" value={String(usageArr[0].os_created ?? 0)} />
                      {usageArr[1] && <MetricRow label="OS mês anterior" value={String(usageArr[1].os_created ?? 0)} />}
                      <MetricRow label="Usuários ativos" value={String(usageArr[0].active_users ?? 0)} />
                      {usageArr[1] && <MetricRow label="Usuários mês ant." value={String(usageArr[1].active_users ?? 0)} />}
                    </div>
                  )}
                  {d.cls === 'rel' && (
                    <div style={{ marginBottom: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <MetricRow label="Decisor" value={(client.contact_links || []).some(l => l.papel === 'Decisor') ? 'Sim' : 'Não'} />
                      <MetricRow label="Champion" value={(client.contact_links || []).some(l => l.champion) ? 'Sim' : 'Não'} />
                      <MetricRow label="Última interação" value={lastActDays != null ? `${lastActDays} dias` : '—'} />
                    </div>
                  )}
                  {d.cls === 'fin' && (
                    <div style={{ marginBottom: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <MetricRow label="Atraso" value={delayDays > 0 ? `${delayDays} dias` : 'Em dia'} />
                    </div>
                  )}
                  {d.cls === 'proj' && (
                    <div style={{ marginBottom: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <MetricRow label="Situação" value={(client.onboardings || []).find(o => o.status === 'ativo')?.situacao_geral ?? 'Sem onboarding ativo'} />
                      {onboardingFasesVencidas.length > 0 && (
                        <MetricRow label="Fases atrasadas" value={String(onboardingFasesVencidas.length)} />
                      )}
                    </div>
                  )}

                  {enrichedViolated.length > 0 && (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#888780', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Penalizando</div>
                      {enrichedViolated.map((r, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '3px 0', gap: 8 }}>
                          <span style={{ fontSize: 11.5, color: '#4a4a46', fontWeight: 500, flex: 1, minWidth: 0 }}>{r.enrichedLabel}</span>
                          <span style={{ fontSize: 10, fontWeight: 700, color: '#E24B4A', background: '#FEF2F2', padding: '2px 5px', borderRadius: 5, flexShrink: 0 }}>−{Math.abs(r.points)} pts</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {enrichedToImprove.length > 0 && (
                    <div style={{ marginTop: 8, padding: '8px 10px', background: '#FFFBEB', borderRadius: 6 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#BA7517', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Como melhorar</div>
                      {enrichedToImprove.map((r, i) => (
                        <div key={i} style={{ fontSize: 11.5, color: '#4a4a46', fontWeight: 500, marginBottom: i < enrichedToImprove.length - 1 ? 2 : 0 }}>
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
      </div>

      {syncStep !== null && (
        <SyncModal
          step={syncStep}
          result={syncResult}
          client={client}
          onClose={() => { setSyncing(false); setSyncStep(null); setSyncResult(null) }}
        />
      )}
    </div>
  )
}
