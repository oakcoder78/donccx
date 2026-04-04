import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabaseClient'
import { useClients } from '../../hooks/useClients'
import { useActivities } from '../../hooks/useActivities'
import { useProfiles } from '../../hooks/useProfiles'
import { useAuth } from '../../contexts/AuthContext'
import { usePermissions } from '../../hooks/usePermissions'
import { Card } from '../ui/Card'
import { Badge } from '../ui/Badge'
import { HealthBar, HealthScore } from '../ui/HealthBar'
import { PageSpinner } from '../ui/Spinner'

// ─── Constants ───────────────────────────────────────────────────────────────
const todayStr = new Date().toISOString().slice(0, 10)
const in30Str  = (() => { const d = new Date(); d.setDate(d.getDate() + 30); return d.toISOString().slice(0, 10) })()
const ago30Str = (() => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().slice(0, 10) })()

const DIMENSIONS = [
  { key: 'health_uso',            label: 'Uso',            color: '#59c2ed', variant: 'sky'    },
  { key: 'health_suporte',        label: 'Suporte',        color: '#E24B4A', variant: 'red'    },
  { key: 'health_relacionamento', label: 'Relacionamento', color: '#534AB7', variant: 'purple' },
  { key: 'health_financeiro',     label: 'Financeiro',     color: '#BA7517', variant: 'amber'  },
  { key: 'health_projeto',        label: 'Projeto',        color: '#1D9E75', variant: 'green'  },
]

const ABC_VARIANT = { A: 'green', B: 'amber', C: 'red' }

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Bom dia'
  if (h < 18) return 'Boa tarde'
  return 'Boa noite'
}

function initials(name = '') {
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?'
}

// ─── Hero Avatar ─────────────────────────────────────────────────────────────
function HeroAvatar({ profile }) {
  if (profile?.avatar_url) {
    return (
      <img
        src={profile.avatar_url}
        alt={profile.name}
        className="w-14 h-14 rounded-full object-cover flex-shrink-0 border-2 border-white/20"
      />
    )
  }
  return (
    <div
      className="w-14 h-14 rounded-full flex items-center justify-center flex-shrink-0 text-xl font-bold border-2 border-white/20"
      style={{ backgroundColor: '#59c2ed', color: '#173557' }}
    >
      {initials(profile?.name)}
    </div>
  )
}

