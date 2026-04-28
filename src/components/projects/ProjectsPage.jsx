import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd'
import { useAllProjects, useUpdateProjectStatus } from '../../hooks/useProjects'
import { useAllOnboardings } from '../../hooks/useOnboardings'
import { useClients } from '../../hooks/useClients'
import { useProfiles } from '../../hooks/useProfiles'
import { useAuth } from '../../contexts/AuthContext'
import { PageHeader } from '../ui/PageHeader'
import { Badge } from '../ui/Badge'
import { PageSpinner } from '../ui/Spinner'
import { ActionIcons } from '../../lib/icons'
import { ProjectModal } from './ProjectModal'
import { FASE_LABELS } from '../../lib/onboardingLabels'

const COLUMNS = [
  { key: 'planejado',    label: 'Planejado',    color: '#888780', badge: 'slate'  },
  { key: 'em_andamento', label: 'Em Andamento', color: '#59c2ed', badge: 'sky'   },
  { key: 'concluido',    label: 'Concluído',    color: '#1D9E75', badge: 'green' },
  { key: 'suspenso',     label: 'Suspenso',     color: '#BA7517', badge: 'amber' },
]

const PROJ_TYPE = {
  onboarding: { label: 'Onboarding', bg: '#e6f1fb', color: '#0c447c' },
  expansao:   { label: 'Expansão',   bg: '#e8ed8a', color: '#5a6200' },
  interno:    { label: 'Interno',    bg: '#f0f0ee', color: '#555555' },
}

const SITUACAO_LABEL = {
  fluindo: { label: 'Fluindo', variant: 'green'  },
  atencao: { label: 'Atenção', variant: 'amber'  },
  travado: { label: 'Travado', variant: 'red'    },
}

const SITUACAO_COLOR = {
  fluindo: '#1D9E75',
  atencao: '#BA7517',
  travado: '#E05252',
}

const todayStr    = new Date().toISOString().slice(0, 10)
const in30DaysStr = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10)

function formatDate(d) {
  if (!d) return null
  return new Date(d + 'T00:00:00').toLocaleDateString('pt-BR')
}

const SELECT_CLS = 'px-3 py-1.5 text-xs border border-border-secondary rounded-md bg-bg-primary hover:border-text-tertiary transition-colors'

// ── Stats drawer ──────────────────────────────────────────────────────────────

