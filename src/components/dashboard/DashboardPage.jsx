import { useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { useClients } from '../../hooks/useClients'
import { useActivities } from '../../hooks/useActivities'
import { useProfiles } from '../../hooks/useProfiles'
import { useAuth } from '../../contexts/AuthContext'
import { Card } from '../ui/Card'
import { Badge } from '../ui/Badge'
import { Avatar } from '../ui/Avatar'
import { StagePill } from '../ui/StagePill'
import { HealthScore, HealthBar } from '../ui/HealthBar'
import { PageSpinner } from '../ui/Spinner'

function KpiCard({ label, value, sub, color, onClick }) {
  return (
    <Card onClick={onClick} className="flex flex-col gap-1 cursor-pointer hover:shadow-sm transition-shadow">
      <span className="text-xs text-text-tertiary">{label}</span>
      <span className="text-2xl font-bold" style={{ color }}>{value}</span>
      {sub && <span className="text-xs text-text-tertiary">{sub}</span>}
    </Card>
  )
}

function activityTypeIcon(type) {
  const icons = { reuniao: '📅', ligacao: '📞', email: '📧', whatsapp: '💬', tarefa: '✅', nota: '📝' }
  return icons[type] || '📌'
}

function formatDate(d) {
  if (!d) return ''
  return new Date(d).toLocaleDateString('pt-BR')
}

function daysUntil(dateStr) {
  if (!dateStr) return null
  return Math.ceil((new Date(dateStr) - new Date()) / 86400000)
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const isAdminOrManager = profile?.role === 'admin' || profile?.role === 'manager'

  const clientFilters = isAdminOrManager ? {} : { csm_id: profile?.id }
  const { data: clients = [], isLoading: loadingClients } = useClients(clientFilters, { enabled: !!profile })
  const { data: activities = [], isLoading: loadingActivities } = useActivities(
    isAdminOrManager ? { status: 'pendente' } : { responsible_id: profile?.id, status: 'pendente' },
    { enabled: !!profile }
  )
  const { data: profiles = [] } = useProfiles()

  const [showAnyway, setShowAnyway] = useState(false)
  useEffect(() => {
    if (!loadingClients && !loadingActivities) return
    const t = setTimeout(() => setShowAnyway(true), 3000)
    return () => clearTimeout(t)
  }, [loadingClients, loadingActivities])

  if ((loadingClients || loadingActivities) && !showAnyway) return <PageSpinner />

  const today = new Date()
  const in30 = new Date(); in30.setDate(in30.getDate() + 30)

  const onboarding = clients.filter(c => c.stage?.name === 'Onboarding')
  const producao = clients.filter(c => c.stage?.name === 'Produção')
  const atrasados = clients.filter(c => c.delay_days > 0)
  const renovacao30 = clients.filter(c => {
    if (!c.contract_renewal) return false
    const d = new Date(c.contract_renewal)
    return d >= today && d <= in30
  })

  const saudaveis = clients.filter(c => c.health_total >= 75)
  const atencao = clients.filter(c => c.health_total >= 50 && c.health_total < 75)
  const emRisco = clients.filter(c => c.health_total < 50)
  const mrrTotal = clients.reduce((s, c) => s + (c.mrr || 0), 0)

  const sorted = [...clients].sort((a, b) => (a.health_total || 0) - (b.health_total || 0))

  const alertas = [
    ...emRisco.map(c => ({ client: c, type: 'risco', msg: `Health Score ${c.health_total}` })),
    ...atrasados.map(c => ({ client: c, type: 'atraso', msg: `Fatura ${c.delay_days}d em atraso` })),
    ...renovacao30.map(c => ({ client: c, type: 'renovacao', msg: `Renova em ${daysUntil(c.contract_renewal)}d` })),
  ].slice(0, 10)

  const previstas = [...activities]
    .filter(a => a.status === 'pendente')
    .sort((a, b) => a.activity_date?.localeCompare(b.activity_date))
    .slice(0, 5)

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-text-primary">Dashboard</h1>
        <p className="text-sm text-text-tertiary mt-0.5">Visão geral da sua carteira</p>
      </div>

      {/* KPIs row 1 */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KpiCard label="Total Clientes" value={clients.length} onClick={() => navigate('/clientes')} />
        <KpiCard label="Onboarding" value={onboarding.length} color="#59c2ed" onClick={() => navigate('/clientes?filter=onboarding')} />
        <KpiCard label="Em Produção" value={producao.length} color="#1D9E75" onClick={() => navigate('/clientes?filter=producao')} />
        <KpiCard label="Fatura em Atraso" value={atrasados.length} color="#E24B4A" onClick={() => navigate('/clientes?filter=atraso')} />
        <KpiCard label="Renovação 30d" value={renovacao30.length} color="#BA7517" onClick={() => navigate('/clientes?filter=renovacao')} />
      </div>

      {/* KPIs row 2 */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KpiCard label="Saudáveis" value={saudaveis.length} color="#1D9E75" onClick={() => navigate('/clientes?filter=saudavel')} />
        <KpiCard label="Atenção" value={atencao.length} color="#BA7517" onClick={() => navigate('/clientes?filter=atencao')} />
        <KpiCard label="Em Risco" value={emRisco.length} color="#E24B4A" onClick={() => navigate('/clientes?filter=risco')} />
        <KpiCard label="Total Contatos" value={0} onClick={() => navigate('/contatos')} />
        <Card className="flex flex-col gap-1 bg-donc-navy border-donc-navy">
          <span className="text-xs text-white/60">MRR Total</span>
          <span className="text-2xl font-bold text-donc-lime">
            {mrrTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })}
          </span>
        </Card>
      </div>

      {/* Alertas + Atividades previstas */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <h3 className="text-sm font-semibold text-text-primary mb-3">Alertas Ativos</h3>
          {alertas.length === 0 ? (
            <p className="text-sm text-text-tertiary">Nenhum alerta no momento.</p>
          ) : (
            <div className="space-y-2">
              {alertas.map((a, i) => (
                <div key={i}
                  className="flex items-center gap-3 p-2 rounded-md hover:bg-bg-secondary cursor-pointer transition-colors"
                  onClick={() => navigate(`/clientes/${a.client.id}`)}
                >
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${a.type === 'risco' ? 'bg-donc-red' : a.type === 'atraso' ? 'bg-donc-amber' : 'bg-donc-purple'}`} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-text-primary truncate">{a.client.name}</div>
                    <div className="text-xs text-text-tertiary">{a.msg}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-text-primary">Atividades Previstas</h3>
            <button onClick={() => navigate('/atividades')} className="text-xs text-donc-sky hover:underline">Ver todas</button>
          </div>
          {previstas.length === 0 ? (
            <p className="text-sm text-text-tertiary">Nenhuma atividade prevista.</p>
          ) : (
            <div className="space-y-2">
              {previstas.map(a => (
                <div key={a.id} className="flex items-start gap-2 p-2 rounded-md hover:bg-bg-secondary cursor-pointer transition-colors">
                  <span className="text-base">{activityTypeIcon(a.type)}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-text-primary truncate">{a.title || a.description}</div>
                    <div className="text-xs text-text-tertiary">{a.client?.name} · {formatDate(a.activity_date)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Health Score list */}
      <Card>
        <h3 className="text-sm font-semibold text-text-primary mb-4">Clientes por Health Score</h3>
        <div className="space-y-3">
          {sorted.slice(0, 8).map(c => (
            <div key={c.id}
              className="flex items-center gap-4 cursor-pointer hover:bg-bg-secondary p-2 rounded-md transition-colors"
              onClick={() => navigate(`/clientes/${c.id}`)}
            >
              <div className="w-40 truncate text-sm font-medium text-text-primary">{c.name}</div>
              <StagePill name={c.stage?.name || '—'} color={c.stage?.color} />
              <div className="flex-1">
                <HealthBar value={c.health_total || 0} max={100} />
              </div>
              <HealthScore score={c.health_total || 0} />
            </div>
          ))}
        </div>
      </Card>

      {/* CSM Management */}
      {isAdminOrManager && (
        <Card>
          <h3 className="text-sm font-semibold text-text-primary mb-4">Gestão de CSMs</h3>
          <div className="grid md:grid-cols-3 gap-3">
            {profiles.filter(p => p.role === 'csm' && p.status === 'active').map(p => {
              const cart = clients.filter(c => c.csm_id === p.id)
              const cartRisco = cart.filter(c => c.health_total < 50)
              return (
                <div key={p.id} className="border border-border-tertiary rounded-md p-3 flex items-center gap-3">
                  <Avatar name={p.name} size="md" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-text-primary truncate">{p.name}</div>
                    <div className="text-xs text-text-tertiary">{cart.length} clientes · {cartRisco.length} em risco</div>
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
