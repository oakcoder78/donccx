import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useProjects, useProjectMutations } from '../../../../hooks/useProjects'
import { useProfiles } from '../../../../hooks/useProfiles'
import { Button } from '../../../ui/Button'
import { Badge } from '../../../ui/Badge'
import { Modal } from '../../../ui/Modal'
import { ProjectModal } from '../../../projects/ProjectModal'
import { BriefPanel } from '../../../brief'
import { useBrief, useBriefUnansweredCount } from '../../../../hooks/useBrief'
import { Icons } from '../../../../lib/icons'

const PROJ_STATUS = {
  planejado:    { label: 'Planejado',    variant: 'slate'  },
  em_andamento: { label: 'Em Andamento', variant: 'sky'    },
  concluido:    { label: 'Concluído',    variant: 'green'  },
  suspenso:     { label: 'Suspenso',     variant: 'amber'  },
}

const PROJ_TYPE = {
  onboarding: { label: 'Onboarding', variant: 'sky'    },
  expansao:   { label: 'Expansão',   variant: 'violet' },
  interno:    { label: 'Interno',    variant: 'slate'  },
}

const MS_STATUS = {
  planejado:    { label: 'Planejado',    variant: 'slate' },
  em_andamento: { label: 'Em Andamento', variant: 'sky'   },
  done:         { label: 'Concluído',    variant: 'green' },
}

const EMPTY_PROJ = {
  title: '', description: '', responsible_id: '',
  start_date: '', end_date: '', status: 'em_andamento',
}
const EMPTY_MS = { title: '', description: '', responsible_id: '', due_date: '', status: 'planejado' }

function formatDate(d) {
  if (!d) return null
  return new Date(d + 'T00:00:00').toLocaleDateString('pt-BR')
}

