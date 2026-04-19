import { useState } from 'react'
import { Calendar, Phone, Mail, MessageCircle, CheckSquare, FileText } from "lucide-react"
import { ActivityIcons, ActivityIconBackgrounds, DefaultActivityIcon } from "../../../lib/icons";
import { useActivities } from '../../../hooks/useActivities'
import { Badge } from '../../ui/Badge'
import { Button } from '../../ui/Button'
import { ActivityModal } from '../../activities/ActivityModal'
import { ActivityDetailModal } from '../../activities/ActivityDetailModal'
import { PageSpinner } from '../../ui/Spinner'


function formatDate(d) {
  if (!d) return '—'
  return new Date(d + 'T00:00:00').toLocaleDateString('pt-BR')
}

export function ClientTabActivities({ client }) {
  const [showCreate, setShowCreate] = useState(false)
  const [selected, setSelected] = useState(null)
  const { data: activities = [], isLoading } = useActivities({ client_id: client.id })

  if (isLoading) return <PageSpinner />

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm text-text-tertiary">{activities.length} atividades</span>
        <Button size="sm" onClick={() => setShowCreate(true)}>+ Nova Atividade</Button>
      </div>

      <div className="space-y-2">
        {activities.map(a => {
          <div
            const Icon = ActivityIcons[a.type] || DefaultActivityIcon;
            key={a.id}
            onClick={() => setSelected(a)}
            className="flex items-start gap-3 p-3 rounded-lg border border-border-tertiary hover:border-border-secondary cursor-pointer transition-colors bg-bg-primary"
          >
            <div className="w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0 text-base"
              style={{ backgroundColor: ActivityIconBackgrounds[a.type] }}>
              <Icon className="w-5 h-5 text-text-secondary" strokeWidth={1.8} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1">
  <p className="text-sm font-medium text-text-primary truncate">
    {a.title || a.description}
  </p>
  {a.has_attachments && (
    <span
      title="Possui anexos"
      className="text-xs"
    >
      📎
    </span>
  )}
</div>
              <p className="text-xs text-text-tertiary">{a.type} · {formatDate(a.activity_date)} · {a.responsible?.name}</p>
            </div>
            <Badge variant={a.status === 'concluida' ? 'green' : 'amber'}>
              {a.status === 'concluida' ? 'Concluída' : 'Pendente'}
            </Badge>
          </div>
        ))}
        {activities.length === 0 && (
          <p className="text-center py-12 text-text-tertiary">Nenhuma atividade ainda.</p>
        )}
      </div>

      {showCreate && <ActivityModal onClose={() => setShowCreate(false)} defaultClientId={client.id} />}
      {selected && <ActivityDetailModal activity={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}
