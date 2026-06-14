import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useProjectCockpit } from '@/hooks/useProjectCockpit'
import { PageHeader } from '@/components/ui/PageHeader'
import { Icons } from '@/lib/icons'

export default function ProjectCockpitPage() {
  const navigate = useNavigate()
  const { data: rows, isLoading, error } = useProjectCockpit()
  const [openSet, setOpenSet] = useState(new Set())
  const [globalPanelOpen, setGlobalPanelOpen] = useState(false)
  const [alertOpen, setAlertOpen] = useState(false)

  function toggleRow(clientId) {
    setOpenSet(prev => {
      const next = new Set(prev)
      next.has(clientId) ? next.delete(clientId) : next.add(clientId)
      return next
    })
  }

  const { allActivities, overdueActivities, dueThisWeek } = useMemo(() => {
    if (!rows) return { allActivities: [], overdueActivities: [], dueThisWeek: [] }
    const today = new Date().toISOString().split('T')[0]
    const weekEnd = new Date()
    weekEnd.setDate(weekEnd.getDate() + (7 - weekEnd.getDay()))
    const endStr = weekEnd.toISOString().split('T')[0]

    const flat = []
    for (const row of rows) {
      for (const proj of row.projects) {
        for (const a of proj.activities) {
          flat.push({ ...a, clientName: row.clientName, projectTitle: proj.title })
        }
      }
    }
    return {
      allActivities: flat,
      overdueActivities: flat.filter(a => a.dueDate && a.dueDate < today && a.status !== 'concluida'),
      dueThisWeek: flat.filter(a => a.dueDate && a.dueDate >= today && a.dueDate <= endStr && a.status !== 'concluida'),
    }
  }, [rows])

  if (isLoading) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <BackButton navigate={navigate} />
        <PageHeader title="Project Cockpit" description="Acompanhamento de projetos ativos por cliente" />
        <div className="mt-6 text-text-tertiary text-sm flex items-center gap-2">
          <Icons.Loader2 className="w-4 h-4 animate-spin" />
          Carregando...
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <BackButton navigate={navigate} />
        <PageHeader title="Project Cockpit" description="Acompanhamento de projetos ativos por cliente" />
        <div className="mt-6 p-4 bg-donc-red/10 border border-donc-red/20 rounded-lg text-donc-red text-sm">
          Erro ao carregar dados: {error.message}
        </div>
      </div>
    )
  }

  if (!rows?.length) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <BackButton navigate={navigate} />
        <PageHeader title="Project Cockpit" description="Acompanhamento de projetos ativos por cliente" />
        <div className="mt-6 text-text-tertiary text-sm">Nenhum cliente com projeto ativo encontrado.</div>
      </div>
    )
  }

  const total = rows.length
  const onTime = rows.filter(r => r.displayStatus === 'on_time').length
  const delayed = rows.filter(r => r.displayStatus === 'delayed').length
  const paused = rows.filter(r => r.displayStatus === 'paused').length

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <BackButton navigate={navigate} />
      <PageHeader title="Project Cockpit" description="Acompanhamento de projetos ativos por cliente" />

      {overdueActivities.length > 0 && (
        <AlertBanner
          open={alertOpen}
          onToggle={() => setAlertOpen(!alertOpen)}
          overdue={overdueActivities}
          dueThisWeek={dueThisWeek}
        />
      )}

      <SummaryBar total={total} onTime={onTime} delayed={delayed} paused={paused} />

      <button
        onClick={() => setGlobalPanelOpen(!globalPanelOpen)}
        className="mt-5 w-full flex items-center gap-2 px-4 py-3 bg-bg-primary border border-border-tertiary rounded-xl text-left hover:bg-bg-tertiary transition-colors"
      >
        <Icons.ClipboardList className="w-4 h-4 text-text-tertiary" />
        <span className="text-sm font-medium text-text-primary flex-1">Visão Geral de Atividades</span>
        <span className="text-xs text-text-tertiary">{allActivities.length} atividades</span>
        <ChevronIcon open={globalPanelOpen} />
      </button>

      {globalPanelOpen && (
        <div className="border border-t-0 border-border-tertiary rounded-b-xl bg-bg-primary px-4 py-3">
          <GlobalActivitiesPanel activities={allActivities} />
        </div>
      )}

      <div className="mt-5 space-y-1.5">
        {rows.map(row => (
          <CockpitRow
            key={row.clientId}
            row={row}
            isOpen={openSet.has(row.clientId)}
            onToggle={() => toggleRow(row.clientId)}
          />
        ))}
      </div>
    </div>
  )
}