// ─── Pill (hero status) ───────────────────────────────────────────────────────
function HeroPill({ children, color }) {
  return (
    <span
      className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium"
      style={{ backgroundColor: `${color}25`, color }}
    >
      {children}
    </span>
  )
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({ label, value, color, onClick }) {
  return (
    <Card onClick={onClick}>
      <span className="text-xs text-text-tertiary block mb-1">{label}</span>
      <span className="text-2xl font-bold block" style={{ color: color || 'inherit' }}>{value}</span>
    </Card>
  )
}

// ─── Section title ────────────────────────────────────────────────────────────
function SectionTitle({ children, action }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h3 className="text-sm font-semibold text-text-primary">{children}</h3>
      {action}
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const navigate  = useNavigate()
  const { profile } = useAuth()
  const { canViewCSMManagement } = usePermissions()
  const isAdminOrManager = profile?.role === 'admin' || profile?.role === 'manager'

  const [selectedCsm, setSelectedCsm] = useState('')

  const csmFilter = isAdminOrManager
    ? (selectedCsm ? { csm_id: selectedCsm } : {})
    : { csm_id: profile?.id }

  const { data: clients = [], isLoading: loadingClients } = useClients(csmFilter, { enabled: !!profile })
  const { data: profiles = [] } = useProfiles()
  const { data: myTasks = [] }  = useActivities(
    { responsible_id: profile?.id, status: 'pendente' },
    { enabled: !!profile }
  )

  // Client IDs with activity in last 30d
  const { data: recentClientIds = [] } = useQuery({
    queryKey: ['recent_activity_clients', selectedCsm || 'all'],
    enabled: !!profile,
    queryFn: async () => {
      const { data } = await supabase
        .from('activities')
        .select('client_id')
        .gte('activity_date', ago30Str)
      return [...new Set((data || []).map(a => a.client_id).filter(Boolean))]
    },
    staleTime: 2 * 60 * 1000,
  })

  // Overdue milestones count
  const { data: overdueCount = 0 } = useQuery({
    queryKey: ['overdue_milestones', csmFilter, clients.length],
    enabled: !!profile && clients.length > 0,
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
    staleTime: 2 * 60 * 1000,
  })

  const csmList = profiles.filter(p => p.role === 'csm' && p.status !== 'blocked')

  if (loadingClients && !clients.length) return <PageSpinner />

  // ─── Computed ────────────────────────────────────────────────────────────
  const emRisco      = clients.filter(c => (c.health_total || 0) < 50)
  const emAtencao    = clients.filter(c => { const s = c.health_total || 0; return s >= 50 && s < 75 })
  const saudaveis    = clients.filter(c => (c.health_total || 0) >= 75)
  const semInteracao = clients.filter(c => !recentClientIds.includes(c.id))
  const renovacao30  = clients.filter(c => c.contract_renewal && c.contract_renewal >= todayStr && c.contract_renewal <= in30Str)
  const mrrTotal     = clients.reduce((s, c) => s + (c.mrr || 0), 0)

  const tasksDue   = myTasks.filter(a => a.due_date && a.due_date <= todayStr)
  const tasksToday = tasksDue.filter(a => a.due_date === todayStr)

  const alertaClients = [...clients]
    .filter(c => (c.health_total || 0) < 75)
    .sort((a, b) => (a.health_total || 0) - (b.health_total || 0))
    .slice(0, 10)

  const sortedByHealth  = [...clients].sort((a, b) => (a.health_total || 0) - (b.health_total || 0))
  const renewalsSorted  = [...renovacao30].sort((a, b) => a.contract_renewal.localeCompare(b.contract_renewal))

  const dimBreakdown = DIMENSIONS.map(d => ({
    ...d,
    count: clients.filter(c => (c[d.key] || 0) < 10).length,
  }))

  return (
    <div className="p-6 space-y-5">

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <div
        className="rounded-lg p-5"
        style={{ backgroundColor: '#173557' }}
      >
        <div className="grid grid-cols-1 md:grid-cols-[2fr_1.2fr_1fr] gap-5 items-start">

          {/* Col 1: usuário */}
          <div className="flex items-start gap-4">
            <HeroAvatar profile={profile} />
            <div className="flex-1 min-w-0">
              <p className="text-white/60 text-xs mb-0.5">{greeting()},</p>
              <p className="text-white font-semibold text-base leading-tight truncate">{profile?.name}</p>
              <p className="text-white/50 text-xs mt-0.5 capitalize">{profile?.role}</p>
              <div className="flex flex-wrap gap-1.5 mt-3">
                {emRisco.length > 0 && (
                  <HeroPill color="#E24B4A">{emRisco.length} em risco</HeroPill>
                )}
                {tasksToday.length > 0 && (
                  <HeroPill color="#BA7517">{tasksToday.length} tarefa{tasksToday.length !== 1 ? 's' : ''} hoje</HeroPill>
                )}
                {saudaveis.length > 0 && (
                  <HeroPill color="#1D9E75">{saudaveis.length} saudáve{saudaveis.length !== 1 ? 'is' : 'l'}</HeroPill>
                )}
              </div>
            </div>
          </div>

          {/* Col 2: MRR */}
          <div
            className="rounded-md p-4"
            style={{ backgroundColor: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.10)' }}
          >
            <p className="text-white/60 text-xs mb-1">MRR do portfólio</p>
            <p className="text-white text-2xl font-bold leading-none">
              {mrrTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })}
            </p>
            <p className="text-white/50 text-xs mt-2">
              {clients.length} empresa{clients.length !== 1 ? 's' : ''} ativa{clients.length !== 1 ? 's' : ''}
            </p>
          </div>

          {/* Col 3: métricas rápidas */}
          <div
            className="rounded-md divide-y"
            style={{ backgroundColor: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.10)', divideColor: 'rgba(255,255,255,0.08)' }}
          >
            <div className="px-4 py-3">
              <p className="text-white/50 text-xs">Sem interação 30d</p>
              <p className="text-white font-bold text-lg leading-tight" style={{ color: semInteracao.length > 0 ? '#E24B4A' : 'white' }}>
                {semInteracao.length}
              </p>
            </div>
            <div className="px-4 py-3" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
              <p className="text-white/50 text-xs">Renovações em 30d</p>
              <p className="font-bold text-lg leading-tight" style={{ color: renovacao30.length > 0 ? '#BA7517' : 'white' }}>
                {renovacao30.length}
              </p>
            </div>
            <div className="px-4 py-3" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
              <p className="text-white/50 text-xs">Milestones vencidos</p>
              <p className="font-bold text-lg leading-tight" style={{ color: overdueCount > 0 ? '#E24B4A' : 'white' }}>
                {overdueCount}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Seletor CSM (admin/manager) */}
      {isAdminOrManager && (
        <div className="flex items-center gap-2 justify-end">
          <span className="text-xs text-text-tertiary">Filtrar por CSM:</span>
          <select
            value={selectedCsm}
            onChange={e => setSelectedCsm(e.target.value)}
            className="input-base text-sm w-48"
          >
            <option value="">Todos os CSMs</option>
            {csmList.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* ── KPIs ─────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          label="Em Risco"
          value={emRisco.length}
          color={emRisco.length > 0 ? '#E24B4A' : undefined}
          onClick={() => navigate('/empresas')}
        />
        <KpiCard
          label="Em Atenção"
          value={emAtencao.length}
          color={emAtencao.length > 0 ? '#BA7517' : undefined}
          onClick={() => navigate('/empresas')}
        />
        <KpiCard
          label="Tarefas Vencendo Hoje"
          value={tasksToday.length}
          color={tasksToday.length > 0 ? '#BA7517' : undefined}
        />
        <KpiCard
          label="Saudáveis"
          value={saudaveis.length}
          color={saudaveis.length > 0 ? '#1D9E75' : undefined}
          onClick={() => navigate('/empresas')}
        />
      </div>

      {/* ── Principal ────────────────────────────────────────────────────── */}
      <div className="grid md:grid-cols-[1.4fr_1fr] gap-4 items-start">

        {/* Alertas prioritários */}
        <Card>
          <SectionTitle>Alertas Prioritários</SectionTitle>
          {alertaClients.length === 0 ? (
            <p className="text-sm text-text-tertiary">Nenhum alerta no momento.</p>
          ) : (
            <div className="space-y-1">
              {alertaClients.map(c => {
                const score    = c.health_total || 0
                const barColor = score < 50 ? '#E24B4A' : '#BA7517'
                const lowDims  = DIMENSIONS.filter(d => (c[d.key] || 0) < 10)

                // Reason text
                const noInteraction = !recentClientIds.includes(c.id)
                const reasons = []
                if (noInteraction) reasons.push('Sem interação recente')
                if (c.delay_days > 0) reasons.push(`${c.delay_days}d de atraso financeiro`)

                return (
                  <div
                    key={c.id}
                    onClick={() => navigate(`/empresas/${c.id}`)}
                    className="flex items-stretch gap-0 rounded-md overflow-hidden hover:bg-bg-secondary cursor-pointer transition-colors"
                  >
                    {/* Severity bar */}
                    <div className="w-1 flex-shrink-0 rounded-l-md" style={{ backgroundColor: barColor }} />

                    <div className="flex-1 min-w-0 px-3 py-2 flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-text-primary truncate">{c.name}</span>
                          {c.abc_class && (
                            <Badge variant={ABC_VARIANT[c.abc_class] || 'slate'}>{c.abc_class}</Badge>
                          )}
                        </div>
                        {reasons.length > 0 && (
                          <p className="text-xs text-text-tertiary mt-0.5">{reasons.join(' · ')}</p>
                        )}
                        {lowDims.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {lowDims.map(d => (
                              <Badge key={d.key} variant={d.variant}>{d.label}</Badge>
                            ))}
                          </div>
                        )}
                      </div>
                      <HealthScore score={score} showLabel={false} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Card>

        {/* Tarefas + Renovações empilhadas */}
        <div className="space-y-4">

          {/* Tarefas de hoje */}
          <Card>
            <SectionTitle>Tarefas de Hoje</SectionTitle>
            {tasksDue.length === 0 ? (
              <p className="text-sm text-text-tertiary">Nenhuma tarefa pendente.</p>
            ) : (
              <div className="space-y-1">
                {tasksDue.slice(0, 6).map(a => {
                  const isOverdue = a.due_date < todayStr
                  return (
                    <div key={a.id} className="flex items-start gap-2 py-1.5 border-b border-border-tertiary last:border-0">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-text-primary truncate">{a.title || a.description}</p>
                        {a.client?.name && (
                          <p className="text-xs text-text-tertiary truncate">{a.client.name}</p>
                        )}
                      </div>
                      <Badge variant={isOverdue ? 'red' : 'amber'}>
                        {isOverdue ? 'Atrasada' : 'Hoje'}
                      </Badge>
                    </div>
                  )
                })}
              </div>
            )}
          </Card>

          {/* Renovações próximas */}
          <Card>
            <SectionTitle>Renovações Próximas</SectionTitle>
            {renewalsSorted.length === 0 ? (
              <p className="text-sm text-text-tertiary">Nenhuma nos próximos 30 dias.</p>
            ) : (
              <div className="space-y-1">
                {renewalsSorted.map(c => {
                  const days = Math.ceil((new Date(c.contract_renewal) - new Date()) / 86400000)
                  return (
                    <div
                      key={c.id}
                      onClick={() => navigate(`/empresas/${c.id}`)}
                      className="flex items-center gap-2 py-1.5 border-b border-border-tertiary last:border-0 cursor-pointer hover:bg-bg-secondary -mx-1.5 px-1.5 rounded-sm transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-text-primary truncate">{c.name}</p>
                        <p className="text-xs text-text-tertiary">
                          {new Date(c.contract_renewal + 'T00:00:00').toLocaleDateString('pt-BR')}
                        </p>
                      </div>
                      <Badge variant={days < 15 ? 'red' : 'amber'}>{days}d</Badge>
                    </div>
                  )
                })}
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* ── Inferior ─────────────────────────────────────────────────────── */}
      <div className="grid md:grid-cols-2 gap-4 items-start">

        {/* Saúde do portfólio */}
        <Card>
          <SectionTitle>Saúde do Portfólio</SectionTitle>
          {clients.length === 0 ? (
            <p className="text-sm text-text-tertiary">Nenhuma empresa.</p>
          ) : (
            <div className="space-y-3">
              {sortedByHealth.slice(0, 10).map(c => {
                const score  = c.health_total || 0
                const label  = score >= 75 ? 'Saudável' : score >= 50 ? 'Atenção' : 'Risco'
                const color  = score >= 75 ? '#1D9E75' : score >= 50 ? '#BA7517' : '#E24B4A'
                const variant = score >= 75 ? 'green' : score >= 50 ? 'amber' : 'red'
                return (
                  <div
                    key={c.id}
                    onClick={() => navigate(`/empresas/${c.id}`)}
                    className="flex items-center gap-3 cursor-pointer hover:bg-bg-secondary -mx-1.5 px-1.5 py-1 rounded-md transition-colors"
                  >
                    <div className="w-32 truncate text-sm text-text-primary flex-shrink-0">{c.name}</div>
                    <div className="flex-1">
                      <HealthBar value={score} max={100} />
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <span className="text-sm font-bold" style={{ color }}>{score}</span>
                      <Badge variant={variant}>{label}</Badge>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Card>

        {/* Alertas por dimensão */}
        {isAdminOrManager && clients.length > 0 ? (
          <Card>
            <SectionTitle>Alertas por Dimensão</SectionTitle>
            <div className="space-y-3">
              {dimBreakdown.map(d => {
                const pct = clients.length > 0 ? Math.round((d.count / clients.length) * 100) : 0
                return (
                  <div key={d.key} className="flex items-center gap-3">
                    <div className="w-32 text-sm text-text-secondary flex-shrink-0">{d.label}</div>
                    <div className="flex-1 h-2 bg-bg-tertiary rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${pct}%`, backgroundColor: d.color }}
                      />
                    </div>
                    <div className="w-16 text-right flex-shrink-0">
                      <span className="text-xs text-text-tertiary">{d.count}/{clients.length}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </Card>
        ) : (
          <div />
        )}
      </div>

    </div>
  )
}
