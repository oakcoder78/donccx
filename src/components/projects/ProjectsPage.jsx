import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd'
import { useAllMilestones, useUpdateMilestoneStatus } from '../../hooks/useMilestones'
import { PageHeader } from '../ui/PageHeader'
import { Badge } from '../ui/Badge'
import { PageSpinner } from '../ui/Spinner'

const COLUMNS = [
  { key: 'planejado',    label: 'Planejado',    color: '#888780' },
  { key: 'em_andamento', label: 'Em Andamento', color: '#59c2ed' },
  { key: 'done',         label: 'Concluído',    color: '#1D9E75' },
]

const todayStr = new Date().toISOString().slice(0, 10)

function formatDate(d) {
  if (!d) return null
  return new Date(d + 'T00:00:00').toLocaleDateString('pt-BR')
}

export default function ProjectsPage() {
  const navigate = useNavigate()
  const { data: milestones = [], isLoading } = useAllMilestones()
  const updateStatus = useUpdateMilestoneStatus()

  // Local copy for optimistic updates
  const [local, setLocal] = useState([])
  useEffect(() => { setLocal(milestones) }, [milestones])

  function onDragEnd(result) {
    const { source, destination, draggableId } = result

    // Dropped outside or same position — no-op
    if (!destination) return
    if (source.droppableId === destination.droppableId && source.index === destination.index) return

    const id        = parseInt(draggableId, 10)
    const newStatus = destination.droppableId

    // Optimistic update — move card immediately in UI
    setLocal(prev => prev.map(m => m.id === id ? { ...m, status: newStatus } : m))

    // Persist to Supabase
    updateStatus.mutate({ id, status: newStatus })
  }

  if (isLoading) return <PageSpinner />

  return (
    <div className="p-6">
      <PageHeader title="Projetos" subtitle={`${local.length} milestones`} />

      <DragDropContext onDragEnd={onDragEnd}>
        <div className="grid grid-cols-3 gap-4">
          {COLUMNS.map(col => {
            const items = local.filter(m => m.status === col.key)

            return (
              <div key={col.key} className="bg-bg-tertiary rounded-lg p-3 flex flex-col">
                {/* Column header */}
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: col.color }} />
                  <h3 className="text-sm font-semibold text-text-primary">{col.label}</h3>
                  <span className="ml-auto bg-bg-primary text-text-tertiary text-xs px-2 py-0.5 rounded-full">
                    {items.length}
                  </span>
                </div>

                {/* Droppable zone per column */}
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
                      {items.map((m, index) => {
                        const tasks     = m.milestone_tasks || []
                        const done      = tasks.filter(t => t.done).length
                        const pct       = tasks.length ? Math.round((done / tasks.length) * 100) : m.progress || 0
                        const isOverdue = m.due_date && m.status !== 'done' && m.due_date < todayStr

                        return (
                          <Draggable key={m.id} draggableId={String(m.id)} index={index}>
                            {(provided, snapshot) => (
                              <div
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                {...provided.dragHandleProps}
                                onClick={() => navigate(`/empresas/${m.client_id}?tab=operacional`)}
                                className="bg-bg-primary border border-border-tertiary rounded-md p-3 hover:border-border-secondary transition-colors select-none"
                                style={{
                                  ...provided.draggableProps.style,
                                  boxShadow: snapshot.isDragging ? '0 6px 16px rgba(0,0,0,0.12)' : undefined,
                                  opacity:   snapshot.isDragging ? 0.92 : 1,
                                  cursor:    snapshot.isDragging ? 'grabbing' : 'grab',
                                }}
                              >
                                <p className="text-xs font-medium text-donc-blue mb-0.5 truncate">{m.client?.name}</p>
                                <p className="text-sm font-semibold text-text-primary mb-2">{m.title}</p>

                                <div className="h-1.5 bg-bg-tertiary rounded-full overflow-hidden mb-1">
                                  <div
                                    className="h-full rounded-full"
                                    style={{ width: `${pct}%`, backgroundColor: col.color }}
                                  />
                                </div>

                                <div className="flex items-center justify-between">
                                  <span className="text-xs text-text-tertiary">{done}/{tasks.length} tarefas</span>
                                  {m.due_date && (
                                    <span className={`text-xs ${isOverdue ? 'text-donc-red font-medium' : 'text-text-tertiary'}`}>
                                      {formatDate(m.due_date)}
                                    </span>
                                  )}
                                </div>

                                {pct > 0 && (
                                  <div className="mt-1.5">
                                    <Badge variant={col.key === 'done' ? 'green' : col.key === 'em_andamento' ? 'sky' : 'slate'}>
                                      {pct}%
                                    </Badge>
                                  </div>
                                )}
                              </div>
                            )}
                          </Draggable>
                        )
                      })}

                      {provided.placeholder}

                      {items.length === 0 && !snapshot.isDraggingOver && (
                        <p className="text-xs text-text-tertiary text-center py-6">Nenhum item</p>
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