function BackButton({ navigate }) {
  return (
    <button onClick={() => navigate('/cockpits')} className="flex items-center gap-1.5 text-sm text-text-tertiary hover:text-text-secondary transition-colors mb-4">
      <Icons.ArrowLeft className="w-4 h-4" />
      Voltar para Cockpits
    </button>
  )
}

function ChevronIcon({ open }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none"
      className="transition-transform duration-200 flex-shrink-0"
      style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
    >
      <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function AlertBanner({ open, onToggle, overdue, dueThisWeek }) {
  return (
    <div className="mt-5 bg-donc-red/5 border border-donc-red/20 rounded-xl overflow-hidden">
      <button onClick={onToggle} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-donc-red/5 transition-colors">
        <Icons.AlertTriangle className="w-5 h-5 text-donc-red flex-shrink-0" />
        <div className="flex-1 text-sm">
          <span className="font-medium text-donc-red">{overdue.length} atividade{overdue.length !== 1 ? 's' : ''} atrasada{overdue.length !== 1 ? 's' : ''}</span>
          {dueThisWeek.length > 0 && (
            <span className="text-text-tertiary ml-2">· {dueThisWeek.length} vence{dueThisWeek.length !== 1 ? 'm' : ''} esta semana</span>
          )}
        </div>
        <ChevronIcon open={open} />
      </button>
      {open && (
        <div className="border-t border-donc-red/10 px-4 py-2 space-y-1">
          {overdue.map(a => (
            <div key={a.id} className="flex items-center gap-2 text-sm py-1">
              <span className="w-1.5 h-1.5 rounded-full bg-donc-red flex-shrink-0" />
              <span className="text-text-secondary font-medium">{a.clientName}</span>
              <span className="text-text-tertiary">· {a.title}</span>
              <span className="text-donc-red text-xs ml-auto flex-shrink-0">{formatDate(a.dueDate)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function SummaryBar({ total, onTime, delayed, paused }) {
  return (
    <div className="mt-5 flex items-center gap-4 p-4 bg-bg-primary border border-border-tertiary rounded-xl text-sm">
      <div className="flex items-center gap-2">
        <Icons.FolderKanban className="w-4 h-4 text-text-tertiary" />
        <span className="text-text-secondary">{total} cliente{total !== 1 ? 's' : ''}</span>
      </div>
      <div className="w-px h-5 bg-border-tertiary" />
      <div className="flex items-center gap-2">
        <Icons.CheckCircle2 className="w-4 h-4 text-donc-verde" />
        <span className="text-text-secondary">{total ? Math.round(onTime / total * 100) : 0}% em dia ({onTime})</span>
      </div>
      <div className="w-px h-5 bg-border-tertiary" />
      <div className="flex items-center gap-2">
        <Icons.AlertCircle className="w-4 h-4 text-donc-red" />
        <span className="text-text-secondary">{total ? Math.round(delayed / total * 100) : 0}% atrasado ({delayed})</span>
      </div>
      {paused > 0 && (
        <>
          <div className="w-px h-5 bg-border-tertiary" />
          <div className="flex items-center gap-2">
            <Icons.PauseCircle className="w-4 h-4 text-donc-amber" />
            <span className="text-text-secondary">{paused} parado{paused !== 1 ? 's' : ''}</span>
          </div>
        </>
      )}
    </div>
  )
}

const statusConfig = {
  on_time: { icon: Icons.CheckCircle2, color: 'text-donc-verde', bg: 'bg-donc-verde/10', label: 'Em dia' },
  delayed: { icon: Icons.AlertCircle, color: 'text-donc-red', bg: 'bg-donc-red/10', label: 'Atrasado' },
  paused:  { icon: Icons.PauseCircle, color: 'text-donc-amber', bg: 'bg-donc-amber/10', label: 'Parado' },
}

function progressBarColor(pct) {
  if (pct >= 80) return 'bg-donc-verde'
  if (pct >= 40) return 'bg-donc-amber'
  return 'bg-donc-red'
}

function CockpitRow({ row, isOpen, onToggle }) {
  const cfg = statusConfig[row.displayStatus] || statusConfig.on_time
  const Icon = cfg.icon
  const [activeTabId, setActiveTabId] = useState(row.projects[0]?.id || null)

  return (
    <div className="bg-bg-primary border border-border-tertiary rounded-xl overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-bg-tertiary transition-colors focus-visible:outline-none"
      >
        <ChevronIcon open={isOpen} />
        <Icon className={`w-5 h-5 flex-shrink-0 ${cfg.color}`} />
        <div className="flex-1 min-w-0 flex items-center gap-3">
          <span className="font-semibold text-text-primary truncate">{row.clientName}</span>
          {row.abcClass && (
            <span className="text-[11px] font-medium text-text-tertiary bg-bg-secondary px-1.5 py-0.5 rounded flex-shrink-0">
              ABC: {row.abcClass}
            </span>
          )}
          {row.currentPhase && (
            <span className="text-sm text-text-tertiary truncate hidden sm:inline">
              Fase: {row.currentPhase}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <div className="w-24 h-2 bg-bg-secondary rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${progressBarColor(row.progress)}`}
              style={{ width: `${row.progress}%` }}
            />
          </div>
          <span className="text-sm font-medium text-text-secondary w-10 text-right tabular-nums">{row.progress}%</span>
        </div>
      </button>

      {isOpen && (
        <ExpandedContent
          projects={row.projects}
          activeTabId={activeTabId}
          onTabChange={setActiveTabId}
        />
      )}
    </div>
  )
}

function ExpandedContent({ projects, activeTabId, onTabChange }) {
  const activeProj = projects.find(p => p.id === activeTabId) || projects[0]

  return (
    <div className="border-t border-border-tertiary px-4 py-3 space-y-4 bg-bg-primary">
      {projects.length > 1 && (
        <div className="flex gap-1 border-b border-border-tertiary pb-2">
          {projects.map(proj => (
            <button
              key={proj.id}
              onClick={() => onTabChange(proj.id)}
              className={`text-xs px-3 py-1.5 rounded-md font-medium transition-colors ${
                activeProj.id === proj.id
                  ? 'bg-donc-sky/10 text-donc-sky'
                  : 'text-text-tertiary hover:text-text-secondary'
              }`}
            >
              {proj.title}
            </button>
          ))}
        </div>
      )}

      {activeProj.onboardingId ? (
        <>
          {activeProj.allFases.length > 0 && (
            <ProjectTimeline fases={activeProj.allFases} faseAtualId={activeProj.currentPhase?.id} />
          )}
          <ProjectActivitiesList activities={activeProj.activities} />
          {activeProj.allFases.length === 0 && activeProj.activities.length === 0 && (
            <div className="text-sm text-text-tertiary py-2">Nenhuma fase ou atividade encontrada.</div>
          )}
        </>
      ) : (
        <>
          {activeProj.milestones.length > 0 && (
            <ProjectMilestonesList milestones={activeProj.milestones} />
          )}
          {activeProj.milestones.length === 0 && (
            <div className="text-sm text-text-tertiary py-2">Nenhum milestone registrado.</div>
          )}
        </>
      )}
    </div>
  )
}

function ProjectTimeline({ fases, faseAtualId }) {
  return (
    <div>
      <div className="text-xs font-medium text-text-tertiary uppercase tracking-wide mb-2">Timeline</div>
      <div className="flex items-start overflow-x-auto pb-2 gap-0" style={{ scrollbarWidth: 'thin' }}>
        {fases.map((fase, idx) => {
          const isDone = fase.status === 'concluida'
          const isActive = fase.id === faseAtualId || (!faseAtualId && fase.status === 'ativa')
          const isLast = idx === fases.length - 1
          const next = fases[idx + 1]
          return (
            <div key={fase.id} style={{ display: 'contents' }}>
              <PhaseCircleSmall fase={fase} isActive={isActive} isDone={isDone} />
              {!isLast && <ConnectorSmall leftDone={isDone} rightActive={!!(next?.id === faseAtualId || next?.status === 'ativa')} />}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function PhaseCircleSmall({ fase, isActive, isDone }) {
  let circleBg, circleBorder, circleColor, circleShadow
  if (isDone) {
    circleBg = '#1aa56a'; circleBorder = '#1aa56a'; circleColor = '#fff'; circleShadow = 'none'
  } else if (isActive) {
    circleBg = 'rgba(89,194,237,0.12)'; circleBorder = '#59c2ed'; circleColor = '#0a6a96'
    circleShadow = '0 0 0 3px rgba(89,194,237,0.18)'
  } else {
    circleBg = '#f4f5f7'; circleBorder = '#d4d3ce'; circleColor = 'rgba(23,53,87,0.35)'; circleShadow = 'none'
  }
  const labelColor = isDone ? '#157a47' : isActive ? '#0a6a96' : 'rgba(23,53,87,0.4)'
  const Icon = isDone ? Icons.Check : Icons.FileText
  const iconSize = isDone ? 14 : 12

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, minWidth: 56, maxWidth: 80 }}>
      <div style={{
        width: 32, height: 32, borderRadius: '50%',
        border: `2px solid ${circleBorder}`, background: circleBg, color: circleColor,
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        boxShadow: circleShadow, transition: 'box-shadow 0.2s, border-color 0.2s',
      }}>
        <Icon size={iconSize} color={circleColor} strokeWidth={isDone ? 2.4 : 1.6} />
      </div>
      <div style={{ fontSize: 10, textAlign: 'center', fontWeight: isDone || isActive ? 600 : 400, color: labelColor, lineHeight: 1.2, maxWidth: 76, wordBreak: 'break-word' }}>
        {fase.name || `Fase #${fase.faseTypeId}`}
      </div>
      <div style={{ fontSize: 9, textAlign: 'center', color: 'rgba(23,53,87,0.5)', lineHeight: 1.2 }}>
        {fase.plannedEnd || '—'}
      </div>
    </div>
  )
}

function ConnectorSmall({ leftDone, rightActive }) {
  const bg = leftDone && rightActive
    ? 'linear-gradient(90deg, #1aa56a, #59c2ed)'
    : leftDone ? '#1aa56a' : '#d4d3ce'
  return <div style={{ flex: 1, minWidth: 8, height: 2, background: bg, marginTop: 15, flexShrink: 0, alignSelf: 'flex-start' }} />
}

const statusBadge = {
  pendente:     'bg-donc-amber/10 text-donc-amber',
  em_andamento: 'bg-donc-sky/10 text-donc-sky',
  concluida:    'bg-donc-verde/10 text-donc-verde',
}

const statusLabel = {
  pendente:     'Pendente',
  em_andamento: 'Em andamento',
  concluida:    'Concluída',
}

function ProjectActivitiesList({ activities }) {
  const [showAll, setShowAll] = useState(false)
  const filtered = showAll ? activities : activities.filter(a => a.status !== 'concluida')

  if (!activities.length) return null

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-medium text-text-tertiary uppercase tracking-wide">Atividades ({activities.length})</div>
        <label className="flex items-center gap-1.5 text-xs text-text-tertiary cursor-pointer select-none">
          <input type="checkbox" checked={showAll} onChange={() => setShowAll(!showAll)} className="accent-donc-sky" />
          Mostrar concluídas
        </label>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border-tertiary text-xs text-text-tertiary uppercase tracking-wide">
              <th className="text-left font-medium px-3 py-2">Atividade</th>
              <th className="text-left font-medium px-3 py-2">Data</th>
              <th className="text-left font-medium px-3 py-2">Status</th>
              <th className="text-left font-medium px-3 py-2">Responsável</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(a => (
              <tr key={a.id} className="border-b border-border-tertiary/50 last:border-0">
                <td className="px-3 py-2.5 text-text-primary">
                  <div>{a.title}</div>
                  {a.typeName && <div className="text-xs text-text-tertiary mt-0.5">{a.typeName}</div>}
                </td>
                <td className={`px-3 py-2.5 whitespace-nowrap ${a.dueDate < new Date().toISOString().split('T')[0] ? 'text-donc-red' : 'text-text-secondary'}`}>
                  {a.dueDate ? formatDate(a.dueDate) : '—'}
                </td>
                <td className="px-3 py-2.5">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusBadge[a.status] || ''}`}>
                    {statusLabel[a.status] || a.status}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-text-secondary">
                  {a.responsibleContato || a.responsibleInterno || '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function GlobalActivitiesPanel({ activities }) {
  const [filter, setFilter] = useState('all')
  const today = new Date().toISOString().split('T')[0]

  const filtered = activities.filter(a => {
    if (filter === 'pendente') return a.status === 'pendente'
    if (filter === 'em_andamento') return a.status === 'em_andamento'
    if (filter === 'concluida') return a.status === 'concluida'
    if (filter === 'atrasada') return a.dueDate && a.dueDate < today && a.status !== 'concluida'
    return true
  })

  const filters = [
    { key: 'all', label: 'Todas' },
    { key: 'pendente', label: 'Pendentes' },
    { key: 'em_andamento', label: 'Em andamento' },
    { key: 'concluida', label: 'Concluídas' },
    { key: 'atrasada', label: 'Atrasadas' },
  ]

  return (
    <div>
      <div className="flex flex-wrap gap-1 mb-3">
        {filters.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`text-xs px-3 py-1.5 rounded-md font-medium transition-colors ${
              filter === f.key
                ? 'bg-donc-sky/10 text-donc-sky'
                : 'text-text-tertiary hover:text-text-secondary'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border-tertiary text-xs text-text-tertiary uppercase tracking-wide">
              <th className="text-left font-medium px-3 py-2">Cliente</th>
              <th className="text-left font-medium px-3 py-2">Projeto</th>
              <th className="text-left font-medium px-3 py-2">Atividade</th>
              <th className="text-left font-medium px-3 py-2">Data</th>
              <th className="text-left font-medium px-3 py-2">Status</th>
              <th className="text-left font-medium px-3 py-2">Responsável</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(a => (
              <tr key={a.id} className="border-b border-border-tertiary/50 last:border-0">
                <td className="px-3 py-2.5 text-text-primary font-medium">{a.clientName}</td>
                <td className="px-3 py-2.5 text-text-secondary">{a.projectTitle}</td>
                <td className="px-3 py-2.5 text-text-primary">
                  <div>{a.title}</div>
                  {a.typeName && <div className="text-xs text-text-tertiary mt-0.5">{a.typeName}</div>}
                </td>
                <td className={`px-3 py-2.5 whitespace-nowrap ${a.dueDate && a.dueDate < today ? 'text-donc-red' : 'text-text-secondary'}`}>
                  {a.dueDate ? formatDate(a.dueDate) : '—'}
                </td>
                <td className="px-3 py-2.5">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusBadge[a.status] || ''}`}>
                    {statusLabel[a.status] || a.status}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-text-secondary">
                  {a.responsibleContato || a.responsibleInterno || '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="text-sm text-text-tertiary py-6 text-center">Nenhuma atividade encontrada com este filtro.</div>
        )}
      </div>
    </div>
  )
}

function ProjectMilestonesList({ milestones }) {
  return (
    <div>
      <div className="text-xs font-medium text-text-tertiary uppercase tracking-wide mb-2">
        Milestones ({milestones.length})
      </div>
      <div className="space-y-1.5">
        {milestones.map(m => {
          const isOverdue = m.dueDate && m.dueDate < new Date().toISOString().split('T')[0] && m.status !== 'done'
          return (
            <div key={m.id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-bg-secondary text-sm">
              <Icons.Flag className={`w-3.5 h-3.5 flex-shrink-0 ${isOverdue ? 'text-donc-red' : 'text-text-tertiary'}`} />
              <span className="flex-1 text-text-primary">{m.title}</span>
              <div className="flex items-center gap-2">
                <div className="w-12 h-1.5 bg-bg-primary rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${progressBarColor(m.progress)}`} style={{ width: `${m.progress}%` }} />
                </div>
                <span className="text-xs text-text-secondary w-7 text-right tabular-nums">{m.progress}%</span>
              </div>
              {m.dueDate && (
                <span className={`text-xs flex-shrink-0 ${isOverdue ? 'text-donc-red' : 'text-text-tertiary'}`}>
                  {formatDate(m.dueDate)}
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function formatDate(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}