function ChevronIcon({ open }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none"
      className="transition-transform duration-200 flex-shrink-0"
      style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}>
      <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function ClientSubProjetos({ client }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { data: projects = [], isLoading } = useProjects(client.id)
  const { createProject, updateProject, removeProject } = useProjectMutations(client.id)
  const { createMilestone, updateMilestone, removeMilestone } =
    useProjectMutations(client.id)
  const { data: profiles = [] } = useProfiles()

  // accordion
  const [openSet, setOpenSet] = useState(new Set())
  function toggleProj(id) {
    setOpenSet(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  // new project modal (ProjectModal handles onboarding/expansao/interno flows)
  const [showProjectModal, setShowProjectModal] = useState(false)

  // edit via ProjectModal (onboarding / expansao)
  const [editOnbProject, setEditOnbProject] = useState(null)

  // edit project modal (inline, simple — interno only)
  const [showProjModal, setShowProjModal] = useState(false)
  const [editProj, setEditProj]           = useState(null)
  const [projForm, setProjForm]           = useState(EMPTY_PROJ)

  // brief panel modal
  const [showBriefPanel, setShowBriefPanel] = useState(false)
  const [briefProject, setBriefProject]     = useState(null)

  // brief data
  const { briefInstances } = useBrief(briefProject?.onboarding_id, client.id)
  const instanceIds = briefInstances?.map(i => i.id) || []
  const { data: unansweredDoubts = 0 } = useBriefUnansweredCount(instanceIds)

  function openEditProj(p) {
    if (p.type === 'onboarding' || p.type === 'expansao') {
      setEditOnbProject(p)
      return
    }
    setEditProj(p)
    setProjForm({
      title:          p.title,
      description:    p.description || '',
      responsible_id: p.responsible_id || '',
      start_date:     p.start_date || '',
      end_date:       p.end_date   || '',
      status:         p.status,
    })
    setShowProjModal(true)
  }

  async function handleSaveProj() {
    const payload = { ...projForm }
    if (!payload.responsible_id) delete payload.responsible_id
    if (!payload.start_date)     delete payload.start_date
    if (!payload.end_date)       delete payload.end_date
    if (!payload.description)    delete payload.description
    if (editProj) await updateProject.mutateAsync({ id: editProj.id, ...payload })
    else          await createProject.mutateAsync(payload)
    setShowProjModal(false)
  }

  async function handleDeleteProj(id) {
    if (!window.confirm('Remover projeto e desvincular seus milestones?')) return
    await removeProject.mutateAsync(id)
  }

  // milestone modal
  const [showMsModal,  setShowMsModal]  = useState(false)
  const [editMs,       setEditMs]       = useState(null)
  const [msProjectId,  setMsProjectId]  = useState(null)
  const [msForm,       setMsForm]       = useState(EMPTY_MS)

  function openCreateMs(projectId) {
    setEditMs(null)
    setMsProjectId(projectId)
    setMsForm(EMPTY_MS)
    setShowMsModal(true)
  }
  function openEditMs(m) {
    setEditMs(m)
    setMsProjectId(m.project_id)
    setMsForm({
      title:          m.title,
      description:    m.description    || '',
      responsible_id: m.responsible_id || '',
      due_date:       m.due_date       || '',
      status:         m.status,
    })
    setShowMsModal(true)
  }

  

  async function handleSaveMs() {
    const payload = { ...msForm }
    if (!payload.responsible_id) delete payload.responsible_id
    if (!payload.description)    delete payload.description
    if (!payload.due_date)       delete payload.due_date

    if (editMs) {
      await updateMilestone.mutateAsync({ id: editMs.id, ...payload })
    } else {
      await createMilestone.mutateAsync({ ...payload, project_id: msProjectId })
    }
    setShowMsModal(false)
  }

  

  if (isLoading) return <p className="text-sm text-text-tertiary py-8 text-center">Carregando...</p>

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setShowProjectModal(true)}>+ Novo Projeto</Button>
      </div>

      {projects.length === 0 && (
        <p className="text-center py-12 text-text-tertiary">Nenhum projeto cadastrado.</p>
      )}

      {projects.map(proj => {
        const isOpen     = openSet.has(proj.id)
        let totalMs    = 0
        let doneMs     = 0
        let pct        = 0
        if (proj.onboarding_id && proj.onboarding_fases) {
          const fases = proj.onboarding_fases
          totalMs = fases.length
          doneMs  = fases.filter(f => f.status === 'concluida').length
          pct     = totalMs ? Math.round((doneMs / totalMs) * 100) : 0
        }
        const ps         = PROJ_STATUS[proj.status] ?? PROJ_STATUS.em_andamento

        return (
          <div key={proj.id} className="border border-border-tertiary rounded-lg overflow-hidden">
            {/* Cabeçalho do projeto */}
            <button
              onClick={() => {
                if (proj.type === 'onboarding' || proj.type === 'expansao') {
                  navigate('/projetos/' + proj.id, { state: { from: location.pathname + location.search } })
                } else {
                  toggleProj(proj.id)
                }
              }}
              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-bg-tertiary transition-colors focus-visible:outline-none"
            >
              <ChevronIcon open={isOpen} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-text-primary truncate">{proj.title}</span>
                  <Badge variant={ps.variant}>{ps.label}</Badge>
                  {proj.type && PROJ_TYPE[proj.type] && (
                    <Badge variant={PROJ_TYPE[proj.type].variant}>{PROJ_TYPE[proj.type].label}</Badge>
                  )}
                  {proj.responsible && (
                    <span className="text-xs text-text-tertiary">· {proj.responsible.name}</span>
                  )}
                  {proj.end_date && (
                    <span className="text-xs text-text-tertiary">· até {formatDate(proj.end_date)}</span>
                  )}
                </div>
                {totalMs > 0 && (
                  <div className="flex items-center gap-2 mt-1.5">
                    <div className="flex-1 h-1.5 bg-bg-tertiary rounded-full overflow-hidden">
                      <div
                        className="h-full bg-donc-sky rounded-full transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-xs text-text-tertiary whitespace-nowrap">
                      {doneMs}/{totalMs} · {pct}%
                    </span>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
                {proj.onboarding_id && (
                  <div className="relative">
                    <button
                      onClick={() => { setBriefProject(proj); setShowBriefPanel(true) }}
                      className="p-1.5 rounded-md hover:bg-donc-sky/10 text-text-secondary transition-colors"
                      title="Questionários"
                    >
                      <Icons.ClipboardList className="w-4 h-4" />
                    </button>
                  </div>
                )}
                <button
                  onClick={() => openEditProj(proj)}
                  className="p-1.5 rounded-md hover:bg-bg-secondary text-text-secondary transition-colors"
                  title="Editar"
                >
                  <Icons.Pencil className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDeleteProj(proj.id)}
                  className="p-1.5 rounded-md hover:bg-red-50 text-text-tertiary hover:text-donc-red transition-colors"
                  title="Excluir"
                >
                  <Icons.Trash2 className="w-4 h-4" />
                </button>
              </div>
            </button>

            {/* Conteúdo expandido */}
            {isOpen && (
              <div className="border-t border-border-tertiary px-4 py-3 space-y-3 bg-bg-primary">
                {proj.description && (
                  <p className="text-xs text-text-secondary">{proj.description}</p>
                )}

                {milestones.length === 0 && (
                  <p className="text-xs text-text-tertiary italic">Nenhum milestone neste projeto.</p>
                )}

                {milestones.map(m => {
                  const msPct   = m.progress || 0
                  const ms      = MS_STATUS[m.status] ?? MS_STATUS.planejado

                  return (
                    <div key={m.id} className="border border-border-tertiary rounded-md p-3">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div>
                          <h4 className="text-sm font-medium text-text-primary">{m.title}</h4>
                          {m.due_date && (
                            <p className="text-xs text-text-tertiary">{formatDate(m.due_date)}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <Badge variant={ms.variant}>{ms.label}</Badge>
                          <button
                            onClick={() => openEditMs(m)}
                            className="text-xs text-donc-sky hover:underline"
                          >Editar</button>
                          <button
                            onClick={() => removeMilestone.mutateAsync(m.id)}
                            className="text-xs text-donc-red hover:underline"
                          >Excluir</button>
                        </div>
                      </div>

                      
                    </div>
                  )
                })}

                <div className="pt-1">
                  <Button size="sm" variant="secondary" onClick={() => openCreateMs(proj.id)}>
                    + Novo Milestone
                  </Button>
                </div>
              </div>
            )}
          </div>
        )
      })}

      {/* Modal: Novo Projeto (onboarding / expansao / interno flow) */}
      <ProjectModal
        isOpen={showProjectModal}
        onClose={() => setShowProjectModal(false)}
        clientId={client.id}
      />

      {/* Modal: Editar Projeto (onboarding / expansao via ProjectModal) */}
      <ProjectModal
        isOpen={!!editOnbProject}
        onClose={() => setEditOnbProject(null)}
        clientId={client.id}
        project={editOnbProject}
      />

      {/* Modal: Editar Projeto (inline, simple) */}
      <Modal
        isOpen={showProjModal}
        onClose={() => setShowProjModal(false)}
        title="Editar Projeto"
        maxWidth="max-w-lg"
      >
        <div className="space-y-3">
          <div>
            <label className="label-sm">Título *</label>
            <input
              value={projForm.title}
              onChange={e => setProjForm(p => ({ ...p, title: e.target.value }))}
              className="input-base w-full"
              placeholder="Nome do projeto"
            />
          </div>
          <div>
            <label className="label-sm">Descrição</label>
            <textarea
              value={projForm.description}
              onChange={e => setProjForm(p => ({ ...p, description: e.target.value }))}
              className="input-base w-full resize-none"
              rows={2}
            />
          </div>
          <div>
            <label className="label-sm">Responsável</label>
            <select
              value={projForm.responsible_id}
              onChange={e => setProjForm(p => ({ ...p, responsible_id: e.target.value }))}
              className="input-base w-full"
            >
              <option value="">— Selecionar —</option>
              {profiles.map(pr => (
                <option key={pr.id} value={pr.id}>{pr.name}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label-sm">Data Início</label>
              <input
                type="date"
                value={projForm.start_date}
                onChange={e => setProjForm(p => ({ ...p, start_date: e.target.value }))}
                className="input-base w-full"
              />
            </div>
            <div>
              <label className="label-sm">Data Fim</label>
              <input
                type="date"
                value={projForm.end_date}
                onChange={e => setProjForm(p => ({ ...p, end_date: e.target.value }))}
                className="input-base w-full"
              />
            </div>
          </div>
          <div>
            <label className="label-sm">Status</label>
            <select
              value={projForm.status}
              onChange={e => setProjForm(p => ({ ...p, status: e.target.value }))}
              className="input-base w-full"
            >
              <option value="planejado">Planejado</option>
              <option value="em_andamento">Em Andamento</option>
              <option value="concluido">Concluído</option>
              <option value="suspenso">Suspenso</option>
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-border-tertiary">
            <Button variant="secondary" onClick={() => setShowProjModal(false)}>Cancelar</Button>
            <Button
              onClick={handleSaveProj}
              disabled={!projForm.title.trim() || createProject.isPending || updateProject.isPending}
            >
              Salvar
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal: Milestone */}
      <Modal
        isOpen={showMsModal}
        onClose={() => setShowMsModal(false)}
        title={editMs ? 'Editar Milestone' : 'Novo Milestone'}
        maxWidth="max-w-md"
      >
        <div className="space-y-3">
          <div>
            <label className="label-sm">Título *</label>
            <input
              value={msForm.title}
              onChange={e => setMsForm(p => ({ ...p, title: e.target.value }))}
              className="input-base w-full"
            />
          </div>
          <div>
            <label className="label-sm">Descrição</label>
            <textarea
              value={msForm.description}
              onChange={e => setMsForm(p => ({ ...p, description: e.target.value }))}
              className="input-base w-full resize-none"
              rows={2}
            />
          </div>
          <div>
            <label className="label-sm">Responsável</label>
            <select
              value={msForm.responsible_id}
              onChange={e => setMsForm(p => ({ ...p, responsible_id: e.target.value }))}
              className="input-base w-full"
            >
              <option value="">— Selecionar —</option>
              {profiles.map(pr => (
                <option key={pr.id} value={pr.id}>{pr.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label-sm">Data Prevista</label>
            <input
              type="date"
              value={msForm.due_date}
              onChange={e => setMsForm(p => ({ ...p, due_date: e.target.value }))}
              className="input-base w-full"
            />
          </div>
          <div>
            <label className="label-sm">Status</label>
            <select
              value={msForm.status}
              onChange={e => setMsForm(p => ({ ...p, status: e.target.value }))}
              className="input-base w-full"
            >
              <option value="planejado">Planejado</option>
              <option value="em_andamento">Em Andamento</option>
              <option value="done">Concluído</option>
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-border-tertiary">
            <Button variant="secondary" onClick={() => setShowMsModal(false)}>Cancelar</Button>
            <Button
              onClick={handleSaveMs}
              disabled={!msForm.title.trim() || createMilestone.isPending || updateMilestone.isPending}
            >
              Salvar
            </Button>
          </div>
        </div>
      </Modal>

      {/* Brief Panel Modal */}
      {showBriefPanel && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 200,
            background: 'rgba(0,0,0,0.45)',
            display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
            padding: '48px 24px 24px',
            overflowY: 'auto',
          }}
          onClick={e => { if (e.target === e.currentTarget) { setShowBriefPanel(false); setBriefProject(null) } }}
        >
          <div style={{
            background: '#fff', borderRadius: 14, width: '100%', maxWidth: 660,
            boxShadow: '0 20px 60px rgba(0,0,0,0.2)', overflow: 'hidden',
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '16px 20px', borderBottom: '1px solid rgba(23,53,87,0.08)',
            }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#173557' }}>Questionários</div>
              <button
                onClick={() => { setShowBriefPanel(false); setBriefProject(null) }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, color: 'rgba(23,53,87,0.5)', borderRadius: 6 }}
              >
                <Icons.X size={17} />
              </button>
            </div>
            <div style={{ padding: '0 24px 24px' }}>
              <BriefPanel
                onboardingId={briefProject?.onboarding_id}
                clientId={client.id}
                clientName={client.fantasy_name || client.name}
                faseName={briefProject?.title || ''}
              />
            </div>
          </div>
        </div>
      )}
      
    </div>
  )
}
