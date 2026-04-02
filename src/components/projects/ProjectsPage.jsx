import { useNavigate } from 'react-router-dom'
import { useAllMilestones } from '../../hooks/useMilestones'
import { PageHeader } from '../ui/PageHeader'
import { Badge } from '../ui/Badge'
import { PageSpinner } from '../ui/Spinner'

const COLUMNS = [
  { key: 'planejado', label: 'Planejado', color: '#888780' },
  { key: 'em_andamento', label: 'Em Andamento', color: '#59c2ed' },
  { key: 'done', label: 'Concluído', color: '#1D9E75' },
]

function formatDate(d) {
  if (!d) return null
  return new Date(d + 'T00:00:00').toLocaleDateString('pt-BR')
}

export default function ProjectsPage() {
  const navigate = useNavigate()
  const { data: milestones = [], isLoading } = useAllMilestones()

  if (isLoading) return <PageSpinner />

  return (
    <div className="p-6">
      <PageHeader title="Projetos" subtitle={`${milestones.length} milestones`} />

      <div className="grid grid-cols-3 gap-4">
        {COLUMNS.map(col => {
          const items = milestones.filter(m => m.status === col.key)
          return (
            <div key={col.key} className="bg-bg-tertiary rounded-lg p-3">
              <div className="flex items-center gap-2 mb-3">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: col.color }} />
                <h3 className="text-sm font-semibold text-text-primary">{col.label}</h3>
                <span className="ml-auto bg-bg-primary text-text-tertiary text-xs px-2 py-0.5 rounded-full">{items.length}</span>
              </div>

              <div className="space-y-2">
                {items.map(m => {
                  const tasks = m.milestone_tasks || []
                  const done = tasks.filter(t => t.done).length
                  const pct = tasks.length ? Math.round((done/tasks.length)*100) : m.progress || 0
                  const isOverdue = m.due_date && m.status !== 'done' && m.due_date < new Date().toISOString().split('T')[0]

                  return (
                    <div
                      key={m.id}
                      onClick={() => navigate(`/clientes/${m.client_id}?tab=operacional&sub=projetos`)}
                      className="bg-bg-primary border border-border-tertiary rounded-md p-3 cursor-pointer hover:border-border-secondary hover:shadow-sm transition-all"
                    >
                      <p className="text-xs font-medium text-donc-blue mb-0.5">{m.client?.name}</p>
                      <p className="text-sm font-semibold text-text-primary mb-2">{m.title}</p>

                      <div className="h-1.5 bg-bg-tertiary rounded-full overflow-hidden mb-1">
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: col.color }} />
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-xs text-text-tertiary">{done}/{tasks.length} tarefas</span>
                        {m.due_date && (
                          <span className={`text-xs ${isOverdue ? 'text-donc-red' : 'text-text-tertiary'}`}>
                            {formatDate(m.due_date)}
                          </span>
                        )}
                      </div>

                      {pct > 0 && (
                        <div className="mt-1">
                          <Badge variant={col.key === 'done' ? 'green' : col.key === 'em_andamento' ? 'sky' : 'slate'}>
                            {pct}%
                          </Badge>
                        </div>
                      )}
                    </div>
                  )
                })}
                {items.length === 0 && (
                  <p className="text-xs text-text-tertiary text-center py-4">Nenhum item</p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