function StatsDrawer({ title, items, onClose }) {
  const navigate = useNavigate()

  return (
    <div
      className="fixed inset-0 z-40"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="absolute right-0 top-0 h-full w-80 bg-bg-primary border-l border-border-tertiary shadow-xl flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-tertiary">
          <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
          <button onClick={onClose} className="text-text-tertiary hover:text-text-primary transition-colors text-lg leading-none">×</button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
          {items.length === 0 && (
            <p className="text-sm text-text-tertiary text-center py-8">Nenhum item.</p>
          )}
          {items.map(item => (
            <button
              key={item.id}
              onClick={() => { navigate(`/empresas/${item.clientId}?tab=operacional&sub=projetos`); onClose() }}
              className="w-full text-left p-3 rounded-md border border-border-tertiary hover:border-border-secondary hover:bg-bg-tertiary transition-colors"
            >
              <p className="text-xs font-medium text-donc-blue truncate mb-0.5">{item.clientName}</p>
              <p className="text-sm font-semibold text-text-primary leading-snug">{item.title}</p>
              {item.sub && <p className="text-xs text-text-tertiary mt-0.5">{item.sub}</p>}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Stats card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, color, onClick }) {
  return (
    <button
      onClick={onClick}
      className="flex-1 min-w-[140px] p-4 rounded-lg border border-border-tertiary bg-bg-primary hover:border-border-secondary hover:shadow-sm transition-all text-left"
    >
      <p className="text-2xl font-bold" style={{ color }}>{value}</p>
      <p className="text-xs text-text-tertiary mt-0.5">{label}</p>
    </button>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ProjectsPage() {
  const navigate = useNavigate()
  const { profile, isManager } = useAuth()
  const isAdminOrManager = isManager

  const { data: projects     = [], isLoading }  = useAllProjects()
  const { data: onboardings  = [] }             = useAllOnboardings()
  const { data: clients      = [] }             = useClients()
  const { data: profiles     = [] }             = useProfiles()
  const updateStatus = useUpdateProjectStatus()

  const [local, setLocal] = useState([])
  useEffect(() => { setLocal(projects) }, [projects])

  const [filterSearch,         setFilterSearch]         = useState('')
  const [filterOpen,           setFilterOpen]           = useState(false)
  const [selectedFilterClient, setSelectedFilterClient] = useState(null)
  const [csmFilter,            setCsmFilter]            = useState('')
  const [deadlineFilter,       setDeadlineFilter]       = useState('')
  const [typeFilter,           setTypeFilter]           = useState('')

  const [showModal,  setShowModal]  = useState(false)
  const [drawerKey,  setDrawerKey]  = useState(null) // which stat card is open

  const effectiveCsmFilter = isAdminOrManager ? csmFilter : (profile?.id ?? null)

  const filtered = useMemo(() => {
    let list = local
    if (selectedFilterClient) list = list.filter(p => p.client_id === selectedFilterClient.id)
    if (effectiveCsmFilter)   list = list.filter(p => p.responsible_id === effectiveCsmFilter)
    if (typeFilter)         list = list.filter(p => p.type === typeFilter)
    if (deadlineFilter === 'atrasado') {
      list = list.filter(p => p.end_date && p.end_date < todayStr && p.status !== 'concluido')
    } else if (deadlineFilter === 'vence_30') {
      list = list.filter(p => p.end_date && p.end_date >= todayStr && p.end_date <= in30DaysStr)
    } else if (deadlineFilter === 'sem_prazo') {
      list = list.filter(p => !p.end_date)
    }
    return list
  }, [local, selectedFilterClient, effectiveCsmFilter, typeFilter, deadlineFilter])

  const csmProfiles = profiles.filter(p => ['csm', 'admin', 'manager'].includes(p.role))
  const hasFilters  = !!selectedFilterClient || (isAdminOrManager && csmFilter) || deadlineFilter || typeFilter

  const filterSuggestions = filterSearch.trim()
    ? clients.filter(c => {
        const q = filterSearch.toLowerCase()
        return (c.name || '').toLowerCase().includes(q)
            || (c.fantasy_name || '').toLowerCase().includes(q)
      }).slice(0, 8)
    : clients.slice(0, 8)

  function clearFilterClient() {
    setSelectedFilterClient(null)
    setFilterSearch('')
  }

  function clearFilters() {
    setSelectedFilterClient(null)
    setFilterSearch('')
    setCsmFilter('')
    setDeadlineFilter('')
    setTypeFilter('')
  }

  function onDragEnd(result) {
    const { source, destination, draggableId } = result
    if (!destination) return
    if (source.droppableId === destination.droppableId && source.index === destination.index) return

    const id        = parseInt(draggableId, 10)
    const newStatus = destination.droppableId

    setLocal(prev => prev.map(p => p.id === id ? { ...p, status: newStatus } : p))
    updateStatus.mutate({ id, status: newStatus })
  }

  // ── Stats ──────────────────────────────────────────────────────────────────

  const statsAtivos = useMemo(
    () => filtered.filter(p => ['planejado', 'em_andamento'].includes(p.status)),
    [filtered]
  )

  const statsTravados = useMemo(
    () => onboardings.filter(o => o.situacao_geral === 'travado'),
    [onboardings]
  )

  const statsAtencao = useMemo(
    () => onboardings.filter(o => o.situacao_geral === 'atencao'),
    [onboardings]
  )

  const statsAtraso = useMemo(
    () => filtered.filter(p => p.end_date && p.end_date < todayStr && p.status !== 'concluido'),
    [filtered]
  )

  const statsConcluidos = useMemo(
    () => filtered.filter(p => p.status === 'concluido' && p.end_date && p.end_date >= firstOfMonth),
    [filtered]
  )

  // ── Drawer items builder ───────────────────────────────────────────────────

  const drawerConfig = useMemo(() => {
    if (!drawerKey) return null

    if (drawerKey === 'ativos') return {
      title: 'Projetos ativos',
      items: statsAtivos.map(p => ({
        id:         p.id,
        clientId:   p.client_id,
        clientName: p.client?.fantasy_name || p.client?.name || '—',
        title:      p.title,
        sub:        p.responsible?.name || null,
      })),
    }

    if (drawerKey === 'travados') return {
      title: 'Onboardings travados',
      items: statsTravados.map(o => ({
        id:         o.id,
        clientId:   o.client_id,
        clientName: o.client?.fantasy_name || o.client?.name || '—',
        title:      o.title,
        sub:        `Fase: ${FASE_LABELS[o.fase_atual] || o.fase_atual}`,
      })),
    }

    if (drawerKey === 'atencao') return {
      title: 'Onboardings em atenção',
      items: statsAtencao.map(o => ({
        id:         o.id,
        clientId:   o.client_id,
        clientName: o.client?.fantasy_name || o.client?.name || '—',
        title:      o.title,
        sub:        `Fase: ${FASE_LABELS[o.fase_atual] || o.fase_atual}`,
      })),
    }

    if (drawerKey === 'atraso') return {
      title: 'Projetos em atraso',
      items: statsAtraso.map(p => ({
        id:         p.id,
        clientId:   p.client_id,
        clientName: p.client?.fantasy_name || p.client?.name || '—',
        title:      p.title,
        sub:        p.end_date ? `Prazo: ${formatDate(p.end_date)}` : null,
      })),
    }

    if (drawerKey === 'concluidos') return {
      title: 'Concluídos no mês',
      items: statsConcluidos.map(p => ({
        id:         p.id,
        clientId:   p.client_id,
        clientName: p.client?.fantasy_name || p.client?.name || '—',
        title:      p.title,
        sub:        p.end_date ? formatDate(p.end_date) : null,
      })),
    }

    return null
  }, [drawerKey, statsAtivos, statsTravados, statsAtencao, statsAtraso, statsConcluidos])

  if (isLoading) return <PageSpinner />

  const total = filtered.length

  return (
    <div className="p-6">
      <PageHeader
        title="Projetos"
        subtitle={`${total} projeto${total !== 1 ? 's' : ''}`}
        action={
          <button
            onClick={() => setShowModal(true)}
            className="px-3 py-1.5 text-sm font-medium bg-donc-sky text-white rounded-md hover:bg-opacity-90 transition-colors"
          >
            + Novo Projeto
          </button>
        }
      />

      {/* Stats cards */}
      <div className="flex flex-wrap gap-3 mb-5">
        <StatCard
          label="Projetos ativos"
          value={statsAtivos.length}
          color="#59c2ed"
          onClick={() => setDrawerKey(drawerKey === 'ativos' ? null : 'ativos')}
        />
        <StatCard
          label="Onboardings travados"
          value={statsTravados.length}
          color="#E05252"
          onClick={() => setDrawerKey(drawerKey === 'travados' ? null : 'travados')}
        />
        <StatCard
          label="Em atenção"
          value={statsAtencao.length}
          color="#BA7517"
          onClick={() => setDrawerKey(drawerKey === 'atencao' ? null : 'atencao')}
        />
        <StatCard
          label="Em atraso"
          value={statsAtraso.length}
          color="#E05252"
          onClick={() => setDrawerKey(drawerKey === 'atraso' ? null : 'atraso')}
        />
        <StatCard
          label="Concluídos no mês"
          value={statsConcluidos.length}
          color="#1D9E75"
          onClick={() => setDrawerKey(drawerKey === 'concluidos' ? null : 'concluidos')}
        />
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <span className="text-xs text-text-tertiary">Filtrar por:</span>

        <div className="relative">
          <div className={`flex items-center gap-1 ${SELECT_CLS}`} style={{ padding: '0 8px 0 12px', minWidth: 140 }}>
            <input
              type="text"
              value={selectedFilterClient
                ? (selectedFilterClient.fantasy_name || selectedFilterClient.name)
                : filterSearch}
              onChange={e => {
                if (selectedFilterClient) return
                setFilterSearch(e.target.value)
                setFilterOpen(true)
              }}
              onFocus={() => { if (!selectedFilterClient) setFilterOpen(true) }}
              onBlur={() => setTimeout(() => setFilterOpen(false), 150)}
              readOnly={!!selectedFilterClient}
              placeholder="Todas as empresas"
              className="bg-transparent outline-none text-xs text-text-primary placeholder:text-text-tertiary flex-1"
              style={{ minWidth: 100, cursor: selectedFilterClient ? 'default' : 'text', padding: '6px 0' }}
            />
            {selectedFilterClient && (
              <button
                onMouseDown={e => { e.preventDefault(); clearFilterClient() }}
                className="text-text-tertiary hover:text-text-primary ml-1 text-sm leading-none flex-shrink-0"
              >
                ×
              </button>
            )}
          </div>
          {filterOpen && !selectedFilterClient && (
            <div className="absolute top-full mt-1 left-0 z-20 bg-bg-primary border border-border-secondary rounded-md shadow-lg py-1 min-w-[200px] max-h-48 overflow-y-auto">
              {filterSuggestions.length === 0 ? (
                <p className="px-3 py-2 text-xs text-text-tertiary">Nenhuma empresa encontrada.</p>
              ) : filterSuggestions.map(c => (
                <button
                  key={c.id}
                  onMouseDown={e => {
                    e.preventDefault()
                    setSelectedFilterClient(c)
                    setFilterSearch('')
                    setFilterOpen(false)
                  }}
                  className="w-full text-left px-3 py-1.5 text-xs text-text-primary hover:bg-bg-tertiary transition-colors truncate"
                >
                  {c.fantasy_name || c.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {isAdminOrManager && (
          <select value={csmFilter} onChange={e => setCsmFilter(e.target.value)} className={SELECT_CLS}>
            <option value="">Todos os CSMs</option>
            {csmProfiles.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        )}

        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className={SELECT_CLS}>
          <option value="">Todos os tipos</option>
          <option value="onboarding">Onboarding</option>
          <option value="expansao">Expansão</option>
          <option value="interno">Interno</option>
        </select>

        <select value={deadlineFilter} onChange={e => setDeadlineFilter(e.target.value)} className={SELECT_CLS}>
          <option value="">Todos os prazos</option>
          <option value="atrasado">Em atraso</option>
          <option value="vence_30">Vence em 30 dias</option>
          <option value="sem_prazo">Sem prazo definido</option>
        </select>

        {hasFilters && (
          <button
            onClick={clearFilters}
            className="text-xs text-text-tertiary hover:text-text-primary transition-colors"
          >
            Limpar filtros
          </button>
        )}
      </div>

      <DragDropContext onDragEnd={onDragEnd}>
        <div className="grid grid-cols-4 gap-4">
          {COLUMNS.map(col => {
            const items = filtered.filter(p => p.status === col.key)

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
                        padding:         snapshot.isDraggingOver ? 4 : 0,
                        display:         'flex',
                        flexDirection:   'column',
                        gap:             8,
                      }}
                    >
                      {items.map((proj, index) => {
                        let pct        = 0
                        let totalMs    = 0
                        let doneMs     = 0
                        if (proj.onboarding_id && proj.onboarding_fases) {
                          const fases = proj.onboarding_fases
                          totalMs = fases.length
                          doneMs  = fases.filter(f => f.status === 'concluida').length
                          pct     = totalMs ? Math.round((doneMs / totalMs) * 100) : 0
                        }
                        const isOverdue  = proj.end_date && proj.status !== 'concluido' && proj.end_date < todayStr
                        const clientName = proj.client?.fantasy_name || proj.client?.name || '—'
                        const respName   = proj.responsible?.name || null
                        const typeMeta   = proj.type ? PROJ_TYPE[proj.type] : null
                        const situacao   = (proj.type === 'onboarding' || proj.type === 'expansao')
                          ? proj.onboarding?.situacao_geral
                          : null

                        return (
                          <Draggable key={proj.id} draggableId={String(proj.id)} index={index}>
                            {(provided, snapshot) => (
                              <div
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                {...provided.dragHandleProps}
                                onClick={() => navigate('/projetos/' + proj.id)}
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

                                {(typeMeta || situacao) && (
                                  <div className="flex items-center gap-1.5 mb-1.5">
                                    {typeMeta && (
                                      <span style={{ background: typeMeta.bg, color: typeMeta.color, padding: '2px 7px', borderRadius: '5px', fontSize: '11px', fontWeight: 600 }}>
                                        {typeMeta.label}
                                      </span>
                                    )}
                                    {situacao && SITUACAO_COLOR[situacao] && (
                                      <span
                                        title={SITUACAO_LABEL[situacao]?.label || situacao}
                                        className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                                        style={{ backgroundColor: SITUACAO_COLOR[situacao] }}
                                      />
                                    )}
                                  </div>
                                )}

                                {respName && (
                                  <p className="text-xs text-text-tertiary mb-2 truncate flex items-center gap-1">
                                    <ActionIcons.user className="w-3 h-3 flex-shrink-0" /> {respName}
                                  </p>
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

      {/* Stats drawer */}
      {drawerKey && drawerConfig && (
        <StatsDrawer
          title={drawerConfig.title}
          items={drawerConfig.items}
          onClose={() => setDrawerKey(null)}
        />
      )}

      {/* New project modal */}
      <ProjectModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
      />
    </div>
  )
}
