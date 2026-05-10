import { useState, useMemo } from 'react'
import { useActivities } from '../../hooks/useActivities'
import { useClients } from '../../hooks/useClients'
import { useProfiles } from '../../hooks/useProfiles'
import { PageHeader } from '../ui/PageHeader'
import { Button } from '../ui/Button'
import { Badge } from '../ui/Badge'
import { PageSpinner } from '../ui/Spinner'
import { ActivityModal } from './ActivityModal'
import { ActivityDetailModal } from './ActivityDetailModal'
import { ActivityIcons, ActivityIconBackgrounds, DefaultActivityIcon, ActionIcons } from "../../lib/icons";

function getLocalDateString() {
  return new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000)
    .toISOString().split('T')[0]
}

// Vercel build trigger
const TABS = [
  { key: 'all', label: 'Todas' },
  { key: 'reuniao', label: 'Reuniões' },
  { key: 'email', label: 'E-mails' },
  { key: 'ligacao', label: 'Ligações' },
  { key: 'tarefa', label: 'Tarefas' },
  { key: 'nota', label: 'Notas' },
  { key: 'whatsapp', label: 'WhatsApp' },
  { key: 'relatorio', label: 'Relatórios' },
]



function groupByMonth(activities) {
  const groups = {}
  activities.forEach(a => {
    const key = a.activity_date?.slice(0, 7) || 'Sem data'
    if (!groups[key]) groups[key] = []
    groups[key].push(a)
  })
  return Object.entries(groups).sort(([a],[b]) => b.localeCompare(a))
}

function formatMonth(key) {
  if (!key || key === 'Sem data') return key
  const [y, m] = key.split('-')
  return new Date(Number(y), Number(m)-1)
    .toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
}

