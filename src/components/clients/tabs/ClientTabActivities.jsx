import { useState, useMemo } from 'react'
import { Icons } from "../../../lib/icons"

const ACTIVITY_ICONS = {
  reuniao: Icons.Calendar,
  ligacao: Icons.Phone,
  email: Icons.Mail,
  whatsapp: Icons.MessageCircle,
  tarefa: Icons.CheckSquare,
  nota: Icons.FileText,
  relatorio: Icons.FileText,
}
const ACTIVITY_BG = {
  reuniao: '#E6F1FB',
  ligacao: '#FAEEDA',
  email: '#EAF3DE',
  whatsapp: '#E6F9EC',
  tarefa: '#EEEDFE',
  nota: '#F5F5F3',
  relatorio: '#E8EEF7',
}

import { useActivities } from '../../../hooks/useActivities'
import { useAuth } from '../../../contexts/AuthContext'
import { Badge } from '../../ui/Badge'
import { Button } from '../../ui/Button'
import { ActivityModal } from '../../activities/ActivityModal'
import { ActivityDetailModal } from '../../activities/ActivityDetailModal'
import { PageSpinner } from '../../ui/Spinner'


function formatDate(d) {
  if (!d) return '—'
  return new Date(d + 'T00:00:00').toLocaleDateString('pt-BR')
}

const ACTIVITY_TYPES = [
  { value: '', label: 'Todos os tipos' },
  { value: 'reuniao', label: 'Reunião' },
  { value: 'ligacao', label: 'Ligação' },
  { value: 'email', label: 'E-mail' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'tarefa', label: 'Tarefa' },
  { value: 'nota', label: 'Nota' },
  { value: 'relatorio', label: 'Relatório' },
]

const MONTHS = (() => {
  const months = []
  const now = new Date()
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const value = d.toISOString().slice(0, 7)
    const label = d.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })
    months.push({ value, label: label.charAt(0).toUpperCase() + label.slice(1) })
  }
  return months
})()

const currentMonth = new Date().toISOString().slice(0, 7)

export function ClientTabActivities({ client }) {
  const { profile } = useAuth()
  const [showCreate, setShowCreate] = useState(false)
  const [selected, setSelected] = useState(null)

  const [filterType, setFilterType] = useState('')
  const [filterMonth, setFilterMonth] = useState(currentMonth)
  const [filterContact, setFilterContact] = useState('')
  const [filterMyActivities, setFilterMyActivities] = useState(false)

  const {
    data: activities = [],
    isLoading
  } = useActivities({ client_id: client.id })

  const contacts = useMemo(() => {
    return (client.contact_links || []).map(cl => ({
      id: cl.contact_id,
      name: cl.contacts?.name || 'Sem nome',
      cargo: cl.contacts?.cargo || '',
    })).sort((a, b) => a.name.localeCompare(b.name))
  }, [client.contact_links])

  const filteredActivities = useMemo(() => {
    return activities.filter(a => {
      if (filterType && a.type !== filterType) return false
      if (filterMonth) {
        const activityMonth = a.activity_date?.slice(0, 7)
        if (activityMonth !== filterMonth) return false
      }
      if (filterContact && a.contact_id !== Number(filterContact)) return false
      if (filterMyActivities && a.responsible_id !== profile?.id) return false
      return true
    })
  }, [activities, filterType, filterMonth, filterContact, filterMyActivities, profile?.id])

  const hasFilters = filterType || filterMonth || filterContact || filterMyActivities

  if (isLoading) return <PageSpinner />

  return (

    <div>

      <div className="flex flex-col gap-3 mb-4">
        <div className="flex items-center justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={filterType}
              onChange={e => setFilterType(e.target.value)}
              className="text-xs border border-border-tertiary rounded-md px-2 py-1.5 bg-bg-primary text-text-primary focus:outline-none focus:border-border-secondary"
            >
              {ACTIVITY_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>

            <select
              value={filterMonth}
              onChange={e => setFilterMonth(e.target.value)}
              className="text-xs border border-border-tertiary rounded-md px-2 py-1.5 bg-bg-primary text-text-primary focus:outline-none focus:border-border-secondary"
            >
              <option value="">Todos os meses</option>
              {MONTHS.map(m => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>

            <select
              value={filterContact}
              onChange={e => setFilterContact(e.target.value)}
              className="text-xs border border-border-tertiary rounded-md px-2 py-1.5 bg-bg-primary text-text-primary focus:outline-none focus:border-border-secondary"
            >
              <option value="">Todos os contatos</option>
              {contacts.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>

            <label className="flex items-center gap-1.5 text-xs text-text-secondary cursor-pointer">
              <input
                type="checkbox"
                checked={filterMyActivities}
                onChange={e => setFilterMyActivities(e.target.checked)}
                className="rounded border-border-tertiary"
              />
              Minhas atividades
            </label>

            {hasFilters && (
              <button
                onClick={() => {
                  setFilterType('')
                  setFilterMonth(currentMonth)
                  setFilterContact('')
                  setFilterMyActivities(false)
                }}
                className="text-xs text-text-tertiary hover:text-text-primary underline"
              >
                Limpar filtros
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm text-text-tertiary">
              {filteredActivities.length} de {activities.length}
            </span>
            <Button size="sm" onClick={() => setShowCreate(true)}>
              + Nova Atividade
            </Button>
          </div>
        </div>
      </div>

      <div className="space-y-2">

        {filteredActivities.map(a => {

          const Icon = ACTIVITY_ICONS[a.type] || Icons.FileText

          return (

            <div
              key={a.id}
              onClick={() => setSelected(a)}
              className="flex items-start gap-3 p-3 rounded-lg border border-border-tertiary hover:border-border-secondary cursor-pointer transition-colors bg-bg-primary"
            >

              <div
                className="w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0"
                style={{
                  backgroundColor:
                    ACTIVITY_BG[a.type]
                }}
              >

                <Icon
                  className="w-5 h-5 text-text-secondary"
                  strokeWidth={1.8}
                />

              </div>


              <div className="flex-1 min-w-0">

                <div className="flex items-center gap-1">

                  <p className="text-sm font-medium text-text-primary truncate">
                    {a.title || a.description}
                  </p>

                  {a.has_attachments && (

                    <Icons.Paperclip
                      className="w-3.5 h-3.5 text-text-tertiary"
                      strokeWidth={1.8}
                    />

                  )}

                </div>


                <p className="text-xs text-text-tertiary">

                  {a.type}
                  {" · "}
                  {formatDate(a.activity_date)}
                  {" · "}
                  {a.responsible?.name}

                </p>

              </div>


              <Badge
                variant={
                  a.status === 'concluida'
                    ? 'green'
                    : 'amber'
                }
              >

                {a.status === 'concluida'
                  ? 'Concluída'
                  : 'Pendente'}

              </Badge>

            </div>

          )

        })}


        {filteredActivities.length === 0 && (
          <p className="text-center py-12 text-text-tertiary">
            {hasFilters ? 'Nenhuma atividade_matches filtros.' : 'Nenhuma atividade ainda.'}
          </p>
        )}

      </div>


      {showCreate && (

        <ActivityModal
          onClose={() => setShowCreate(false)}
          defaultClientId={client.id}
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