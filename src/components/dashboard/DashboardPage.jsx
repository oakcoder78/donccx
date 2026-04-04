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
  { key: 'health_uso',            label: 'Uso',            variant: 'sky',    color: '#59c2ed' },
  { key: 'health_suporte',        label: 'Suporte',        variant: 'red',    color: '#E24B4A' },
  { key: 'health_relacionamento', label: 'Relacionamento', variant: 'purple', color: '#9B59B6' },
  { key: 'health_financeiro',     label: 'Financeiro',     variant: 'amber',  color: '#BA7517' },
  { key: 'health_projeto',        label: 'Projeto',        variant: 'green',  color: '#1D9E75' },
]

const ABC_VARIANT = { A: 'green', B: 'amber', C: 'red' }

// ─── Sub-components ──────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, color, onClick }) {
  return (
    <Card onClick={onClick}>
      <span className="text-xs text-text-tertiary block mb-1">{label}</span>
      <span className="text-2xl font-bold block" style={{ color: color || 'inherit' }}>{value}</span>
      {sub && <span className="text-xs text-text-tertiary mt-0.5 block">{sub}</span>}
    </Card>
  )
}

function SectionTitle({ children }) {
  return <h3 className="text-sm font-semibold text-text-primary mb-3">{children}</h3>
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const navigate  = useNavigate()
  const { profile } = useAuth()
  const { canViewCSMManagement } = usePermissions()
  const isAdminOrManager = profile?.role === 'admin' || profile?.role === 'manager'

  const [selectedCsm, setSelectedCsm] = useState('')

  // Client filter
  const csmFilter = isAdminOrManager
    ? (selectedCsm ? { csm_id: selectedCsm } : {})
    : { csm_id: profile?.id }

  const { data: clients = [], isLoading: loadingClients } = useClients(csmFilter, { enabled: !!profile })
  const { data: profiles = [] }  = useProfiles()

  // My pending tasks (always current user)
  const { data: myTasks = [] } = useActivities(
    { responsible_id: profile?.id, status: 'pendente' },
    { enabled: !!profile }
  )

  // Client IDs with activity in last 30d (for "sem interação")
  const { data: recentClientIds = [] } = useQuery({
    queryKey: ['recent_activity_clients', csmFilter],
    enabled: !!profile,
    queryFn: async () => {
      const { data } = await supabase
        .from('activities')
        .select('client_id')
        .gte('activity_date', ago30Str)
      return [...new Set((data || []).map(a => a.client_id).filter(Boolean))]
    },
  })

  const csmList = profiles.filter(p => p.role === 'csm' && p.status !== 'blocked')

  if (loadingClients && !clients.length) return <PageSpinner />

  // ─── Computed ────────────────────────────────────────────────────────────
  const emRisco      = clients.filter(c => (c.health_total || 0) < 50)
  const emAtencao    = clients.filter(c => { const s = c.health_total || 0; return s >= 50 && s < 75 })
  const renovacao30  = clients.filter(c => c.contract_renewal && c.contract_renewal >= todayStr && c.contract_renewal <= in30Str)
  const semInteracao = clients.filter(c => !recentClientIds.includes(c.id))
  const mrrTotal     = clients.reduce((s, c) => s + (c.mrr || 0), 0)

  // Tasks due today or overdue
  const tasksDue     = myTasks.filter(a => a.due_date && a.due_date <= todayStr)
  const tasksToday   = tasksDue.filter(a => a.due_date === todayStr)

  // Alert clients: health < 75 sorted ascending
  const alertaClients = [...clients]
    .filter(c => (c.health_total || 0) < 75)
    .sort((a, b) => (a.health_total || 0) - (b.health_total || 0))
    .slice(0, 10)

  // Health portfolio sorted
  const sortedByHealth = [...clients].sort((a, b) => (a.health_total || 0) - (b.health_total || 0))

  // Renewals sorted by date
  const renewalsSorted = [...renovacao30].sort((a, b) => a.contract_renewal.localeCompare(b.contract_renewal))

  // Dimension breakdown
  const dimBreakdown = DIMENSIONS.map(d => ({
    ...d,
    count: clients.filter(c => (c[d.key] || 0) < 10).length,
  }))

  return (
    <div className="p-6 space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-text-primary">Dashboard</h1>
          <p className="text-sm text-text-tertiary mt-0.5">
            {isAdminOrManager ? 'Visão global da carteira' : 'Sua carteira de clientes'}
          </p>
        </div>
        {isAdminOrManager && (
          <select
            value={selectedCsm}
            onChange={e => setSelectedCsm(e.target.value)}
            className="input-base text-sm w-48 flex-shrink-0"
          >
            <option value="">Todos os CSMs</option>
            {csmList.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        )}
      </div>

      {/* Bloco 1 — KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          label="Total de Empresas"
          value={clients.length}
          onClick={() => navigate('/empresas')}
        />
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
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <KpiCard
          label="Sem Interação 30d"
          value={semInteracao.length}
          color={semInteracao.length > 0 ? '#E24B4A' : undefined}
        />
        <KpiCard
          label="Renovações em 30d"
          value={renovacao30.length}
          color={renovacao30.length > 0 ? '#BA7517' : undefined}
        />
        <Card>
          <span className="text-xs text-text-tertiary block mb-1">MRR do Portfólio</span>
          <span className="text-2xl font-bold text-donc-navy block">
            {mrrTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })}
          </span>
        </Card>
      </div>

      {/* Bloco 2 + 3 — Alertas e Tarefas */}
      <div className="grid md:grid-cols-2 gap-4">

        {/* Bloco 2 — Alertas prioritários */}
        <Card>
          <SectionTitle>Alertas Prioritários</SectionTitle>
          {alertaClients.length === 0 ? (
            <p className="text-sm text-text-tertiary">Nenhum alerta no momento.</p>
          ) : (
            <div className="space-y-1">
              {alertaClients.map(c => {
                const lowDims = DIMENSIONS.filter(d => (c[d.key] || 0) < 10)
                return (
                  <div
                    key={c.id}
                    onClick={() => navigate(`/empresas/${c.id}`)}
                    className="flex items-start gap-3 p-2 rounded-md hover:bg-bg-secondary cursor-pointer transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-text-primary truncate">{c.name}</span>
                        {c.abc_class && (
                          <Badge variant={ABC_VARIANT[c.abc_class] || 'slate'}>{c.abc_class}</Badge>
                        )}
                      </div>
                      {lowDims.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {lowDims.map(d => (
                            <Badge key={d.key} variant={d.variant}>{d.label}</Badge>
                          ))}
                        </div>
                      )}
                    </div>
                    <HealthScore score={c.health_total || 0} showLabel={false} />
                  </div>
                )
              })}
            </div>
          )}
        </Card>

        {/* Bloco 3 — Tarefas de hoje */}
        <Card>
          <SectionTitle>Tarefas de Hoje</SectionTitle>
          {tasksDue.length === 0 ? (
            <p className="text-sm text-text-tertiary">Nenhuma tarefa pendente para hoje.</p>
          ) : (
            <div className="space-y-1">
              {tasksDue.slice(0, 8).map(a => {
                const isOverdue = a.due_date < todayStr
                return (
                  <div key={a.id} className="flex items-start gap-2 p-2 rounded-md hover:bg-bg-secondary transition-colors">
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
      </div>

      {/* Bloco 4 + 5 — Saúde e Renovações */}
      <div className="grid md:grid-cols-2 gap-4">

        {/* Bloco 4 — Saúde do portfólio */}
        <Card>
          <SectionTitle>Saúde do Portfólio</SectionTitle>
          {clients.length === 0 ? (
            <p className="text-sm text-text-tertiary">Nenhuma empresa.</p>
          ) : (
            <div className="space-y-3">
              {sortedByHealth.slice(0, 8).map(c => (
                <div
                  key={c.id}
                  onClick={() => navigate(`/empresas/${c.id}`)}
                  className="flex items-center gap-3 cursor-pointer hover:bg-bg-secondary -mx-1.5 px-1.5 py-1 rounded-md transition-colors"
                >
                  <div className="w-36 truncate text-sm text-text-primary flex-shrink-0">{c.name}</div>
                  <div className="flex-1">
                    <HealthBar value={c.health_total || 0} max={100} />
                  </div>
                  <HealthScore score={c.health_total || 0} showLabel={false} />
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Bloco 5 — Renovações próximas */}
        <Card>
          <SectionTitle>Renovações Próximas</SectionTitle>
          {renewalsSorted.length === 0 ? (
            <p className="text-sm text-text-tertiary">Nenhuma renovação nos próximos 30 dias.</p>
          ) : (
            <div className="space-y-1">
              {renewalsSorted.map(c => {
                const days = Math.ceil((new Date(c.contract_renewal) - new Date()) / 86400000)
                return (
                  <div
                    key={c.id}
                    onClick={() => navigate(`/empresas/${c.id}`)}
                    className="flex items-center gap-3 p-2 rounded-md hover:bg-bg-secondary cursor-pointer transition-colors"
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

      {/* Bloco 6 — Alertas por dimensão (admin/manager) */}
      {isAdminOrManager && clients.length > 0 && (
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
                  <div className="w-24 text-right flex-shrink-0">
                    <span className="text-xs text-text-tertiary">
                      {d.count}/{clients.length} empresa{d.count !== 1 ? 's' : ''}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      )}

    </div>
  )
}