export default function ActivitiesPage() {
  const [tab, setTab] = useState('all')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState([])
  const [clientFilter, setClientFilter] = useState('')
  const [respFilter, setRespFilter] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [selected, setSelected] = useState(null)
  const [showStatusDD, setShowStatusDD] = useState(false)

  const { data: activities = [], isLoading } = useActivities()
  const { data: clients = [] } = useClients()
  const { data: profiles = [] } = useProfiles()

  const filtered = useMemo(() => {
    let list = activities

    if (tab !== 'all') {
      list = list.filter(a => a.type === tab)
    }

    if (search) {
      list = list.filter(a =>
        (a.description || '').toLowerCase().includes(search.toLowerCase()) ||
        (a.title || '').toLowerCase().includes(search.toLowerCase())
      )
    }

    if (statusFilter.length) {
      const today = getLocalDateString()

      list = list.filter(a => {
        if (
          statusFilter.includes('pendentes') &&
          a.status === 'pendente' &&
          (!a.due_date || a.due_date >= today)
        ) return true

        if (
          statusFilter.includes('concluidas') &&
          a.status === 'concluida'
        ) return true

        if (
          statusFilter.includes('atrasadas') &&
          a.status === 'pendente' &&
          a.due_date &&
          a.due_date < today
        ) return true

        return false
      })
    }

    if (clientFilter) {
      list = list.filter(a =>
        String(a.client_id) === clientFilter
      )
    }

    if (respFilter) {
      list = list.filter(a =>
        a.responsible_id === respFilter
      )
    }

    return list

  }, [
    activities,
    tab,
    search,
    statusFilter,
    clientFilter,
    respFilter
  ])

  const pending = filtered
    .filter(a => a.status === 'pendente')
    .sort((a,b) =>
      a.activity_date?.localeCompare(b.activity_date)
    )

  const done = filtered
    .filter(a => a.status === 'concluida')

  const doneGroups = groupByMonth(done)

  function toggleStatus(s) {
    setStatusFilter(prev =>
      prev.includes(s)
        ? prev.filter(x => x !== s)
        : [...prev, s]
    )
  }

  return (
    <div className="p-6">

      <PageHeader
        title="Atividades"
        subtitle={`${activities.length} atividades`}
        action={
          <Button onClick={() => setShowCreate(true)}>
            + Nova Atividade
          </Button>
        }
      />

      <div className="relative max-w-sm mb-4">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar atividades..."
          className="w-full pl-3 pr-10 py-2 border border-border-secondary rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-donc-sky/40 focus:border-donc-sky bg-bg-primary"
        />

        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary pointer-events-none">
          <ActionIcons.search className="w-4 h-4" />
        </span>
      </div>

      <div className="flex gap-0 border-b-2 border-border-tertiary mb-4 overflow-x-auto">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-0.5 ${
              tab === t.key
                ? 'text-donc-hubspot border-donc-hubspot'
                : 'text-text-tertiary border-transparent hover:text-text-primary'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <span className="text-xs text-text-tertiary">
          Filtrar por:
        </span>

        <select
          value={clientFilter}
          onChange={e => setClientFilter(e.target.value)}
          className="px-3 py-1.5 text-xs border border-border-secondary rounded-md bg-bg-primary hover:border-text-tertiary transition-colors"
        >
          <option value="">
            Todos os clientes
          </option>

          {clients.map(c => (
            <option key={c.id} value={c.id}>
              {c.fantasy_name || c.name}
            </option>
          ))}
        </select>

        <select
          value={respFilter}
          onChange={e => setRespFilter(e.target.value)}
          className="px-3 py-1.5 text-xs border border-border-secondary rounded-md bg-bg-primary hover:border-text-tertiary transition-colors"
        >
          <option value="">
            Todos os responsáveis
          </option>

          {profiles.map(p => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>

      </div>

      {isLoading ? (
        <PageSpinner />
      ) : (
        <div className="space-y-6">

          {pending.length > 0 && (
            <div>

              <h3 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-3">
                Previstas ({pending.length})
              </h3>

              <div className="space-y-2">
                {pending.map(a => (
                  <ActivityItem
                    key={a.id}
                    activity={a}
                    onClick={() => setSelected(a)}
                  />
                ))}
              </div>

            </div>
          )}

          {doneGroups.map(([month, acts]) => (
            <div key={month}>

              <h3 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-3">
                {formatMonth(month)}
              </h3>

              <div className="space-y-2">
                {acts.map(a => (
                  <ActivityItem
                    key={a.id}
                    activity={a}
                    onClick={() => setSelected(a)}
                  />
                ))}
              </div>

            </div>
          ))}

        </div>
      )}

      {showCreate && (
        <ActivityModal
          onClose={() => setShowCreate(false)}
        />
      )}

      {selected && (
        <ActivityDetailModal
          activity={selected}
          onClose={() => setSelected(null)}
        />
      )}

    </div>
  )
}

function ActivityItem({ activity: a, onClick }) {

  const today = getLocalDateString()

  const isOverdue =
    a.due_date &&
    a.status !== 'concluida' &&
    a.due_date < today

  const Icon = ActivityIcons[a.type] || DefaultActivityIcon

  return (
    <div
      onClick={onClick}
      className="flex items-start gap-3 p-3 bg-bg-primary border border-border-tertiary rounded-lg hover:border-border-secondary cursor-pointer transition-colors"
    >

      <div
        className="w-8 h-8 rounded-md flex items-center justify-center text-base flex-shrink-0 mt-0.5"
        style={{ backgroundColor: ActivityIconBackgrounds[a.type] }}
      >

        <Icon
          className="w-5 h-5 text-text-secondary"
          strokeWidth={1.8}
        />

      </div>

      <div className="flex-1 min-w-0">

        <p className="text-sm font-medium text-text-primary">
          {a.title || a.description}
        </p>

        <p className="text-xs text-text-tertiary truncate">
          {a.type} ·
          <span className="font-semibold text-donc-sky">
            {a.client?.fantasy_name || a.client?.name}
          </span>
          · {a.activity_date} · {a.responsible?.name}
        </p>

      </div>

      <div className="flex flex-col items-end gap-1 flex-shrink-0">

        <Badge
          variant={
            a.status === 'concluida'
              ? 'green'
              : isOverdue
              ? 'red'
              : 'amber'
          }
        >
          {a.status === 'concluida'
            ? 'Concluída'
            : isOverdue
            ? 'Atrasada'
            : 'Pendente'}
        </Badge>

        {a.activity_attachments?.length > 0 && (
          <span className="text-xs text-text-tertiary flex items-center gap-0.5">
            <ActionIcons.attachment className="w-3 h-3" /> {a.activity_attachments.length}
          </span>
        )}

      </div>

    </div>
  )
}