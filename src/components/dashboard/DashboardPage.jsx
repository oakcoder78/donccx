import { useState, useMemo, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabaseClient'
import { useClients } from '../../hooks/useClients'
import { useHealthConfig } from '../../hooks/useHealthConfig'
import { useActivities } from '../../hooks/useActivities'
import { useProfiles } from '../../hooks/useProfiles'
import { useAuth } from '../../contexts/AuthContext'
import { ActivityDetailModal } from '../activities/ActivityDetailModal'
import { HealthDimensionIcons } from '../../lib/icons'

// ─── Color tokens ─────────────────────────────────────────────────────────────
const C = {
  navy: '#173557', navyDeep: '#0f2540', navySoft: '#1f4068',
  navyLine: 'rgba(255,255,255,0.10)', navyLineStrong: 'rgba(255,255,255,0.18)',
  navyTextMuted: 'rgba(255,255,255,0.62)', navyTextSoft: 'rgba(255,255,255,0.78)',
  sky: '#59c2ed', skySoft: '#e8f6fd', skyDeep: '#2b7aa4',
  lime: '#d3da47', limeSoft: '#f6f8d9', limeDeep: '#6b7020',
  bg: '#f4f5f7', surface: '#ffffff',
  ink: '#0e223a', ink2: '#3b4a5e', ink3: '#6b7889', ink4: '#9aa5b5',
  line: 'rgba(15,34,58,0.09)', lineStrong: 'rgba(15,34,58,0.16)',
  red: '#d64545', redSoft: '#fbe9e9',
  amber: '#d98b28', amberSoft: '#fbf0de',
  green: '#2f9e70', greenSoft: '#e3f2ea',
  dimUso: '#59c2ed', dimSuporte: '#b46cd1', dimRel: '#d98b28',
  dimFin: '#2f9e70', dimProj: '#d3da47',
}

// ─── Date constants ────────────────────────────────────────────────────────────
const todayStr  = new Date().toISOString().slice(0, 10)
const in30Str   = (() => { const d = new Date(); d.setDate(d.getDate() + 30); return d.toISOString().slice(0, 10) })()
const ago30Str  = (() => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().slice(0, 10) })()
const prevMonth = (() => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2,'0')}` })()
const prevMonth2 = (() => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 2); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2,'0')}` })()
const currentMonthStr = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2,'0')}` })()

const prevMonthLabel = (() => {
  const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1)
  return d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
})()

// ─── Phrases ──────────────────────────────────────────────────────────────────
const PHRASES_MALE    = ['Pronto para mais um dia?', 'Seu portfólio espera por você!', 'Foco no cliente, sempre.', 'Que dia produtivo te espera!', 'Bora transformar dados em ação?']
const PHRASES_FEMALE  = ['Pronta para mais um dia?', 'Seu portfólio espera por você!', 'Foco no cliente, sempre.', 'Que dia produtivo te espera!', 'Bora transformar dados em ação?']
const PHRASES_NEUTRAL = ['Seu portfólio espera por você!', 'Foco no cliente, sempre.', 'Que dia produtivo te espera!', 'Bora transformar dados em ação?']

// ─── Dimension config ─────────────────────────────────────────────────────────
const DIMS = [
  { key: 'health_uso',            label: 'Uso',            color: C.dimUso,    cls: 'uso',     iconKey: 'health_uso' },
  { key: 'health_suporte',        label: 'Suporte',        color: C.dimSuporte, cls: 'suporte', iconKey: 'health_suporte' },
  { key: 'health_relacionamento', label: 'Relacionamento', color: C.dimRel,    cls: 'rel',     iconKey: 'health_relacionamento' },
  { key: 'health_financeiro',     label: 'Financeiro',     color: C.dimFin,    cls: 'fin',     iconKey: 'health_financeiro' },
  { key: 'health_projeto',        label: 'Projeto',        color: C.dimProj,   cls: 'proj',    iconKey: 'health_projeto' },
]

function evaluateClientRules(client, rules) {
  return rules.filter(rule => {
    const cv  = client[rule.condition_field]
    const val = rule.condition_value
    const op  = rule.condition_operator
    if (op === 'is_null')     return cv == null
    if (op === 'is_not_null') return cv != null
    const n  = Number(cv)
    const nv = Number(val)
    if (op === '<')  return n < nv
    if (op === '>')  return n > nv
    if (op === '<=') return n <= nv
    if (op === '>=') return n >= nv
    if (op === '=' || op === '==') return String(cv) === String(val)
    if (op === '!=') return String(cv) !== String(val)
    return false
  })
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Bom dia'
  if (h < 18) return 'Boa tarde'
  return 'Boa noite'
}

function initials(name = '') {
  return name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?'
}

function fmtDate(str) {
  if (!str) return '—'
  return new Date(str + 'T00:00:00').toLocaleDateString('pt-BR')
}

function fmtMonthShort(ym) {
  if (!ym) return ''
  const [y, m] = ym.split('-')
  const months = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez']
  return months[parseInt(m, 10) - 1]
}

function daysSince(dateStr) {
  if (!dateStr) return null
  return Math.floor((new Date() - new Date(dateStr + 'T00:00:00')) / 86400000)
}

function fmtMrr(val) {
  if (val >= 1_000_000) return `R$ ${(val / 1_000_000).toFixed(1)}M`
  if (val >= 1_000) return `R$ ${(val / 1_000).toFixed(1)}k`
  return `R$ ${val.toLocaleString('pt-BR')}`
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

// ─── SVG Icons ────────────────────────────────────────────────────────────────
const Ic = {
  bolt:    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M13 2L3 14h9l-1 8 10-12h-9z"/></svg>,
  clock:   <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>,
  thermo:  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M14 14.76V3a2 2 0 00-4 0v11.76a4 4 0 104 0z"/></svg>,
  phone:   <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.12.9.31 1.78.57 2.63a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.45-1.14a2 2 0 012.11-.45c.85.26 1.73.45 2.63.57A2 2 0 0122 16.92z"/></svg>,
  cal:     <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>,
  check:   <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M4 12l5 5L20 6"/></svg>,
  plus:    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M12 5v14M5 12h14"/></svg>,
  chev:    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M9 6l6 6-6 6"/></svg>,
  close:   <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M6 6l12 12M18 6L6 18"/></svg>,
  refresh: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M21 12a9 9 0 11-3-6.7L21 8"/><path d="M21 3v5h-5"/></svg>,
  uso:     <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M3 17l6-6 4 4 8-8"/></svg>,
  suporte: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>,
  rel:     <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>,
  fin:     <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 2v20M17 5H9a3 3 0 000 6h6a3 3 0 010 6H7"/></svg>,
  proj:    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M4 22V4M4 16s1-1 4-1 5 2 8 2 4-1 4-1V4s-1 1-4 1-5-2-8-2S4 4 4 4"/></svg>,
}

const DIM_ICONS = { uso: Ic.uso, suporte: Ic.suporte, rel: Ic.rel, fin: Ic.fin, proj: Ic.proj }

// ─── Small shared UI ──────────────────────────────────────────────────────────
function Panel({ children, style }) {
  return (
    <div style={{
      background: C.surface, border: `0.5px solid ${C.line}`, borderRadius: 16,
      padding: '18px 20px 14px', display: 'flex', flexDirection: 'column', height: '100%',
      boxSizing: 'border-box', ...style,
    }}>
      {children}
    </div>
  )
}

function PanelHead({ title, meta }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14 }}>
      <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: C.ink, letterSpacing: '-0.01em' }}>{title}</h3>
      {meta && <span style={{ fontSize: 11, color: C.ink3, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{meta}</span>}
    </div>
  )
}

function SeeAll({ onClick, children = 'ver todos →' }) {
  return (
    <div style={{ marginTop: 'auto', paddingTop: 12 }}>
      <button onClick={onClick} style={{ fontSize: 12, fontWeight: 600, color: C.navy, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, background: 'none', border: 0, padding: '4px 0', letterSpacing: '-0.005em' }}
        onMouseEnter={e => e.currentTarget.style.color = C.skyDeep}
        onMouseLeave={e => e.currentTarget.style.color = C.navy}>
        {children}
      </button>
    </div>
  )
}

function StripHead({ title, right }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 16 }}>
      <h2 style={{ margin: 0, fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: C.ink3 }}>{title}</h2>
      {right && <div style={{ fontSize: 12, color: C.ink3, fontWeight: 500 }}>{right}</div>}
    </div>
  )
}

function DimBadge({ cls, label }) {
  const colors = {
    uso:     { color: C.skyDeep, bg: C.skySoft },
    suporte: { color: '#7c3fa0', bg: '#f3e8f8' },
    rel:     { color: C.amber, bg: C.amberSoft },
    fin:     { color: C.green, bg: C.greenSoft },
    proj:    { color: C.limeDeep, bg: C.limeSoft },
  }
  const s = colors[cls] || { color: C.ink3, bg: '#f1f3f5' }
  return (
    <span style={{ fontSize: 10.5, fontWeight: 700, padding: '3px 7px', borderRadius: 5, letterSpacing: '0.02em', textTransform: 'uppercase', display: 'inline-flex', alignItems: 'center', gap: 4, color: s.color, background: s.bg }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor', flexShrink: 0 }} />
      {label}
    </span>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function DashboardPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { profile } = useAuth()
  const isAdminOrManager = profile?.role === 'admin' || profile?.role === 'manager'

  // CSM filter
  const [selectedCsm, setSelectedCsm] = useState('')
  const [csmDropdownOpen, setCsmDropdownOpen] = useState(false)

  // Drawer state: { mode, data } | null
  const [drawer, setDrawer] = useState(null)
  const openDrawer = useCallback((mode, data = {}) => setDrawer({ mode, data }), [])
  const closeDrawer = useCallback(() => setDrawer(null), [])

  // ActivityDetailModal
  const [selectedActivity, setSelectedActivity] = useState(null)

  // Syncing state for op-sync
  const [syncing, setSyncing] = useState({})

  // Phrase (stable per mount)
  const phrase = useMemo(() => {
    const arr = profile?.gender === 'female' ? PHRASES_FEMALE : profile?.gender === 'male' ? PHRASES_MALE : PHRASES_NEUTRAL
    return arr[Math.floor(Math.random() * arr.length)]
  }, [profile?.gender])

  // ESC to close drawer
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') closeDrawer() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [closeDrawer])

  useEffect(() => {
  qc.invalidateQueries({ queryKey: ['clients'] })
  qc.invalidateQueries({ queryKey: ['ops_dashboard'] })
}, [])

  const csmFilter = isAdminOrManager
    ? (selectedCsm ? { csm_id: selectedCsm, lifecycle_stage: 'cliente' } : { lifecycle_stage: 'cliente' })
    : { csm_id: profile?.id, lifecycle_stage: 'cliente' }

  // ─── Hooks (always before any return) ──────────────────────────────────────
  const { data: clients = [], isLoading } = useClients(csmFilter, { enabled: !!profile })
  const { data: profiles = [] } = useProfiles()
  const { data: healthConfigData } = useHealthConfig()
  const healthRules = healthConfigData?.rules ?? []

  const activitiesFilter = isAdminOrManager
    ? { excludeStatuses: ['concluida', 'cancelada'] }
    : { responsible_id: profile?.id, excludeStatuses: ['concluida', 'cancelada'] }
  const { data: myTasksRaw = [] } = useActivities(activitiesFilter, { enabled: !!profile })

  // Last activity per client
  const { data: lastActivityMap = {} } = useQuery({
    queryKey: ['last_activity_map', selectedCsm || 'all'],
    enabled: !!profile,
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

  const { data: overdueCount = 0 } = useQuery({
    queryKey: ['overdue_onboarding_fases', clients.map(c => c.id).join()],
    enabled: !!profile && clients.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const clientIds = clients.map(c => c.id)
      const { data: onboardings } = await supabase
        .from('onboardings')
        .select('id')
        .eq('status', 'ativo')
        .in('client_id', clientIds)
      if (!onboardings?.length) return 0
      const onboardingIds = onboardings.map(o => o.id)
      const { count } = await supabase
        .from('onboarding_fases')
        .select('id', { count: 'exact', head: true })
        .lt('planned_end', todayStr)
        .neq('status', 'concluida')
        .in('onboarding_id', onboardingIds)
      return count ?? 0
    },
  })

  const { data: overdueOnboardingFases = [] } = useQuery({
    queryKey: ['overdue_onboarding_fases_list', clients.map(c => c.id).join()],
    enabled: !!profile && clients.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const clientIds = clients.map(c => c.id)
      const { data: onboardings } = await supabase
        .from('onboardings')
        .select('id, client_id, title')
        .eq('status', 'ativo')
        .in('client_id', clientIds)
      if (!onboardings?.length) return []
      const onboardingIds = onboardings.map(o => o.id)
      const { data: fases } = await supabase
        .from('onboarding_fases')
        .select('id, onboarding_id, fase_type_id, planned_end, status, onboarding_fase_types(name)')
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

  // Operational data — previous month
  const { data: opsRows = [] } = useQuery({
    queryKey: ['ops_dashboard', prevMonth, prevMonth2, clients.map(c => c.id).join()],
    enabled: !!profile && clients.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase
        .from('client_usage')
        .select('client_id, ref_month, instance_id, os_abertas, active_users, health_snapshot, donc_snapshot')
        .in('ref_month', [prevMonth, prevMonth2])
        .eq('pending', false)
      return (data || []).filter(r => r.instance_id != null)
    },
  })

  // Instances without current month sync
  const { data: instancesNoSync = [] } = useQuery({
    queryKey: ['instances_no_sync', prevMonth],
    enabled: !!profile,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data: instances } = await supabase
        .from('client_donc_instances')
        .select('id, client_id, clients!inner(name, fantasy_name, lifecycle_stage)')
        .eq('active', true)
        .eq('clients.lifecycle_stage', 'cliente')

      if (!instances?.length) return []

      const clientIds = [...new Set(instances.map(i => i.client_id))]

      const { data: usages, error: usageError } = await supabase
        .from('client_usage')
        .select('client_id, ref_month, instance_id, health_snapshot')
        .in('client_id', clientIds)
        .order('ref_month', { ascending: false })

      if (usageError) {
        console.error('[sync] erro ao buscar client_usage:', usageError.message)
        return []
      }

      const usagesOk     = (usages || []).filter(u => u.instance_id !== null && u.instance_id !== undefined)
      const syncedUso    = new Set(usagesOk.filter(u => u.ref_month === prevMonth).map(u => Number(u.client_id)))
      const syncedHealth = new Set(usagesOk.filter(u => u.ref_month === prevMonth && u.health_snapshot != null).map(u => Number(u.client_id)))

      const seen = new Set()
      return instances
        .filter(inst => {
          const cId = Number(inst.client_id)
          if (seen.has(cId)) return false
          seen.add(cId)
          return !syncedUso.has(cId) || !syncedHealth.has(cId)
        })
        .map(inst => {
          const cId        = Number(inst.client_id)
          const usoOk      = syncedUso.has(cId)
          const healthOk   = syncedHealth.has(cId)
          const lastSync   = usagesOk.find(u => Number(u.client_id) === cId)?.ref_month
          const pendingLabel = !usoOk && !healthOk
            ? 'Uso + Health Score pendentes'
            : !usoOk ? 'Uso pendente' : 'Health Score pendente'
          const syncAction = !usoOk ? 'uso+health' : 'health'
          return {
            id: inst.id,
            clientId: cId,
            clientName: inst.clients?.fantasy_name || inst.clients?.name || '—',
            lastSync: lastSync ? `última sync: ${lastSync}` : 'nunca sincronizado',
            pendingLabel,
            syncAction,
          }
        })
    },
  })

  // Op history for drawer (client clicked)
  const opDrawerClientId = drawer?.mode?.startsWith('op-') && drawer?.data?.clientId ? drawer.data.clientId : null
  const { data: opHistoRows = [] } = useQuery({
    queryKey: ['op_histo', opDrawerClientId],
    enabled: !!opDrawerClientId,
    staleTime: 2 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase
        .from('client_usage')
        .select('client_id, ref_month, instance_id, donc_snapshot, health_snapshot')
        .eq('client_id', opDrawerClientId)
        .order('ref_month', { ascending: false })
        .limit(3)
      return (data || []).reverse()
    },
  })

  // ─── Derived ───────────────────────────────────────────────────────────────
  const csmList = profiles
    .filter(p => (p.role === 'csm' || p.role === 'manager') && p.status === 'active')
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
  const selectedCsmProfile = selectedCsm ? csmList.find(p => p.id === selectedCsm) : null

  const dateStr = useMemo(() => {
    const s = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    return s.charAt(0).toUpperCase() + s.slice(1)
  }, [])

  const emRisco   = useMemo(() => clients.filter(c => (c.health_total || 0) < 50), [clients])
  const saudaveis = useMemo(() => clients.filter(c => (c.health_total || 0) >= 75), [clients])
  const semInteracao = useMemo(() => clients.filter(c => {
    const last = lastActivityMap[c.id]
    return !last || last < ago30Str
  }), [clients, lastActivityMap])
  const renovacao30 = useMemo(() => clients.filter(c => c.contract_renewal && c.contract_renewal >= todayStr && c.contract_renewal <= in30Str), [clients])
  const tempsVencidas = useMemo(() => clients.filter(tempVencida), [clients])

  const mrrTotal     = useMemo(() => clients.reduce((s, c) => s + (c.mrr || 0), 0), [clients])
  const mrrAtrasado  = useMemo(() => clients.filter(c => (c.delay_days || 0) > 0).reduce((s, c) => s + (c.mrr || 0), 0), [clients])

  // Upcoming activities: overdue first (asc), then today+future (asc)
  const upcomingActivities = useMemo(() => {
    const over = myTasksRaw.filter(a => a.activity_date && a.activity_date < todayStr).sort((a, b) => a.activity_date.localeCompare(b.activity_date))
    const fut  = myTasksRaw.filter(a => a.activity_date && a.activity_date >= todayStr).sort((a, b) => a.activity_date.localeCompare(b.activity_date))
    return [...over, ...fut]
  }, [myTasksRaw])

  const overdueActivities = useMemo(() => myTasksRaw.filter(a => a.activity_date && a.activity_date < todayStr), [myTasksRaw])

  // Ops: build variation maps from opsRows
  const opsByClient = useMemo(() => {
    const map = {}
    opsRows.forEach(r => {
      if (!map[r.client_id]) map[r.client_id] = {}
      const key = r.ref_month
      if (!map[r.client_id][key]) {
        map[r.client_id][key] = { os_abertas: 0, active_users: 0, health_snapshot: null, donc_snapshot: null }
      }
      map[r.client_id][key].os_abertas += r.os_abertas ?? 0
      map[r.client_id][key].active_users += r.active_users ?? 0
      if (map[r.client_id][key].health_snapshot === null && r.health_snapshot != null) {
        map[r.client_id][key].health_snapshot = r.health_snapshot
      }
      if (!map[r.client_id][key].donc_snapshot || (r.donc_snapshot?.totalOs ?? 0) > (map[r.client_id][key].donc_snapshot?.totalOs ?? 0)) {
        map[r.client_id][key].donc_snapshot = r.donc_snapshot
      }
    })
    return map
  }, [opsRows])

  const opHealthList = useMemo(() => {
    const cutoff = (() => { const d = new Date(); d.setDate(d.getDate() - 7); return d.toISOString().slice(0, 10) })()
    const overdueActivityClientIds = myTasksRaw
      .filter(a => a.due_date && a.due_date < cutoff && a.status !== 'concluida' && a.status !== 'cancelada')
      .map(a => Number(a.client_id))
    const rows = []
    Object.entries(opsByClient).forEach(([clientId, months]) => {
      const cur  = months[prevMonth]
      const prev = months[prevMonth2]
      if (!cur) return
      const curScore  = cur.health_snapshot
      const prevScore = prev?.health_snapshot
      if (curScore == null) return
      const delta = prevScore != null ? curScore - prevScore : 0
      const cl = clients.find(c => c.id === Number(clientId))
      rows.push({ clientId, name: cl?.fantasy_name || cl?.name || clientId, delta, cur: curScore })
    })
    return { list: rows.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 5), overdueActivityClientIds }
  }, [opsByClient, clients, myTasksRaw])

  // Urgency multi-criteria
  const alertaClients = useMemo(() => {
    const overdueSet = new Set(overdueOnboardingFases.filter(f => f.clientId != null).map(f => f.clientId))
    const opHealthNeg = new Set(opHealthList.list.filter(x => x.delta < 0).map(x => Number(x.clientId)))

    return clients
      .map(c => {
        const reasons = []
        if (overdueSet.has(c.id)) {
          reasons.push({ kind: 'red', label: 'Onboarding vencido' })
        }
        if (opHealthList.overdueActivityClientIds.includes(Number(c.id))) {
          reasons.push({ kind: 'red', label: 'Atividade atrasada' })
        }
        if (c.csm_temperature === -7) {
          reasons.push({ kind: 'red', label: 'Temperatura muito fria' })
        }
        const last = lastActivityMap[c.id]
        if (!last || last < ago30Str) {
          reasons.push({ kind: 'amber', label: last ? `Sem interação há ${daysSince(last)}d` : 'Sem interação registrada' })
        }
        if (opHealthNeg.has(Number(c.id))) {
          reasons.push({ kind: 'amber', label: 'Health score em queda' })
        }
        if (!c.temperature_updated_at || daysSince(c.temperature_updated_at.slice(0, 10)) > 30) {
          reasons.push({ kind: 'amber', label: 'Temperatura desatualizada' })
        }
        if (c.csm_temperature === -3) {
          reasons.push({ kind: 'amber', label: 'Temperatura fria' })
        }
        const score = reasons.reduce((s, r) => s + (r.kind === 'red' ? 100 : 30), 0)
        return { ...c, urgencyScore: score, reasons }
      })
      .filter(c => c.urgencyScore > 0)
      .sort((a, b) => {
        if (b.urgencyScore !== a.urgencyScore) return b.urgencyScore - a.urgencyScore
        if ((a.health_total || 0) !== (b.health_total || 0)) return (a.health_total || 0) - (b.health_total || 0)
        const lastA = lastActivityMap[a.id]
        const lastB = lastActivityMap[b.id]
        return new Date(lastA || 0) - new Date(lastB || 0)
      })
      .slice(0, 5)
  }, [clients, overdueOnboardingFases, lastActivityMap, opHealthList])

  const sortedPortfolio = useMemo(() => [...clients].sort((a, b) => (a.health_total || 0) - (b.health_total || 0)), [clients])

  const dimHealth = useMemo(() => DIMS.map(d => ({
    ...d,
    ok:    clients.filter(c => (c[d.key] || 0) >= 10).length,
    alert: clients.filter(c => (c[d.key] || 0) < 10).length,
    total: clients.length,
  })), [clients])

  const hasOpsData = useMemo(() => opsRows.some(r => r.ref_month === prevMonth && r.instance_id != null), [opsRows])
  console.log('[hasOpsData]', hasOpsData, 'opsRows length:', opsRows.length, 'sample:', opsRows[0])

  const opOSList = useMemo(() => {
    const rows = []
    Object.entries(opsByClient).forEach(([clientId, months]) => {
      const cur  = months[prevMonth]
      const prev = months[prevMonth2]
      if (!cur) return
      const curVal  = cur.donc_snapshot?.totalOs ?? null
      const prevVal = prev?.donc_snapshot?.totalOs ?? null
      if (!curVal || !prevVal || prevVal === 0) return
      const delta = Math.round(((curVal - prevVal) / prevVal) * 100)
      const cl = clients.find(c => c.id === Number(clientId))
      rows.push({ clientId, name: cl?.fantasy_name || cl?.name || clientId, delta, abs: `${curVal.toLocaleString('pt-BR')} OS criadas`, absDelta: Math.abs(curVal - prevVal) })
    })
    return rows.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 5)
  }, [opsByClient, clients])

  const opUsersList = useMemo(() => {
    const rows = []
    Object.entries(opsByClient).forEach(([clientId, months]) => {
      const cur  = months[prevMonth]
      const prev = months[prevMonth2]
      if (!cur) return
      const curVal  = cur.active_users ?? null
      const prevVal = prev?.active_users ?? null
      if (curVal === null) return
      if (!prevVal || prevVal === 0) return
      const delta = Math.round(((curVal - prevVal) / prevVal) * 100)
      const cl = clients.find(c => c.id === Number(clientId))
      rows.push({ clientId, name: cl?.fantasy_name || cl?.name || clientId, delta, abs: `${curVal.toLocaleString('pt-BR')} usuários ativos`, absDelta: Math.abs(curVal - prevVal) })
    })
    return rows.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 5)
  }, [opsByClient, clients])

  // Sync action
  const SUPABASE_URL     = import.meta.env.VITE_SUPABASE_URL
  const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

  async function handleSync(instId, clientId) {
    setSyncing(s => ({ ...s, [instId]: 'syncing' }))
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const refMonth = currentMonthStr

      // Step 1: Sync usage data
      const res = await fetch(`${SUPABASE_URL}/functions/v1/donc-api-sync`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}`, apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ trigger: 'manual', month: refMonth, client_id: clientId }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)

      // Step 2: Recalculate health score
      await fetch(`${SUPABASE_URL}/functions/v1/donc-api-sync`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}`, apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ trigger: 'health_recalc', client_id: clientId }),
      })

      setSyncing(s => ({ ...s, [instId]: 'done' }))
      qc.invalidateQueries({ queryKey: ['instances_no_sync'] })
      qc.invalidateQueries({ queryKey: ['ops_dashboard'] })
      qc.invalidateQueries({ queryKey: ['clients'] })
    } catch {
      setSyncing(s => ({ ...s, [instId]: 'error' }))
    }
  }

  if (isLoading && !clients.length) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', color: C.ink3, fontSize: 14, fontFamily: "'Montserrat', system-ui, sans-serif" }}>Carregando…</div>

  // ─── Drawer content renderers ──────────────────────────────────────────────
  function DrawerClientContent({ client, reasons }) {
    if (!client) return null
    const score  = client.health_total || 0
    const band   = scoreBand(score)
    const color  = scoreBandColor(score)
    const label  = scoreBandLabel(score)
    const signals = getSignals(client, lastActivityMap)
    const alertReasons = reasons && reasons.length > 0 ? reasons : []

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

    const lowDims = DIMS.filter(d => (client[d.key] || 0) < 10)

    const qaItems = []
    if (signals.some(s => s.kind === 'urgent' && /atraso/i.test(s.title))) qaItems.push({ tone: 'red', icon: Ic.check, label: 'Concluir atividade atrasada' })
    if (signals.some(s => /milestone/i.test(s.title))) qaItems.push({ tone: 'red', icon: Ic.cal, label: 'Reagendar milestone' })
    if (signals.some(s => /interação|contato/i.test(s.title))) qaItems.push({ tone: 'amber', icon: Ic.phone, label: 'Registrar contato agora' })
    qaItems.push({ tone: 'amber', icon: Ic.thermo, label: 'Atualizar temperatura' })
    qaItems.push({ tone: 'navy', icon: Ic.plus, label: 'Registrar atividade' })

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
            <button onClick={closeDrawer} style={{ border: 0, background: 'transparent', color: C.ink3, width: 32, height: 32, borderRadius: 8, cursor: 'pointer', display: 'grid', placeItems: 'center', marginTop: -6 }}
              onMouseEnter={e => { e.currentTarget.style.background = '#f1f3f5'; e.currentTarget.style.color = C.ink }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = C.ink3 }}>
              {Ic.close}
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
                    {s.kind === 'urgent' ? Ic.bolt : s.kind === 'warn' ? Ic.clock : Ic.thermo}
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
                return (
                  <button key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, border: `0.5px solid ${C.line}`, borderRadius: 12, background: 'transparent', cursor: 'pointer', textAlign: 'left', width: '100%' }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = C.lineStrong; e.currentTarget.style.background = '#fafbfc' }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = C.line; e.currentTarget.style.background = 'transparent' }}>
                    <div style={{ width: 26, height: 26, flexShrink: 0, borderRadius: 7, display: 'grid', placeItems: 'center', background: bg, color: clr }}>{qa.icon}</div>
                    <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: C.ink }}>{qa.label}</span>
                    <span style={{ color: C.ink4 }}>{Ic.chev}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* ── Saúde por dimensão ── */}
          <div>
            <h4 style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.ink3, margin: '0 0 12px' }}>Saúde por dimensão</h4>
            {DIMS.every(d => (client[d.key] ?? 0) >= 20) ? (
              <div style={{ fontSize: 13, fontWeight: 600, color: C.green, padding: '14px 16px', border: `0.5px solid ${C.greenSoft}`, borderRadius: 10, background: C.greenSoft, textAlign: 'center' }}>
                Todas as dimensões saudáveis ✓
              </div>
            ) : (
              DIMS.map(d => {
                const dimScore  = client[d.key] ?? 0
                const pct       = Math.min(100, Math.round((dimScore / 20) * 100))
                const dimRules  = healthRules.filter(r => r.dimension === d.cls || r.dimension === d.key)
                const violated  = evaluateClientRules(client, dimRules)
                const toImprove = [...violated].sort((a, b) => Math.abs(b.points) - Math.abs(a.points))
                return (
                  <div key={d.key} style={{ border: `0.5px solid ${C.line}`, borderRadius: 12, padding: 14, marginBottom: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>{d.label}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: d.color, fontVariantNumeric: 'tabular-nums' }}>{dimScore}/20</span>
                    </div>
                    <div style={{ height: 6, borderRadius: 4, background: C.bg, overflow: 'hidden', marginBottom: violated.length > 0 ? 10 : 0 }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: d.color, borderRadius: 4 }} />
                    </div>
                    {violated.length > 0 && (
                      <>
                        <div style={{ fontSize: 10.5, fontWeight: 700, color: C.ink4, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Penalizando</div>
                        {violated.map((r, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '5px 0', borderBottom: i < violated.length - 1 ? `0.5px solid ${C.line}` : 0 }}>
                            <span style={{ fontSize: 11.5, color: C.ink2, fontWeight: 500 }}>{r.label}</span>
                            <span style={{ fontSize: 11, fontWeight: 700, color: C.red, background: C.redSoft, padding: '2px 6px', borderRadius: 6, flexShrink: 0 }}>−{Math.abs(r.points)} pts</span>
                          </div>
                        ))}
                        {toImprove.length > 0 && (
                          <div style={{ marginTop: 10, padding: '10px 12px', background: C.amberSoft, borderRadius: 8 }}>
                            <div style={{ fontSize: 10.5, fontWeight: 700, color: C.amber, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Como melhorar</div>
                            {toImprove.map((r, i) => (
                              <div key={i} style={{ fontSize: 11.5, color: C.ink2, fontWeight: 500, marginBottom: i < toImprove.length - 1 ? 4 : 0 }}>
                                Resolver <b>{r.label}</b> → +{Math.abs(r.points)} pts
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </div>
        <div style={{ padding: '16px 24px 22px', borderTop: `0.5px solid ${C.line}`, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button onClick={() => navigate(`/empresas/${client.id}`)}
            style={{ background: C.navy, color: '#fff', border: 0, padding: '12px 16px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, letterSpacing: '-0.005em' }}
            onMouseEnter={e => e.currentTarget.style.background = C.navyDeep}
            onMouseLeave={e => e.currentTarget.style.background = C.navy}>
            Abrir cliente completo →
          </button>
          <button onClick={closeDrawer} style={{ background: 'transparent', border: 0, cursor: 'pointer', color: C.ink3, fontSize: 11.5, fontWeight: 500, textAlign: 'center' }}>Fechar</button>
        </div>
      </>
    )
  }

  function DrawerListContent({ kind, title, subtitle, rows }) {
    return (
      <>
        <div style={{ padding: '22px 24px 18px', borderBottom: `0.5px solid ${C.line}` }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.ink4 }}>{kind}</div>
              <h2 style={{ margin: '4px 0 0', fontSize: 19, fontWeight: 700, letterSpacing: '-0.02em', color: C.ink }}>{title}</h2>
              <div style={{ fontSize: 11.5, color: C.ink3, fontWeight: 500, marginTop: 6 }}>{subtitle}</div>
            </div>
            <button onClick={closeDrawer} style={{ border: 0, background: 'transparent', color: C.ink3, width: 32, height: 32, borderRadius: 8, cursor: 'pointer', display: 'grid', placeItems: 'center', marginTop: -6 }}
              onMouseEnter={e => { e.currentTarget.style.background = '#f1f3f5'; e.currentTarget.style.color = C.ink }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = C.ink3 }}>
              {Ic.close}
            </button>
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px 12px' }}>
          {rows}
        </div>
        <div style={{ padding: '16px 24px 22px', borderTop: `0.5px solid ${C.line}` }}>
          <button onClick={closeDrawer} style={{ background: 'transparent', border: 0, cursor: 'pointer', color: C.ink3, fontSize: 11.5, fontWeight: 500, textAlign: 'center', width: '100%' }}>Fechar</button>
        </div>
      </>
    )
  }

  function DRow({ children, onClick }) {
    return (
      <div onClick={onClick} style={{ padding: 12, border: `0.5px solid ${C.line}`, borderRadius: 12, marginBottom: 8, display: 'flex', flexDirection: 'column', gap: 4, cursor: onClick ? 'pointer' : 'default' }}
        onMouseEnter={e => { if (onClick) { e.currentTarget.style.borderColor = C.lineStrong; e.currentTarget.style.background = '#fafbfc' } }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = C.line; e.currentTarget.style.background = 'transparent' }}>
        {children}
      </div>
    )
  }

  function DrawerOpContent({ mode, clientId, clientName }) {
    const kindMap = { 'op-os': 'os', 'op-users': 'users', 'op-health': 'health' }
    const activeKind = kindMap[mode]
    const months = opHistoRows.map(r => fmtMonthShort(r.ref_month))

    const charts = [
      {
        kind: 'os',
        title: 'OS criadas',
        unit: ' OS',
        values: opHistoRows.map(r => r.donc_snapshot?.totalOs ?? 0),
        color: C.sky,
        colorSoft: C.skySoft,
      },
      {
        kind: 'users',
        title: 'Usuários ativos',
        unit: ' usuários',
        values: opHistoRows.map(r => r.donc_snapshot?.profissionais?.ativos ?? 0),
        color: C.green,
        colorSoft: C.greenSoft,
      },
      {
        kind: 'health',
        title: 'Health score',
        unit: ' pts',
        values: opHistoRows.map(r => r.health_snapshot ?? 0),
        color: C.amber,
        colorSoft: C.amberSoft,
      },
    ]

    return (
      <>
        <div style={{ padding: '22px 24px 18px', borderBottom: `0.5px solid ${C.line}` }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.ink4 }}>Operacional · DONC API</div>
              <h2 style={{ margin: '4px 0 0', fontSize: 19, fontWeight: 700, letterSpacing: '-0.02em', color: C.ink }}>{clientName}</h2>
              <div style={{ fontSize: 11.5, color: C.ink3, fontWeight: 500, marginTop: 6 }}>histórico 3 meses</div>
            </div>
            <button onClick={closeDrawer} style={{ border: 0, background: 'transparent', color: C.ink3, width: 32, height: 32, borderRadius: 8, cursor: 'pointer', display: 'grid', placeItems: 'center', marginTop: -6 }}
              onMouseEnter={e => { e.currentTarget.style.background = '#f1f3f5'; e.currentTarget.style.color = C.ink }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = C.ink3 }}>
              {Ic.close}
            </button>
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px 12px' }}>
          <h4 style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.ink3, margin: '0 0 12px' }}>Cliente em foco</h4>
          {charts.map(({ kind, title, unit, values, color, colorSoft }) => {
            const isActive = kind === activeKind
            const maxVal = Math.max(...values, 1)
            const cur  = values[values.length - 1] ?? 0
            const prev = values[values.length - 2] ?? 0
            const pct  = prev ? Math.round(((cur - prev) / prev) * 100) : 0
            const dirCls = pct >= 0 ? C.green : C.red
            const arrow  = pct >= 0 ? '▲' : '▼'
            return (
              <div key={kind} style={{ border: `0.5px solid ${isActive ? C.lineStrong : C.line}`, borderRadius: 12, padding: 14, marginBottom: 10, background: isActive ? C.surface : C.bg }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: isActive ? C.navy : C.ink2 }}>{title}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: dirCls }}>{arrow} {Math.abs(pct)}% · {cur.toLocaleString('pt-BR')}{unit}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 56, marginBottom: 6 }}>
                  {values.map((v, i) => {
                    const barColor = isActive
                      ? (i === values.length - 1 ? C.navy : C.sky)
                      : (i === values.length - 1 ? color : colorSoft)
                    return <div key={i} style={{ flex: 1, background: barColor, borderRadius: '4px 4px 2px 2px', height: `${Math.max(6, (v / maxVal) * 100)}%` }} />
                  })}
                </div>
                <div style={{ display: 'flex', gap: 8, fontSize: 10, color: C.ink4, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                  {months.map((m, i) => <span key={i} style={{ flex: 1, textAlign: 'center' }}>{m}</span>)}
                </div>
              </div>
            )
          })}
        </div>
        <div style={{ padding: '16px 24px 22px', borderTop: `0.5px solid ${C.line}`, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button onClick={() => navigate(`/empresas/${clientId}`)}
            style={{ background: C.navy, color: '#fff', border: 0, padding: '12px 16px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, letterSpacing: '-0.005em' }}
            onMouseEnter={e => e.currentTarget.style.background = C.navyDeep}
            onMouseLeave={e => e.currentTarget.style.background = C.navy}>
            Abrir cliente completo →
          </button>
        </div>
      </>
    )
  }

  function DrawerOpSyncContent() {
    return (
      <>
        <div style={{ padding: '22px 24px 18px', borderBottom: `0.5px solid ${C.line}` }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.ink4 }}>Operacional · DONC API</div>
              <h2 style={{ margin: '4px 0 0', fontSize: 19, fontWeight: 700, letterSpacing: '-0.02em', color: C.ink }}>Sincronização de dados</h2>
              <div style={{ fontSize: 11.5, color: C.ink3, fontWeight: 500, marginTop: 6 }}>{instancesNoSync.length} instâncias sem dados</div>
            </div>
            <button onClick={closeDrawer} style={{ border: 0, background: 'transparent', color: C.ink3, width: 32, height: 32, borderRadius: 8, cursor: 'pointer', display: 'grid', placeItems: 'center', marginTop: -6 }}
              onMouseEnter={e => { e.currentTarget.style.background = '#f1f3f5'; e.currentTarget.style.color = C.ink }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = C.ink3 }}>
              {Ic.close}
            </button>
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px 12px' }}>
          {instancesNoSync.map(inst => (
            <DRow key={inst.id}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.ink, letterSpacing: '-0.005em' }}>{inst.clientName}</div>
                  <div style={{ fontSize: 11.5, color: C.ink3, fontWeight: 500, marginTop: 2 }}>{inst.lastSync}</div>
                </div>
                <button
                  onClick={() => handleSync(inst.id, inst.clientId)}
                  disabled={syncing[inst.id] === 'syncing'}
                  style={{ background: 'transparent', border: `0.5px solid ${C.lineStrong}`, color: C.navy, fontSize: 11, fontWeight: 700, padding: '5px 9px', borderRadius: 6, cursor: 'pointer', flexShrink: 0, letterSpacing: '-0.005em' }}
                  onMouseEnter={e => { if (!e.currentTarget.disabled) { e.currentTarget.style.background = C.navy; e.currentTarget.style.color = '#fff' } }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = C.navy }}>
                  {syncing[inst.id] === 'syncing' ? 'sincronizando…' : syncing[inst.id] === 'done' ? 'ok ✓' : 'sincronizar'}
                </button>
              </div>
            </DRow>
          ))}
        </div>
        <div style={{ padding: '16px 24px 22px', borderTop: `0.5px solid ${C.line}` }}>
          <button onClick={closeDrawer} style={{ background: 'transparent', border: 0, cursor: 'pointer', color: C.ink3, fontSize: 11.5, fontWeight: 500, textAlign: 'center', width: '100%' }}>Fechar</button>
        </div>
      </>
    )
  }

  function renderDrawerContent() {
    if (!drawer) return null
    const { mode, data } = drawer

    if (mode === 'cliente') {
      const client = data.client
      return <DrawerClientContent client={client} reasons={client.reasons} />
    }
    if (mode === 'overdue') {
      const rows = overdueActivities.map(a => (
        <DRow key={a.id} onClick={() => setSelectedActivity(a)}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.ink, letterSpacing: '-0.005em' }}>{a.title || a.description}</div>
            <span style={{ fontSize: 11, fontWeight: 700, color: C.red, background: C.redSoft, padding: '3px 8px', borderRadius: 6, flexShrink: 0, letterSpacing: '0.02em', textTransform: 'uppercase' }}>
              {daysSince(a.activity_date)}d atrasada
            </span>
          </div>
          <div style={{ fontSize: 11.5, color: C.ink3, fontWeight: 500 }}>{a.client?.fantasy_name || a.client?.name}</div>
          <div style={{ fontSize: 11, color: C.ink3, fontWeight: 500, display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 2 }}>
            Vence: <b style={{ color: C.ink2, fontWeight: 700 }}>{fmtDate(a.activity_date)}</b>
            {a.responsible?.name && <><span>·</span><span>Resp.: <b style={{ color: C.ink2 }}>{a.responsible.name}</b></span></>}
          </div>
        </DRow>
      ))
      return <DrawerListContent kind="Operacional" title="Atividades atrasadas" subtitle={`${overdueActivities.length} atividades vencidas`} rows={rows} />
    }
    if (mode === 'silent') {
      const rows = semInteracao.map(c => {
        const last = lastActivityMap[c.id]
        const ds = last ? daysSince(last) : null
        return (
          <DRow key={c.id} onClick={() => openDrawer('cliente', { client: c })}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.ink, letterSpacing: '-0.005em' }}>{c.fantasy_name || c.name}</div>
              <span style={{ fontSize: 11, fontWeight: 700, color: C.amber, background: C.amberSoft, padding: '3px 8px', borderRadius: 6, flexShrink: 0 }}>
                {ds !== null ? `${ds}d` : 'nunca'} sem contato
              </span>
            </div>
            <div style={{ fontSize: 11, color: C.ink3, fontWeight: 500, marginTop: 2 }}>
              Última: <b style={{ color: C.ink2 }}>{last ? fmtDate(last) : 'sem registro'}</b>
            </div>
          </DRow>
        )
      })
      return <DrawerListContent kind="Relacionamento" title="Sem interação 30d+" subtitle={`${semInteracao.length} clientes silenciosos`} rows={rows} />
    }
    if (mode === 'milestones') {
      const rows = overdueOnboardingFases.map(f => {
        const ds = daysSince(f.planned_end)
        const cl = clients.find(c => c.id === f.clientId)
        return (
          <DRow key={f.id} onClick={cl ? () => openDrawer('cliente', { client: cl }) : undefined}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.ink, letterSpacing: '-0.005em' }}>{f.onboarding_fase_types?.name || '—'}</div>
              <span style={{ fontSize: 11, fontWeight: 700, color: C.red, background: C.redSoft, padding: '3px 8px', borderRadius: 6, flexShrink: 0 }}>{ds}d</span>
            </div>
            <div style={{ fontSize: 11.5, color: C.ink3, fontWeight: 500 }}>
              {cl?.fantasy_name || cl?.name || '—'}
            </div>
            <div style={{ fontSize: 11, color: C.ink3, fontWeight: 500, marginTop: 2 }}>
              Previsto: <b style={{ color: C.ink2 }}>{fmtDate(f.planned_end)}</b>
            </div>
          </DRow>
        )
      })
      return <DrawerListContent kind="Onboardings" title="Onboardings atrasados" subtitle={`${overdueOnboardingFases.length} fases em atraso`} rows={rows} />
    }
    if (mode === 'temps') {
      const rows = tempsVencidas.map(c => {
        const tempLabel = (() => {
          if (c.csm_temperature === 3)  return { label: 'Quente', cls: 'hot' }
          if (c.csm_temperature === 0)  return { label: 'Neutra', cls: 'gone' }
          if (c.csm_temperature === -3) return { label: 'Fria', cls: 'cold' }
          if (c.csm_temperature === -7) return { label: 'Muito fria', cls: 'cold' }
          return { label: 'Não avaliada', cls: 'gone' }
        })()
        const pillColors = {
          cold: { bg: C.skySoft, color: C.skyDeep },
          hot:  { bg: C.redSoft, color: C.red },
          gone: { bg: '#f1f3f5', color: C.ink3 },
        }[tempLabel.cls]
        const lastUpd = c.temperature_updated_at ? fmtDate(c.temperature_updated_at.slice(0, 10)) : 'nunca'
        return (
          <DRow key={c.id} onClick={() => openDrawer('cliente', { client: c })}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.ink, letterSpacing: '-0.005em' }}>{c.fantasy_name || c.name}</div>
              <span style={{ fontSize: 10.5, fontWeight: 700, padding: '3px 8px', borderRadius: 999, textTransform: 'uppercase', letterSpacing: '0.05em', background: pillColors.bg, color: pillColors.color, flexShrink: 0 }}>
                {tempLabel.label}
              </span>
            </div>
            <div style={{ fontSize: 11, color: C.ink3, fontWeight: 500, marginTop: 2 }}>
              Última avaliação: <b style={{ color: C.ink2 }}>{lastUpd}</b>
            </div>
          </DRow>
        )
      })
      return <DrawerListContent kind="Saúde" title="Temperaturas vencidas" subtitle={`${tempsVencidas.length} clientes a reavaliar`} rows={rows} />
    }
    if (mode === 'healthy') {
      const healthyClients = clients.filter(c => (c.health_total || 0) >= 75)
      const rows = healthyClients.map(c => {
        const s = c.health_total || 0
        return (
          <DRow key={c.id} onClick={() => openDrawer('cliente', { client: c })}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.ink, letterSpacing: '-0.005em' }}>{c.fantasy_name || c.name}</div>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', padding: '3px 8px', borderRadius: 999, background: C.greenSoft, color: C.green }}>{s}</span>
            </div>
            <div style={{ fontSize: 11.5, color: C.ink3, fontWeight: 500 }}>saudável · score {s}/100</div>
          </DRow>
        )
      })
      return <DrawerListContent kind="Saúde" title="Clientes saudáveis" subtitle={`${healthyClients.length} clientes com score ≥ 75`} rows={rows} />
    }
    if (mode === 'renewals') {
      const rows = renovacao30.map(c => {
        return (
          <DRow key={c.id} onClick={() => openDrawer('cliente', { client: c })}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.ink, letterSpacing: '-0.005em' }}>{c.fantasy_name || c.name}</div>
              <span style={{ fontSize: 11, fontWeight: 700, color: C.amber, background: C.amberSoft, padding: '3px 8px', borderRadius: 6, flexShrink: 0 }}>{fmtDate(c.contract_renewal)}</span>
            </div>
            {c.mrr > 0 && (
              <div style={{ fontSize: 11, color: C.ink3, fontWeight: 500, marginTop: 2 }}>
                MRR: <b style={{ color: C.ink2 }}>{fmtMrr(c.mrr)}</b>
                {c.abc_class && <> · Classe ABC: <b style={{ color: C.ink2 }}>{c.abc_class}</b></>}
              </div>
            )}
          </DRow>
        )
      })
      return <DrawerListContent kind="Comercial" title="Renovações em 30 dias" subtitle={`${renovacao30.length} contratos a renovar`} rows={rows} />
    }
    if (mode === 'risk') {
      const riskClients = clients.filter(c => (c.health_total || 0) < 50).sort((a, b) => (a.health_total || 0) - (b.health_total || 0))
      const rows = riskClients.map(c => {
        const s = c.health_total || 0
        return (
          <DRow key={c.id} onClick={() => openDrawer('cliente', { client: c })}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.ink, letterSpacing: '-0.005em' }}>{c.fantasy_name || c.name}</div>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', padding: '3px 8px', borderRadius: 999, background: C.redSoft, color: C.red }}>{s}</span>
            </div>
            <div style={{ fontSize: 11.5, color: C.ink3, fontWeight: 500 }}>score {s}/100 · risco</div>
          </DRow>
        )
      })
      return <DrawerListContent kind="Saúde" title="Clientes em risco" subtitle={`${riskClients.length} clientes com score < 50`} rows={rows} />
    }
    if (mode === 'op-os' || mode === 'op-users' || mode === 'op-health') {
      return <DrawerOpContent mode={mode} clientId={data.clientId} clientName={data.clientName} />
    }
    if (mode === 'op-sync') {
      return <DrawerOpSyncContent />
    }
    return null
  }

  // ─── Render ────────────────────────────────────────────────────────────────
  const drawerOpen = !!drawer
  const avgScore = clients.length ? Math.round(clients.reduce((s, c) => s + (c.health_total || 0), 0) / clients.length) : 0

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      fontFamily: "'Montserrat', system-ui, sans-serif",
      fontSize: 14, lineHeight: 1.45, letterSpacing: '-0.005em', color: C.ink,
      fontWeight: 400, WebkitFontSmoothing: 'antialiased',
      paddingRight: drawerOpen ? 380 : 0, transition: 'padding-right 0.3s ease',
      background: C.bg,
    }}>

      {/* ══════════════ FAIXA 1 — PULSO ══════════════ */}
      <section style={{ background: C.navy, padding: '48px 40px 36px', borderTop: '2px solid rgba(255,255,255,0.15)', marginTop: 28 }}>
        <div style={{ maxWidth: 1640, margin: '0 auto', display: 'grid', gridTemplateColumns: '1.25fr 1fr 1fr', gap: 24, alignItems: 'stretch' }}>

          {/* Bloco 1 — Identidade */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18, paddingRight: 24, borderRight: `0.5px solid ${C.navyLine}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              {/* Avatar */}
              {profile?.avatar_url ? (
                <img src={profile.avatar_url} alt={profile.name} style={{ width: 100, height: 100, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: `0.5px solid ${C.navyLineStrong}` }} />
              ) : (
                <div style={{ width: 100, height: 100, borderRadius: '50%', flexShrink: 0, background: 'linear-gradient(135deg, #59c2ed 0%, #1f4068 100%)', display: 'grid', placeItems: 'center', color: '#fff', fontWeight: 700, fontSize: 30, letterSpacing: '0.02em', border: `0.5px solid ${C.navyLineStrong}` }}>
                  {initials(profile?.name)}
                </div>
              )}
              {/* Text */}
              <div>
                <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.15, color: '#fff' }}>
                  {greeting()}, {profile?.name?.split(' ')[0]}.
                </h1>
                <p style={{ margin: '4px 0 0', fontSize: 13, color: C.navyTextMuted, fontWeight: 500, lineHeight: 1.4 }}>{dateStr}</p>
                <p style={{ margin: '4px 0 0', fontSize: 13, color: C.navyTextMuted, fontWeight: 500, lineHeight: 1.4 }}>{phrase}</p>
              </div>
            </div>

            {/* Pills */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {[
                { num: emRisco.length, label: 'em risco', tone: 'red', mode: 'risk' },
                { num: overdueActivities.length, label: 'atividades atrasadas', tone: 'amber', mode: 'overdue' },
                { num: saudaveis.length, label: 'saudáveis', tone: 'green', mode: 'healthy' },
                { num: renovacao30.length, label: 'renovações em 30d', tone: 'amber', mode: 'renewals' },
              ].map(({ num, label, tone, mode }) => {
                const numColors = { red: '#ff8a8a', amber: '#f5c270', green: '#7fd6a8' }
                return (
                  <button key={mode} onClick={() => openDrawer(mode)}
                    style={{ fontSize: 12, fontWeight: 600, padding: '7px 12px', borderRadius: 999, background: 'rgba(255,255,255,0.08)', color: C.navyTextSoft, border: `0.5px solid ${C.navyLine}`, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8, letterSpacing: '-0.005em' }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.13)'; e.currentTarget.style.borderColor = C.navyLineStrong }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.borderColor = C.navyLine }}>
                    <span style={{ fontWeight: 700, fontSize: 13, color: numColors[tone] }}>{num}</span>
                    {label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Bloco 2 — MRR */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '0 24px', borderRight: `0.5px solid ${C.navyLine}` }}>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.navyTextMuted }}>MRR do portfólio</span>
            <div>
              <div style={{ fontSize: 38, fontWeight: 700, letterSpacing: '-0.03em', color: C.lime, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                {fmtMrr(mrrTotal)} <small style={{ fontSize: 14, fontWeight: 600, color: C.navyTextSoft, marginLeft: 6, letterSpacing: 0 }}>/mês</small>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 4 }}>
              <div style={{ padding: '10px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.05)', border: `0.5px solid ${C.navyLine}`, display: 'flex', flexDirection: 'column', gap: 3 }}>
                <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.navyTextMuted }}>ARR</span>
                <span style={{ fontSize: 16, fontWeight: 700, color: '#fff', letterSpacing: '-0.01em', fontVariantNumeric: 'tabular-nums' }}>{fmtMrr(mrrTotal * 12)}</span>
              </div>
              <div style={{ padding: '10px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.05)', border: `0.5px solid ${C.navyLine}`, display: 'flex', flexDirection: 'column', gap: 3 }}>
                <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.navyTextMuted }}>Em atraso</span>
                <span style={{ fontSize: 16, fontWeight: 700, color: mrrAtrasado > 0 ? '#ff8a8a' : '#fff', letterSpacing: '-0.01em', fontVariantNumeric: 'tabular-nums' }}>{fmtMrr(mrrAtrasado)}</span>
              </div>
            </div>
            <div style={{ fontSize: 12, color: C.navyTextMuted, fontWeight: 500, marginTop: 'auto' }}>{clients.length} empresa{clients.length !== 1 ? 's' : ''} ativa{clients.length !== 1 ? 's' : ''}</div>
          </div>

          {/* Bloco 3 — Counters */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingLeft: 24 }}>
            {/* CSM dropdown — admin/manager, right-aligned */}
            {isAdminOrManager && (
              <div style={{ position: 'relative', userSelect: 'none', display: 'flex', justifyContent: 'flex-end' }}>
                <div onClick={() => setCsmDropdownOpen(o => !o)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '7px 12px', borderRadius: 8, cursor: 'pointer', background: 'rgba(255,255,255,0.08)', border: `0.5px solid ${C.navyLine}` }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: C.navyTextSoft }}>{selectedCsmProfile?.name || 'Todos os CSMs'}</span>
                  <span style={{ fontSize: 10, color: C.navyTextMuted }}>{csmDropdownOpen ? '▲' : '▼'}</span>
                </div>
                {csmDropdownOpen && (
                  <>
                    <div onClick={() => setCsmDropdownOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 99 }} />
                    <div style={{ position: 'absolute', top: 'calc(100% + 4px)', right: 0, minWidth: 200, background: C.surface, border: `0.5px solid ${C.line}`, borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.12)', zIndex: 100, overflow: 'hidden' }}>
                      {[{ id: '', name: 'Todos os CSMs' }, ...csmList].map(p => (
                        <div key={p.id} onClick={() => { setSelectedCsm(p.id); setCsmDropdownOpen(false) }}
                          style={{ padding: '9px 14px', fontSize: 13, color: C.ink, cursor: 'pointer', background: selectedCsm === p.id ? '#f0efed' : '#fff', fontWeight: selectedCsm === p.id ? 600 : 400 }}
                          onMouseEnter={e => e.currentTarget.style.background = '#f7f7f5'}
                          onMouseLeave={e => e.currentTarget.style.background = selectedCsm === p.id ? '#f0efed' : '#fff'}>
                          {p.name}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
            {[
              { label: 'Sem interação 30d+', value: semInteracao.length, tone: 'amber', mode: 'silent' },
              { label: 'Onboardings atrasados', value: overdueCount, tone: 'red', mode: 'milestones' },
              { label: 'Temperaturas vencidas', value: tempsVencidas.length, tone: 'amber', mode: 'temps' },
            ].map(({ label, value, tone, mode }) => {
              const numColors = { red: '#ff8a8a', amber: '#f5c270' }
              return (
                <button key={mode} onClick={() => openDrawer(mode)}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', background: 'rgba(255,255,255,0.04)', border: `0.5px solid ${C.navyLine}`, borderRadius: 12, cursor: 'pointer' }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.borderColor = C.navyLineStrong }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.borderColor = C.navyLine }}>
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: C.navyTextSoft, letterSpacing: '-0.005em' }}>{label}</span>
                  <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums', color: numColors[tone] }}>{value}</span>
                </button>
              )
            })}
          </div>

        </div>
      </section>

      {/* ══════════════ FAIXA 2 — URGÊNCIAS ══════════════ */}
      <section style={{ background: C.bg, padding: '28px 40px' }}>
        <div style={{ maxWidth: 1640, margin: '0 auto' }}>
          <StripHead title="Urgências · ação nesta semana" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, alignItems: 'stretch' }}>

            {/* Alertas prioritários */}
            <Panel>
              <PanelHead title="Alertas prioritários" meta={`${alertaClients.length} ativo${alertaClients.length !== 1 ? 's' : ''}`} />
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {alertaClients.length === 0 ? (
                  <p style={{ fontSize: 13, color: C.ink3, textAlign: 'center', padding: '16px 0' }}>Nenhum alerta no momento.</p>
                ) : alertaClients.map(c => {
                  const score = c.health_total || 0
                  const color = scoreBandColor(score)
                  const hasRed = c.reasons.some(r => r.kind === 'red')
                  const barColor = hasRed ? C.red : C.amber
                  return (
                    <div key={c.id} onClick={() => openDrawer('cliente', { client: c })}
                      style={{ display: 'grid', gridTemplateColumns: '4px 1fr auto', gap: 14, padding: '12px 8px 12px 0', borderBottom: `0.5px solid ${C.line}`, cursor: 'pointer', borderRadius: 6 }}
                      onMouseEnter={e => e.currentTarget.style.background = '#f8f9fb'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                      <div style={{ width: 3, borderRadius: 2, alignSelf: 'stretch', marginLeft: 4, background: barColor }} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: C.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.fantasy_name || c.name}</div>
                        {c.reasons.length > 0 && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                            {c.reasons.map((r, i) => (
                              <span key={i} style={{ fontSize: 10.5, fontWeight: 700, padding: '3px 7px', borderRadius: 5, letterSpacing: '0.02em', textTransform: 'uppercase', display: 'inline-flex', alignItems: 'center', gap: 4, color: r.kind === 'red' ? C.red : C.amber, background: r.kind === 'red' ? C.redSoft : C.amberSoft }}>
                                <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor', flexShrink: 0 }} />
                                {r.label}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums', alignSelf: 'flex-start', paddingTop: 2, color }}>
                        {score}<small style={{ fontSize: 11, fontWeight: 600, color: C.ink4, marginLeft: 2 }}>/100</small>
                      </div>
                    </div>
                  )
                })}
              </div>
              <SeeAll onClick={() => navigate('/empresas?health=alerta')}>ver todos →</SeeAll>
            </Panel>

            {/* Próximas atividades */}
            <Panel>
              <PanelHead title="Próximas atividades" meta={`${upcomingActivities.length} esta semana`} />
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {upcomingActivities.length === 0 ? (
                  <p style={{ fontSize: 13, color: C.ink3, textAlign: 'center', padding: '16px 0' }}>Nenhuma atividade pendente.</p>
                ) : upcomingActivities.slice(0, 7).map((a, i) => {
                  const isOver  = a.activity_date < todayStr
                  const isToday = a.activity_date === todayStr
                  const dateLabel = isOver ? 'atrasada' : isToday ? 'hoje' : (() => { const [,m,d] = a.activity_date.split('-'); return `${d}/${m}` })()
                  const urgBg    = isOver ? C.redSoft : isToday ? C.amberSoft : C.skySoft
                  const urgColor = isOver ? C.red     : isToday ? C.amber     : C.skyDeep
                  const urgCls   = isOver ? 'red'     : isToday ? 'amber'     : 'sky'
                  return (
                    <div key={a.id} onClick={() => setSelectedActivity(a)}
                      style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 0', borderBottom: i < Math.min(upcomingActivities.length, 7) - 1 ? `0.5px solid ${C.line}` : 0, cursor: 'pointer', borderRadius: 6 }}
                      onMouseEnter={e => { e.currentTarget.style.background = '#f8f9fb'; e.currentTarget.style.paddingLeft = '6px'; e.currentTarget.style.paddingRight = '6px' }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.paddingLeft = '0'; e.currentTarget.style.paddingRight = '0' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 600, color: C.ink, letterSpacing: '-0.005em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.title || a.description}</div>
                        {(a.client?.fantasy_name || a.client?.name) && (
                          <div style={{ fontSize: 11.5, color: C.ink3, fontWeight: 500, marginTop: 2 }}>{a.client.fantasy_name || a.client.name}</div>
                        )}
                      </div>
                      <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', padding: '4px 9px', borderRadius: 6, flexShrink: 0, background: urgBg, color: urgColor }}>{dateLabel}</span>
                    </div>
                  )
                })}
              </div>
              <SeeAll onClick={() => navigate('/atividades')}>ver todas →</SeeAll>
            </Panel>
          </div>
        </div>
      </section>

      {/* ══════════════ FAIXA 3 — PORTFÓLIO ══════════════ */}
      <section style={{ background: C.surface, borderTop: `0.5px solid ${C.line}`, borderBottom: `0.5px solid ${C.line}`, padding: '28px 40px' }}>
        <div style={{ maxWidth: 1640, margin: '0 auto' }}>
          <StripHead title="Portfólio · saúde da carteira" right={`média ${avgScore} · ${clients.length} clientes`} />
          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 20, alignItems: 'stretch' }}>

            {/* Saúde rankeada */}
            <Panel>
              <PanelHead title="Saúde rankeada · menor → maior score" meta="10 clientes" />
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {sortedPortfolio.slice(0, 8).map(c => {
                  const score = c.health_total || 0
                  const band  = scoreBand(score)
                  const color = scoreBandColor(score)
                  const label = scoreBandLabel(score)
                  const pillBg = band === 'red' ? C.redSoft : band === 'amber' ? C.amberSoft : C.greenSoft
                  return (
                    <div key={c.id} onClick={() => openDrawer('cliente', { client: c })}
                      style={{ display: 'grid', gridTemplateColumns: '160px 1fr 44px 70px', gap: 14, alignItems: 'center', padding: '10px 0', borderBottom: `0.5px solid ${C.line}`, cursor: 'pointer', borderRadius: 6 }}
                      onMouseEnter={e => { e.currentTarget.style.background = '#f8f9fb'; e.currentTarget.style.paddingLeft = '6px'; e.currentTarget.style.paddingRight = '6px' }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.paddingLeft = '0'; e.currentTarget.style.paddingRight = '0' }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: C.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.fantasy_name || c.name}</div>
                      <div style={{ height: 7, background: '#f1f3f5', borderRadius: 999, overflow: 'hidden' }}>
                        <div style={{ height: '100%', borderRadius: 999, background: color, width: `${Math.min(100, score)}%` }} />
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: '-0.01em', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color }}>{score}</div>
                      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', padding: '3px 8px', borderRadius: 999, textAlign: 'center', background: pillBg, color }}>{label}</span>
                    </div>
                  )
                })}
              </div>
              <SeeAll onClick={() => navigate('/empresas')}>ver todos os {clients.length} →</SeeAll>
            </Panel>

            {/* Coluna direita */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20, height: '100%' }}>

              {/* Saúde por dimensão */}
              <Panel>
                <PanelHead title="Saúde por dimensão" meta={`${clients.length} clientes`} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
                  {dimHealth.map(d => {
                    const pct = d.total > 0 ? Math.round((d.ok / d.total) * 100) : 0
                    const DimIcon = HealthDimensionIcons[d.iconKey]
                    const isAlert = d.alert > 0
                    return (
                      <div key={d.key} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
                          <div style={{ width: 18, height: 18, flexShrink: 0, borderRadius: 5, display: 'grid', placeItems: 'center', color: d.cls === 'proj' ? C.limeDeep : '#fff', background: d.color }}>
                            {DimIcon ? <DimIcon style={{ width: 11, height: 11 }} strokeWidth={2.5} /> : DIM_ICONS[d.cls]}
                          </div>
                          <span style={{ fontWeight: 600, color: C.ink, flex: 1 }}>{d.label}</span>
                          <span style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '-0.005em', fontVariantNumeric: 'tabular-nums', color: isAlert ? C.red : C.green }}>
                            {isAlert ? `${d.alert}/${d.total} alerta` : `${d.ok}/${d.total} ok`}
                          </span>
                        </div>
                        <div style={{ height: 6, background: '#f1f3f5', borderRadius: 999, overflow: 'hidden' }}>
                          <div style={{ height: '100%', borderRadius: 999, background: d.color, width: `${pct}%` }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </Panel>

              {/* Sem interação recente */}
              <Panel>
                <PanelHead title="Sem interação recente" meta={`${semInteracao.length} clientes`} />
                <div>
                  {semInteracao.slice(0, 4).map(c => {
                    const last = lastActivityMap[c.id]
                    const ds = last ? daysSince(last) : null
                    return (
                    <div key={c.id} onClick={() => openDrawer('cliente', { client: c, fromAlertas: true })}
                        style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: `0.5px solid ${C.line}`, cursor: 'pointer', borderRadius: 6 }}
                        onMouseEnter={e => { e.currentTarget.style.background = '#f8f9fb'; e.currentTarget.style.paddingLeft = '6px'; e.currentTarget.style.paddingRight = '6px' }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.paddingLeft = '0'; e.currentTarget.style.paddingRight = '0' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>{c.fantasy_name || c.name}</div>
                          <div style={{ fontSize: 11, color: C.ink3, fontWeight: 500, marginTop: 2 }}>{last ? fmtDate(last) : 'sem registro'}</div>
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 8px', borderRadius: 6, background: C.amberSoft, color: C.amber, flexShrink: 0, letterSpacing: '-0.005em' }}>
                          {ds !== null ? `${ds}d` : '—'}
                        </span>
                      </div>
                    )
                  })}
                </div>
                <SeeAll onClick={() => openDrawer('silent')}>ver todos →</SeeAll>
              </Panel>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════ FAIXA 4 — OPERACIONAL ══════════════ */}
      <section style={{ background: C.bg, padding: '28px 40px' }}>
        <div style={{ maxWidth: 1640, margin: '0 auto' }}>
          <StripHead
            title={`Operacional · ${prevMonthLabel.charAt(0).toUpperCase() + prevMonthLabel.slice(1)}`}
            right={<span onClick={() => navigate('/empresas')} style={{ color: C.navy, fontWeight: 600, cursor: 'pointer' }}>ver dados completos →</span>}
          />

          {!hasOpsData ? (
            <div style={{ background: C.surface, border: `0.5px solid ${C.line}`, borderRadius: 16, padding: '36px 28px', textAlign: 'center' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.ink, marginBottom: 6 }}>Nenhum dado sincronizado para {prevMonthLabel}</div>
              <div style={{ fontSize: 12.5, color: C.ink3, fontWeight: 500 }}>
                Acesse <span onClick={() => navigate('/configuracoes')} style={{ color: C.navy, fontWeight: 600, cursor: 'pointer' }}>Configurações → API DONC</span> para sincronizar
              </div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 20, alignItems: 'stretch' }}>

              {/* OS criadas */}
              <Panel>
                <PanelHead title="OS criadas · variação mensal" meta="top 5" />
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {opOSList.map((x, i) => {
                    const up = x.delta >= 0
                    return (
                      <div key={i} onClick={() => openDrawer('op-os', { clientId: x.clientId, clientName: x.name })}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 0', borderBottom: `0.5px solid ${C.line}`, cursor: 'pointer', borderRadius: 6 }}
                        onMouseEnter={e => { e.currentTarget.style.background = '#f8f9fb'; e.currentTarget.style.paddingLeft = '6px'; e.currentTarget.style.paddingRight = '6px' }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.paddingLeft = '0'; e.currentTarget.style.paddingRight = '0' }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 12.5, fontWeight: 600, color: C.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 140 }}>{x.name}</div>
                          <div style={{ fontSize: 10.5, color: C.ink3, fontWeight: 500, marginTop: 1 }}>{x.abs}</div>
                        </div>
                        <span style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '-0.01em', fontVariantNumeric: 'tabular-nums', display: 'inline-flex', alignItems: 'center', gap: 2, color: up ? C.green : C.red }}>
                          {x.absDelta.toLocaleString('pt-BR')} OS {up ? '▲' : '▼'}{Math.abs(x.delta)}%
                        </span>
                      </div>
                    )
                  })}
                </div>
                <SeeAll onClick={() => openDrawer('op-os', opOSList[0] ? { clientId: opOSList[0].clientId, clientName: opOSList[0].name } : {})}>ver todos →</SeeAll>
              </Panel>

              {/* Usuários ativos */}
              <Panel>
                <PanelHead title="Usuários ativos · variação mensal" meta="top 5" />
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {opUsersList.map((x, i) => {
                    const up = x.delta >= 0
                    return (
                      <div key={i} onClick={() => openDrawer('op-users', { clientId: x.clientId, clientName: x.name })}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 0', borderBottom: `0.5px solid ${C.line}`, cursor: 'pointer', borderRadius: 6 }}
                        onMouseEnter={e => { e.currentTarget.style.background = '#f8f9fb'; e.currentTarget.style.paddingLeft = '6px'; e.currentTarget.style.paddingRight = '6px' }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.paddingLeft = '0'; e.currentTarget.style.paddingRight = '0' }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 12.5, fontWeight: 600, color: C.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 140 }}>{x.name}</div>
                          <div style={{ fontSize: 10.5, color: C.ink3, fontWeight: 500, marginTop: 1 }}>{x.abs}</div>
                        </div>
                        <span style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '-0.01em', fontVariantNumeric: 'tabular-nums', display: 'inline-flex', alignItems: 'center', gap: 2, color: up ? C.green : C.red }}>
                          {x.absDelta.toLocaleString('pt-BR')} usu. {up ? '▲' : '▼'}{Math.abs(x.delta)}%
                        </span>
                      </div>
                    )
                  })}
                </div>
                <SeeAll onClick={() => openDrawer('op-users', opUsersList[0] ? { clientId: opUsersList[0].clientId, clientName: opUsersList[0].name } : {})}>ver todos →</SeeAll>
              </Panel>

              {/* Health score variação */}
              <Panel>
                <PanelHead title="Health score · variação mensal" meta="top 5" />
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {opHealthList.list.map((x, i) => {
                    const up = x.delta >= 0
                    return (
                      <div key={i} onClick={() => openDrawer('op-health', { clientId: x.clientId, clientName: x.name })}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 0', borderBottom: `0.5px solid ${C.line}`, cursor: 'pointer', borderRadius: 6 }}
                        onMouseEnter={e => { e.currentTarget.style.background = '#f8f9fb'; e.currentTarget.style.paddingLeft = '6px'; e.currentTarget.style.paddingRight = '6px' }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.paddingLeft = '0'; e.currentTarget.style.paddingRight = '0' }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 12.5, fontWeight: 600, color: C.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 140 }}>{x.name}</div>
                          <div style={{ fontSize: 10.5, color: C.ink3, fontWeight: 500, marginTop: 1 }}>score {x.cur}</div>
                        </div>
                        <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: '-0.01em', fontVariantNumeric: 'tabular-nums', display: 'inline-flex', alignItems: 'center', gap: 3, color: up ? C.green : C.red }}>
                          {up ? '▲' : '▼'} {Math.abs(x.delta)} pts
                        </span>
                      </div>
                    )
                  })}
                  {opHealthList.list.length > 0 && opHealthList.list.every(x => x.delta === 0) && (
                    <div style={{ fontSize: 11, color: 'var(--ink-4)', fontStyle: 'italic', marginTop: 8 }}>
                      Variação disponível a partir do próximo ciclo de sincronização
                    </div>
                  )}
                </div>
                <SeeAll onClick={() => openDrawer('op-health', opHealthList.list[0] ? { clientId: opHealthList.list[0].clientId, clientName: opHealthList.list[0].name } : {})}>ver todos →</SeeAll>
              </Panel>

              {/* Sincronização */}
              <Panel>
                <PanelHead title="Sincronização de dados" meta={instancesNoSync.length > 0 ? `${instancesNoSync.length} pendentes` : 'ok'} />
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {instancesNoSync.length === 0 ? (
                    <div style={{ fontSize: 12.5, color: C.green, fontWeight: 600, textAlign: 'center', padding: '20px 0' }}>Todos os clientes sincronizados ✓</div>
                  ) : instancesNoSync.slice(0, 4).map(inst => (
                    <div key={inst.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: `0.5px solid ${C.line}` }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 600, color: C.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{inst.clientName}</div>
                        <div style={{ fontSize: 10.5, color: C.ink3, fontWeight: 500, marginTop: 1 }}>{inst.lastSync}</div>
                      </div>
                      <button
                        onClick={() => handleSync(inst.id, inst.clientId)}
                        disabled={syncing[inst.id] === 'syncing'}
                        style={{ background: 'transparent', border: `0.5px solid ${C.lineStrong}`, color: C.navy, fontSize: 11, fontWeight: 700, padding: '5px 9px', borderRadius: 6, cursor: 'pointer', flexShrink: 0, letterSpacing: '-0.005em' }}
                        onMouseEnter={e => { if (!e.currentTarget.disabled) { e.currentTarget.style.background = C.navy; e.currentTarget.style.color = '#fff' } }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = C.navy }}>
                        {syncing[inst.id] === 'syncing' ? 'sincronizando…' : syncing[inst.id] === 'done' ? 'ok ✓' : 'sincronizar'}
                      </button>
                    </div>
                  ))}
                </div>
                <SeeAll onClick={() => openDrawer('op-sync')}>ver todos →</SeeAll>
              </Panel>
            </div>
          )}
        </div>
      </section>

      {/* ══════════════ OVERLAY + DRAWER ══════════════ */}
      <div onClick={closeDrawer} style={{
        position: 'fixed', inset: 0, background: 'rgba(14,34,58,0.18)',
        opacity: drawerOpen ? 1 : 0, pointerEvents: drawerOpen ? 'auto' : 'none',
        transition: 'opacity 0.25s ease', zIndex: 40,
      }} />

      <aside style={{
        position: 'fixed', top: 0, right: 0, height: '100vh', width: 380,
        background: C.surface, borderLeft: `0.5px solid ${C.line}`,
        zIndex: 50, display: 'flex', flexDirection: 'column',
        transform: drawerOpen ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.3s cubic-bezier(.3,.7,.3,1)',
        boxShadow: '-1px 0 0 rgba(15,34,58,0.04), -24px 0 48px -24px rgba(15,34,58,0.16)',
        fontFamily: "'Montserrat', system-ui, sans-serif",
      }}>
        {renderDrawerContent()}
      </aside>

      {/* Activity detail modal */}
      {selectedActivity && (
        <ActivityDetailModal activity={selectedActivity} onClose={() => setSelectedActivity(null)} />
      )}
    </div>
  )
}
