import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabaseClient'
import { useClients } from '../../hooks/useClients'
import { useActivities } from '../../hooks/useActivities'
import { useProfiles } from '../../hooks/useProfiles'
import { useAuth } from '../../contexts/AuthContext'
import { PageSpinner } from '../ui/Spinner'
import { BrazilMap } from './BrazilMap'
import { HealthDimensionIcons } from "../../lib/icons"

// ─── Constants ───────────────────────────────────────────────────────────────
const todayStr = new Date().toISOString().slice(0, 10)
const in30Str  = (() => { const d = new Date(); d.setDate(d.getDate() + 30); return d.toISOString().slice(0, 10) })()
const ago30Str = (() => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().slice(0, 10) })()

const DIMS = [
  { key: 'health_uso',            label: 'Uso',            color: '#59c2ed', icon: 'health_uso' },
  { key: 'health_suporte',        label: 'Suporte',        color: '#E24B4A', icon: 'health_suporte' },
  { key: 'health_relacionamento', label: 'Relacionamento', color: '#534AB7', icon: 'health_relacionamento' },
  { key: 'health_financeiro',     label: 'Financeiro',     color: '#BA7517', icon: 'health_financeiro' },
  { key: 'health_projeto',        label: 'Projeto',        color: '#1D9E75', icon: 'health_projeto' },
]

const PHRASES = [
  'Pronta para mais um dia?',
  'Vamos lá, seu portfólio espera!',
  'Foco no cliente, sempre.',
  'Que dia produtivo te espera!',
]

const ABC_COLORS = { A: '#1D9E75', B: '#BA7517', C: '#E24B4A' }

// ─── Helpers ─────────────────────────────────────────────────────────────────
function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Bom dia'
  if (h < 18) return 'Boa tarde'
  return 'Boa noite'
}

function initials(name = '') {
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?'
}

function ptDate(str) {
  return new Date(str + 'T00:00:00').toLocaleDateString('pt-BR')
}

// ─── Sub-components ──────────────────────────────────────────────────────────
function HeroAvatar({ profile }) {
  if (profile?.avatar_url) {
    return (
      <img
        src={profile.avatar_url}
        alt={profile.name}
        style={{ width: 100, height: 100, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: '2px solid rgba(255,255,255,0.15)' }}
      />
    )
  }
  return (
    <div style={{
      width: 100, height: 100, borderRadius: '50%', flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      backgroundColor: '#0d2340', color: '#59c2ed', fontSize: 32, fontWeight: 700,
      border: '2px solid rgba(255,255,255,0.10)',
    }}>
      {initials(profile?.name)}
    </div>
  )
}

function HeroPill({ label, value, valueColor }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '5px 10px', borderRadius: 20,
      backgroundColor: 'rgba(255,255,255,0.07)',
      fontSize: 12, color: 'rgba(255,255,255,0.45)',
      whiteSpace: 'nowrap',
    }}>
      <strong style={{ color: valueColor, fontWeight: 700 }}>{value}</strong>
      {label}
    </span>
  )
}

function MetricCard({ label, value, sub, subColor, color, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        backgroundColor: '#fff', border: '0.5px solid #e8e7e3', borderRadius: 10, padding: 16,
        cursor: onClick ? 'pointer' : 'default', minWidth: 0,
      }}
    >
      <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#888780', marginBottom: 6, lineHeight: 1.2 }}>
        {label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, color: color || '#1a1a18', lineHeight: 1 }}>
        {value}
      </div>
      {sub !== undefined && (
        <div style={{ fontSize: 12, color: subColor || '#888780', marginTop: 5 }}>{sub}</div>
      )}
    </div>
  )
}

