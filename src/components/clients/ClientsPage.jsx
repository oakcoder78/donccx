import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useClients } from '../../hooks/useClients'
import { useAuth } from '../../contexts/AuthContext'
import { PageHeader } from '../ui/PageHeader'
import { Button } from '../ui/Button'
import { Badge } from '../ui/Badge'
import { StagePill } from '../ui/StagePill'
import { HealthBar, HealthScore } from '../ui/HealthBar'
import { Avatar } from '../ui/Avatar'
import { PageSpinner } from '../ui/Spinner'
import { ClientForm } from './ClientForm'

const CHIPS = [
  { key: 'todos', label: 'Todos' },
  { key: 'onboarding', label: 'Onboarding' },
  { key: 'producao', label: 'Em Produção' },
  { key: 'risco', label: 'Em Risco' },
  { key: 'saudavel', label: 'Saudáveis' },
  { key: 'atencao', label: 'Atenção' },
  { key: 'atraso', label: 'Fatura em Atraso' },
  { key: 'renovacao', label: 'Renovação 30d' },
]

function applyFilter(clients, filter) {
  if (!filter || filter === 'todos') return clients
  const today = new Date()
  const in30 = new Date(); in30.setDate(today.getDate() + 30)
  return clients.filter(c => {
    if (filter === 'onboarding') return c.stage?.name === 'Onboarding'
    if (filter === 'producao') return c.stage?.name === 'Produção'
    if (filter === 'risco') return (c.health_total || 0) < 50
    if (filter === 'saudavel') return (c.health_total || 0) >= 75
    if (filter === 'atencao') return (c.health_total || 0) >= 50 && (c.health_total || 0) < 75
    if (filter === 'atraso') return c.delay_days > 0
    if (filter === 'renovacao') {
      if (!c.contract_renewal) return false
      const d = new Date(c.contract_renewal)
      return d >= today && d <= in30
    }
    return true
  })
}

function abcVariant(abc) {
  if (abc === 'A') return 'green'
  if (abc === 'B') return 'sky'
  return 'slate'
}

export default function ClientsPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { profile } = useAuth()
  const isAdminOrManager = profile?.role === 'admin' || profile?.role === 'manager'

  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState(searchParams.get('filter') || 'todos')
  const [showForm, setShowForm] = useState(false)

  useEffect(() => {
    const f = searchParams.get('filter')
    if (f) setFilter(f)
  }, [searchParams])

  const clientFilters = isAdminOrManager ? { search } : { csm_id: profile?.id, search }
  const { data: clients = [], isLoading } = useClients(clientFilters)

  const filtered = applyFilter(clients, filter)

  return (
    <div className="p-6">
      <PageHeader
        title="Clientes"
        subtitle={`${clients.length} clientes`}
        action={<Button onClick={() => setShowForm(true)}>+ Novo Cliente</Button>}
      />

      {/* Search */}
      <div className="mb-3">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar cliente..."
          className="w-full max-w-xs px-3 py-2 border border-border-secondary rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-donc-sky/40 focus:border-donc-sky bg-bg-primary"
        />
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap gap-2 mb-5">
        {CHIPS.map(chip => (
          <button
            key={chip.key}
            onClick={() => setFilter(chip.key)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${
              filter === chip.key
                ? 'bg-donc-navy text-white border-donc-navy'
                : 'bg-bg-primary text-text-secondary border-border-secondary hover:border-donc-navy/40'
            }`}
          >
            {chip.label}
          </button>
        ))}
      </div>

      {isLoading ? <PageSpinner /> : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
          {filtered.map(c => (
            <ClientCard key={c.id} client={c} onClick={() => navigate(`/clientes/${c.id}`)} />
          ))}
          {filtered.length === 0 && (
            <div className="col-span-3 text-center py-16 text-text-tertiary">Nenhum cliente encontrado.</div>
          )}
        </div>
      )}

      {showForm && (
        <ClientForm onClose={() => setShowForm(false)} />
      )}
    </div>
  )
}

function ClientCard({ client: c, onClick }) {
  const dims = [
    { label: 'Uso', val: c.health_uso },
    { label: 'Sup.', val: c.health_suporte },
    { label: 'Rel.', val: c.health_relacionamento },
    { label: 'Fin.', val: c.health_financeiro },
    { label: 'Proj.', val: c.health_projeto },
  ]

  return (
    <div
      onClick={onClick}
      className="bg-bg-primary border border-border-tertiary rounded-lg p-4 cursor-pointer hover:border-border-secondary hover:shadow-sm transition-all"
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-text-primary truncate">{c.name}</h3>
          {c.segment && <p className="text-xs text-text-tertiary">{c.segment}</p>}
        </div>
        {c.stage && <StagePill name={c.stage.name} color={c.stage.color} />}
      </div>

      <div className="flex items-center gap-2 flex-wrap mb-3">
        {c.abc_class && <Badge variant={abcVariant(c.abc_class)}>ABC {c.abc_class}</Badge>}
        <HealthScore score={c.health_total || 0} />
        {c.mrr > 0 && (
          <span className="text-xs text-text-tertiary">
            {c.mrr.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })}
          </span>
        )}
      </div>

      {/* 5 health bars */}
      <div className="grid grid-cols-5 gap-1 mb-3">
        {dims.map(d => (
          <div key={d.label}>
            <div className="text-[10px] text-text-tertiary mb-0.5 text-center">{d.label}</div>
            <HealthBar value={d.val || 0} max={20} />
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2">
        {c.csm && (
          <div className="flex items-center gap-1">
            <Avatar name={c.csm.name} size="sm" />
            <span className="text-xs text-text-tertiary truncate max-w-[100px]">{c.csm.name}</span>
          </div>
        )}
      </div>
    </div>
  )
}
