import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd'
import { useAllProjects, useUpdateProjectStatus } from '../../hooks/useProjects'
import { PageHeader } from '../ui/PageHeader'
import { Badge } from '../ui/Badge'
import { PageSpinner } from '../ui/Spinner'

const COLUMNS = [
  { key: 'planejado',    label: 'Planejado',    color: '#888780', badge: 'slate'  },
  { key: 'em_andamento', label: 'Em Andamento', color: '#59c2ed', badge: 'sky'   },
  { key: 'concluido',    label: 'Concluído',    color: '#1D9E75', badge: 'green' },
  { key: 'suspenso',     label: 'Suspenso',     color: '#BA7517', badge: 'amber' },
]

const todayStr = new Date().toISOString().slice(0, 10)

function formatDate(d) {
  if (!d) return null
  return new Date(d + 'T00:00:00').toLocaleDateString('pt-BR')
}

export default function ProjectsPage() {
  const navigate = useNavigate()
  const { data: projects = [], isLoading } = useAllProjects()
  const updateStatus = useUpdateProjectStatus()

  const [local, setLocal] = useState([])
  useEffect(() => { setLocal(projects) }, [projects])

  function onDragEnd(result) {
    const { source, destination, draggableId } = result
    if (!destination) return
    if (source.droppableId === destination.droppableId && source.index === destination.index) return

    const id        = parseInt(draggableId, 10)
    const newStatus = destination.droppableId

    setLocal(prev => prev.map(p => p.id === id ? { ...p, status: newStatus } : p))
    updateStatus.mutate({ id, status: newStatus })
  }

  if (isLoading) return <PageSpinner />

  const total = local.length

  return (
    <div className="p-6">
      <PageHeader title="Projetos" subtitle={`${total} projeto${total !== 1 ? 's' : ''}`} />

      <DragDropContext onDragEnd={onDragEnd}>
        <div className="grid grid-cols-4 gap-4">
          {COLUMNS.map(col => {
            const items = local.filter(p => p.status === col.key)

            return (
              <div key={col.key} className="bg-bg-tertiary rounded-lg p-3 flex flex-col">
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: col.color }} />
                  <h3 className="text-sm font-semibold text-text-primary">{col.label}</h3>
                  <span className="ml-auto bg-bg-primary text-text-tertiary text-xs px-2 py-0.5 rounded-full">
                    {items.length}
                  </span>
                </div>

                <Droppable droppableId={col.key}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className="flex-1 min-h-[80px] rounded-md transition-colors duration-150"
                      style={{
                        backgroundColor: snapshot.isDraggingOver ? 'rgba(0,0,0,0.04)' : 'transparent',
                        padding: snapshot.isDraggingOver ? 4 : 0,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                      }}
                    >
                      {items.map((proj, index) => {
                        const milestones  = proj.milestones ?? []
                        const totalMs     = milestones.length
                        const doneMs      = milestones.filter(m => m.status === 'done').length
                        const pct         = totalMs ? Math.round((doneMs / totalMs) * 100) : 0
                        const isOverdue   = proj.end_date && proj.status !== 'concluido' && proj.end_date < todayStr
                        const clientName  = proj.client?.fantasy_name || proj.client?.name || '—'
                        const respName    = proj.responsible?.name || null

                        return (
                          <Draggable key={proj.id} draggableId={String(proj.id)} index={index}>
                            {(provided, snapshot) => (
                              <div
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                {...provided.dragHandleProps}
                                onClick={() => navigate(`/empresas/${proj.client_id}?tab=operacional&sub=projetos`)}
                                className="bg-bg-primary border border-border-tertiary rounded-md p-3 hover:border-border-secondary transition-colors select-none"
                                style={{
                                  ...provided.draggableProps.style,
                                  boxShadow: snapshot.isDragging ? '0 6px 16px rgba(0,0,0,0.12)' : undefined,
                                  opacity:   snapshot.isDragging ? 0.92 : 1,
                                  cursor:    snapshot.isDragging ? 'grabbing' : 'grab',
                                }}
                              >
                                <p className="text-xs font-medium text-donc-blue mb-0.5 truncate">{clientName}</p>
                                <p className="text-sm font-semibold text-text-primary mb-1 leading-snug">{proj.title}</p>

                                {respName && (
                                  <p className="text-xs text-text-tertiary mb-2 truncate">👤 {respName}</p>
                                )}

                                {totalMs > 0 && (
                                  <>
                                    <div className="h-1.5 bg-bg-tertiary rounded-full overflow-hidden mb-1">
                                      <div
                                        className="h-full rounded-full transition-all"
                                        style={{ width: `${pct}%`, backgroundColor: col.color }}
                                      />
                                    </div>
                                    <p className="text-xs text-text-tertiary mb-1">
                                      {doneMs}/{totalMs} milestones · {pct}%
                                    </p>
                                  </>
                                )}

                                <div className="flex items-center justify-between mt-1 gap-1">
                                  {totalMs > 0 && (
                                    <Badge variant={col.badge}>{pct}%</Badge>
                                  )}
                                  {proj.end_date && (
                                    <span className={`text-xs ml-auto ${isOverdue ? 'text-donc-red font-medium' : 'text-text-tertiary'}`}>
                                      {formatDate(proj.end_date)}
                                    </span>
                                  )}
                                </div>
                              </div>
                            )}
                          </Draggable>
                        )
                      })}

                      {provided.placeholder}

                      {items.length === 0 && !snapshot.isDraggingOver && (
                        <p className="text-xs text-text-tertiary text-center py-6">Nenhum projeto</p>
                      )}
                    </div>
                  )}
                </Droppable>
              </div>
            )
          })}
        </div>
      </DragDropContext>
    </div>
  )
}