function SectionCard({ title, action, children, style }) {
  return (
    <div style={{ backgroundColor: '#fff', border: '0.5px solid #e8e7e3', borderRadius: 10, padding: 16, minWidth: 0, boxSizing: 'border-box', ...style }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#1a1a18' }}>{title}</span>
        {action}
      </div>
      {children}
    </div>
  )
}

function EmptyState({ text }) {
  return <p style={{ fontSize: 13, color: '#888780', padding: '8px 0', textAlign: 'center' }}>{text}</p>
}

function LinkBtn({ onClick, children }) {
  return (
    <button onClick={onClick} style={{ fontSize: 12, color: '#59c2ed', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
      {children}
    </button>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const isAdminOrManager = profile?.role === 'admin' || profile?.role === 'manager'
  const [selectedCsm, setSelectedCsm] = useState('')
  const [csmDropdownOpen, setCsmDropdownOpen] = useState(false)
  const phrase = useMemo(() => PHRASES[Math.floor(Math.random() * PHRASES.length)], [])

  const csmFilter = isAdminOrManager
    ? (selectedCsm ? { csm_id: selectedCsm } : {})
    : { csm_id: profile?.id }

  const { data: clients = [], isLoading } = useClients(csmFilter, { enabled: !!profile })
  const { data: profiles = [] } = useProfiles()
  // Admin/manager vê todas as pendentes; CSM só as próprias
  const activitiesFilter = isAdminOrManager
    ? { }
    : { responsible_id: profile?.id }
// Filter later: exclude concluida/cancelada and apply due_date logic
  const { data: myTasksRaw = [] } = useActivities(activitiesFilter, { enabled: !!profile })
  // Excluir concluídas/canceladas
  const myTasks = myTasksRaw.filter(a => a.status !== 'concluida' && a.status !== 'cancelada')

  // Last activity date per client (for "sem interação" logic)
  // useMemo deve ficar antes de qualquer early return (Rules of Hooks)
  // Atrasadas (< hoje) primeiro, depois futuras/hoje — ambas asc por data/hora
  const upcomingActivities = useMemo(() => {
    const filtered = myTasks.filter(
      a => a.status !== 'concluida' && a.status !== 'cancelada'
    )
    const overdue = [...filtered]
      .filter(a => a.activity_date && a.activity_date < todayStr)
      .sort((a, b) => {
        if (a.activity_date !== b.activity_date) return a.activity_date.localeCompare(b.activity_date)
        return (a.activity_time || '').localeCompare(b.activity_time || '')
      })
    const future = [...filtered]
      .filter(a => a.activity_date && a.activity_date >= todayStr)
      .sort((a, b) => {
        if (a.activity_date !== b.activity_date) return a.activity_date.localeCompare(b.activity_date)
        return (a.activity_time || '').localeCompare(b.activity_time || '')
      })
    return [...overdue, ...future]
  }, [myTasks])

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

  // Overdue milestones count
  const { data: overdueCount = 0 } = useQuery({
    queryKey: ['overdue_milestones', csmFilter, clients.length],
    enabled: !!profile && clients.length > 0,
    staleTime: 2 * 60 * 1000,
    queryFn: async () => {
      const ids = clients.map(c => c.id)
      if (!ids.length) return 0
      const { count } = await supabase
        .from('milestones')
        .select('*', { count: 'exact', head: true })
        .in('client_id', ids)
        .lt('due_date', todayStr)
        .neq('status', 'done')
      return count || 0
    },
  })

  const csmList           = profiles
    .filter(p => (p.role === 'csm' || p.role === 'manager') && p.status === 'active')
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
  const selectedCsmProfile = selectedCsm ? csmList.find(p => p.id === selectedCsm) : null
  const dateStr = (() => {
    const s = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
    return s.charAt(0).toUpperCase() + s.slice(1)
  })()

  if (isLoading && !clients.length) return <PageSpinner />

  // ─── Computed ────────────────────────────────────────────────────────────
  const emRisco      = clients.filter(c => (c.health_total || 0) < 50)
  const emAtencao    = clients.filter(c => { const s = c.health_total || 0; return s >= 50 && s < 75 })
  const saudaveis    = clients.filter(c => (c.health_total || 0) >= 75)
  const semInteracao = clients.filter(c => {
    const last = lastActivityMap[c.id]
    return !last || last < ago30Str
  })
  const renovacao30  = clients.filter(c => c.contract_renewal && c.contract_renewal >= todayStr && c.contract_renewal <= in30Str)
  const mrrTotal       = clients.reduce((s, c) => s + (c.mrr || 0), 0)
  const mrrNum         = mrrTotal.toLocaleString('pt-BR', { maximumFractionDigits: 0 })
  const arrNum         = (mrrTotal * 12).toLocaleString('pt-BR', { maximumFractionDigits: 0 })
  const mrrAtrasado    = clients.filter(c => (c.delay_days || 0) > 0).reduce((s, c) => s + (c.mrr || 0), 0)
  const mrrAtrasadoNum = mrrAtrasado.toLocaleString('pt-BR', { maximumFractionDigits: 0 })

  const tasksDue     = myTasks.filter(a => a.due_date && a.due_date <= todayStr)
  const tasksToday   = tasksDue.filter(a => a.due_date === todayStr)
  const tasksOverdue = tasksDue.filter(a => a.due_date < todayStr)

  // Alertas: Em Risco primeiro (score asc), depois Em Atenção (score asc)
  const alertaClients = [
    ...clients.filter(c => (c.health_total || 0) < 50).sort((a, b) => (a.health_total || 0) - (b.health_total || 0)),
    ...clients.filter(c => { const s = c.health_total || 0; return s >= 50 && s < 75 }).sort((a, b) => (a.health_total || 0) - (b.health_total || 0)),
  ]
  const alertaTotal   = alertaClients.length
  const alertaSliced  = alertaClients.slice(0, 5)

  const sortedPortfolio = [...clients].sort((a, b) => (a.health_total || 0) - (b.health_total || 0))

  const dimHealth = DIMS.map(d => ({
    ...d,
    healthy: clients.filter(c => (c[d.key] || 0) >= 10).length,
    total: clients.length,
  }))

  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* ── PAGE HEADER ──────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#1a1a18', lineHeight: 1.1 }}>Dashboard</div>
          <div style={{ fontSize: 13, color: '#888780', marginTop: 3 }}>{dateStr}</div>
        </div>
        {isAdminOrManager && (
          <div style={{ position: 'relative', userSelect: 'none' }}>
            <div
              onClick={() => setCsmDropdownOpen(o => !o)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 14px', border: '0.5px solid #d4d3ce', borderRadius: 7, cursor: 'pointer', backgroundColor: '#fff' }}
            >
              <div style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f0efed', fontSize: 11, fontWeight: 700, color: '#173557' }}>
                {selectedCsmProfile?.avatar_url
                  ? <img src={selectedCsmProfile.avatar_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                  : initials(selectedCsmProfile?.name || 'T')}
              </div>
              <span style={{ fontSize: 13, color: '#1a1a18' }}>{selectedCsmProfile?.name || 'Todos os CSMs'}</span>
              <span style={{ fontSize: 10, color: '#888780' }}>{csmDropdownOpen ? '▲' : '▼'}</span>
            </div>
            {csmDropdownOpen && (
              <>
                <div onClick={() => setCsmDropdownOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 99 }} />
                <div style={{ position: 'absolute', top: 'calc(100% + 4px)', right: 0, minWidth: 200, backgroundColor: '#fff', border: '0.5px solid #d4d3ce', borderRadius: 7, boxShadow: '0 4px 16px rgba(0,0,0,0.10)', zIndex: 100, overflow: 'hidden' }}>
                  {[{ id: '', name: 'Todos os CSMs' }, ...csmList].map(p => (
                    <div
                      key={p.id}
                      onClick={() => { setSelectedCsm(p.id); setCsmDropdownOpen(false) }}
                      style={{
                        padding: '9px 14px', fontSize: 13, color: '#1a1a18', cursor: 'pointer',
                        backgroundColor: selectedCsm === p.id ? '#f0efed' : '#fff',
                        fontWeight: selectedCsm === p.id ? 600 : 400,
                      }}
                      onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f7f7f5'}
                      onMouseLeave={e => e.currentTarget.style.backgroundColor = selectedCsm === p.id ? '#f0efed' : '#fff'}
                    >
                      {p.name}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.6fr) minmax(0,1fr) minmax(0,1fr)', gap: 12, alignItems: 'stretch' }}>

        {/* Block 1 — user identity + pills */}
        <div style={{
          backgroundColor: '#173557', borderRadius: 12, padding: 24, minWidth: 0, height: '100%', boxSizing: 'border-box',
          display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 20,
        }}>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
            <HeroAvatar profile={profile} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12, color: '#8393A5' }}>{greeting()},</div>
              <div style={{ fontSize: 20, fontWeight: 600, color: '#fff', lineHeight: 1.2, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {profile?.name}
              </div>
              <div style={{ fontSize: 12, color: '#8393A5', marginTop: 3 }}>{phrase}</div>
            </div>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            <HeroPill label="em risco"    value={emRisco.length}      valueColor="#f09595" />
            <HeroPill label="atrasadas"   value={tasksOverdue.length} valueColor="#FAC775" />
            <HeroPill label="saudáveis"   value={saudaveis.length}    valueColor="#7fd47f" />
          </div>
        </div>

        {/* Block 2 — MRR */}
        <div style={{
          backgroundColor: '#173557', borderRadius: 12, padding: 24, minWidth: 0, height: '100%', boxSizing: 'border-box',
          display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        }}>
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#8393A5' }}>
            MRR do portfólio
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 8 }}>
            <div>
              <div>
                <span style={{ fontSize: 16, fontWeight: 600, color: '#d3da47' }}>R$ </span>
                <span style={{ fontSize: 40, fontWeight: 700, color: '#d3da47', lineHeight: 1 }}>{mrrNum}</span>
              </div>
              <div style={{ fontSize: 12, color: '#8393A5', marginTop: 8 }}>
                {clients.length} empresa{clients.length !== 1 ? 's' : ''} ativa{clients.length !== 1 ? 's' : ''}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 10, color: '#8393A5', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>ARR</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#d3da47' }}>R$ {arrNum}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 10, color: '#8393A5', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>Em Atraso</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: mrrAtrasado > 0 ? '#f09595' : '#d3da47' }}>R$ {mrrAtrasadoNum}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Block 3 — 3 quick stat cards stacked, sem wrapper */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0, height: '100%', boxSizing: 'border-box' }}>
          {[
            { label: 'Sem interação 30d',   value: semInteracao.length, color: '#FAC775' },
            { label: 'Renovações em 30d',   value: renovacao30.length,  color: '#FAC775' },
            { label: 'Milestones vencidos', value: overdueCount,        color: '#f09595' },
          ].map(({ label, value, color }) => (
            <div key={label} style={{
              backgroundColor: '#173557', borderRadius: 12, padding: '16px 20px', minWidth: 0, flex: 1,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <span style={{ fontSize: 12, color: '#8393A5' }}>{label}</span>
              <span style={{ fontSize: 20, fontWeight: 700, color }}>{value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── MÉTRICAS ─────────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 12 }}>
        <MetricCard
          label="Em Risco"
          value={emRisco.length}
          color={emRisco.length > 0 ? '#E24B4A' : undefined}
          onClick={() => navigate('/empresas')}
        />
        <MetricCard
          label="Em Atenção"
          value={emAtencao.length}
          color={emAtencao.length > 0 ? '#BA7517' : undefined}
          onClick={() => navigate('/empresas')}
        />
        <MetricCard
          label="Atividades Pendentes"
          value={myTasks.length}
          color={myTasks.length > 0 ? '#BA7517' : undefined}
          onClick={() => navigate('/atividades?status=pendente')}
        />
        <MetricCard
          label="Saudáveis"
          value={saudaveis.length}
          color={saudaveis.length > 0 ? '#1D9E75' : undefined}
          onClick={() => navigate('/empresas')}
        />
      </div>

      {/* ── ALERTAS + TAREFAS ────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr minmax(0,1fr)', gap: 12, alignItems: 'stretch' }}>

        {/* Alertas prioritários */}
        <SectionCard
          title={
            <>
              Alertas prioritários
              {alertaTotal > 5 && (
                <span style={{ fontWeight: 400, color: '#888780', marginLeft: 4 }}>
                  (5/{alertaTotal})
                </span>
              )}
            </>
          }
          action={<LinkBtn onClick={() => navigate('/empresas?health=alerta')}>ver todas as contas →</LinkBtn>}
        >
          {alertaTotal === 0 ? (
            <EmptyState text="Nenhum alerta no momento." />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {alertaSliced.map(c => {
                const score    = c.health_total || 0
                const barColor = score < 50 ? '#E24B4A' : '#EF9F27'
                const scoreColor = score < 50 ? '#E24B4A' : '#EF9F27'
                const lowDims  = DIMS.filter(d => (c[d.key] || 0) < 10)

                const lastDate  = lastActivityMap[c.id]
                const daysSince = lastDate ? Math.floor((new Date() - new Date(lastDate + 'T00:00:00')) / 86400000) : null
                const reasons   = []
                if (!lastDate) reasons.push('Sem interação registrada')
                else if (daysSince > 30) reasons.push(`Sem interação há ${daysSince} dias`)
                if ((c.delay_days || 0) > 0) reasons.push(`Fatura ${c.delay_days}d em atraso`)

                return (
                  <div
                    key={c.id}
                    onClick={() => navigate(`/empresas/${c.id}`)}
                    style={{ display: 'flex', alignItems: 'stretch', borderRadius: 8, overflow: 'hidden', cursor: 'pointer' }}
                    onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f7f7f5'}
                    onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    <div style={{ width: 3, backgroundColor: barColor, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0, padding: '8px 10px', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 13, fontWeight: 500, color: '#1a1a18', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {c.fantasy_name || c.name}
                          </span>
                          {c.abc_class && (
                            <span style={{
                              fontSize: 11, fontWeight: 600, padding: '1px 6px', borderRadius: 5,
                              backgroundColor: `${ABC_COLORS[c.abc_class] || '#888'}25`,
                              color: ABC_COLORS[c.abc_class] || '#888',
                            }}>
                              {c.abc_class}
                            </span>
                          )}
                        </div>
                        {reasons.length > 0 && (
                          <div style={{ fontSize: 12, color: '#888780', marginTop: 2 }}>{reasons.join(' · ')}</div>
                        )}
                        {lowDims.length > 0 && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 5 }}>
                            {lowDims.map(d => (
                              <span key={d.key} style={{
                                fontSize: 11, fontWeight: 500, padding: '1px 7px', borderRadius: 5,
                                backgroundColor: `${d.color}22`, color: d.color,
                              }}>
                                {d.label}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <span style={{ fontSize: 14, fontWeight: 700, color: scoreColor, flexShrink: 0, paddingTop: 1 }}>{score}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </SectionCard>

        {/* Próximas Atividades */}
        <SectionCard
          title={
            <>
              Próximas Atividades
              {upcomingActivities.length > 5 && (
                <span style={{ fontWeight: 400, color: '#888780', marginLeft: 4 }}>
                  (5/{upcomingActivities.length})
                </span>
              )}
            </>
          }
          action={<LinkBtn onClick={() => navigate('/atividades?status=pendente')}>ver todas →</LinkBtn>}
        >
          {upcomingActivities.length === 0 ? (
            <EmptyState text="Nenhuma atividade pendente." />
          ) : (
            <div>
              {upcomingActivities.slice(0, 5).map((a, i) => {
                const isOverdue = a.due_date && a.due_date < todayStr && a.status !== 'concluida' && a.status !== 'cancelada'
                const isToday   = a.due_date && a.due_date === todayStr && a.status !== 'concluida' && a.status !== 'cancelada'
                const dateLabel = isOverdue
                  ? 'atrasada'
                  : isToday
                    ? 'hoje'
                    : a.due_date
                      ? (() => { const [,m,d] = a.due_date.split('-'); return `${d}/${m}` })()
                      : a.activity_date
                        ? (() => { const [,m,d] = a.activity_date.split('-'); return `${d}/${m}` })()
                        : ''
                const badgeStyle = isOverdue
                  ? { backgroundColor: '#E24B4A20', color: '#E24B4A' }
                  : isToday
                    ? { backgroundColor: '#BA751718', color: '#BA7517' }
                    : { backgroundColor: '#59c2ed18', color: '#59c2ed' }
                return (
                  <div
                    key={a.id}
                    onClick={() => a.client_id && navigate(`/empresas/${a.client_id}?tab=atividades`)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8, padding: '8px 6px',
                      borderBottom: i < Math.min(upcomingActivities.length, 5) - 1 ? '0.5px solid #f0efed' : 'none',
                      borderRadius: 6, cursor: a.client_id ? 'pointer' : 'default', transition: 'background 0.1s',
                    }}
                    onMouseEnter={e => { if (a.client_id) e.currentTarget.style.backgroundColor = '#f7f7f5' }}
                    onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: '#1a1a18', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {a.title || a.description}
                      </div>
                      {(a.client?.fantasy_name || a.client?.name) && (
                        <div style={{ fontSize: 11, color: '#888780', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {a.client.fantasy_name || a.client.name}
                        </div>
                      )}
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 5, flexShrink: 0, ...badgeStyle }}>
                      {dateLabel}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </SectionCard>
      </div>

      {/* ── MAPA + SAÚDE ─────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr minmax(0,1fr)', gap: 12, alignItems: 'stretch' }}>

        {/* Distribuição Geográfica */}
        <SectionCard title="Distribuição Geográfica">
          <BrazilMap clients={clients} />
        </SectionCard>

        {/* Saúde do portfólio + Saúde por dimensão */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>

          <SectionCard
            title="Saúde do portfólio"
            action={<LinkBtn onClick={() => navigate('/empresas')}>ver empresas →</LinkBtn>}
          >
            {clients.length === 0 ? (
              <EmptyState text="Nenhuma empresa." />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                {sortedPortfolio.slice(0, 8).map(c => {
                  const score = c.health_total || 0
                  const color = score >= 75 ? '#1D9E75' : score >= 50 ? '#BA7517' : '#E24B4A'
                  const label = score >= 75 ? 'saudável' : score >= 50 ? 'atenção' : 'risco'
                  return (
                    <div
                      key={c.id}
                      onClick={() => navigate(`/empresas/${c.id}`)}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
                    >
                      <div style={{ width: 110, fontSize: 12, color: '#1a1a18', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0 }}>
                        {c.fantasy_name || c.name}
                      </div>
                      <div style={{ flex: 1, height: 5, backgroundColor: '#f0efed', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${Math.min(100, score)}%`, backgroundColor: color, borderRadius: 3 }} />
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 700, color, width: 24, textAlign: 'right', flexShrink: 0 }}>{score}</span>
                      <span style={{
                        fontSize: 10, fontWeight: 500, padding: '1px 6px', borderRadius: 4, flexShrink: 0,
                        backgroundColor: `${color}20`, color, minWidth: 48, textAlign: 'center',
                      }}>
                        {label}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </SectionCard>

          <SectionCard title="Saúde por dimensão">
            {clients.length === 0 ? (
              <EmptyState text="Sem dados." />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {dimHealth.map(d => {
                  const pct      = d.total > 0 ? Math.round((d.healthy / d.total) * 100) : 0
                  const majority = d.healthy >= d.total - d.healthy
                  const countText = majority
                    ? `${d.healthy}/${d.total} saudáveis`
                    : `${d.total - d.healthy}/${d.total} com alerta`
                  const DimIcon = HealthDimensionIcons[d.icon]
                  return (
                    <div key={d.key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{
                        width: 28, height: 28, borderRadius: 7, flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        backgroundColor: `${d.color}22`, fontSize: 13,
                      }}>
                        <DimIcon className="w-5 h-5" strokeWidth={1.8} />
                      </div>
                      <div style={{ fontSize: 12, color: '#4a4a46', width: 92, flexShrink: 0 }}>{d.label}</div>
                      <div style={{ flex: 1, height: 5, backgroundColor: '#f0efed', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, backgroundColor: d.color, borderRadius: 3 }} />
                      </div>
                      <span style={{
                        fontSize: 11, fontWeight: 600, flexShrink: 0, minWidth: 82, textAlign: 'right',
                        color: majority ? '#1D9E75' : '#E24B4A',
                      }}>
                        {countText}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  )
}
