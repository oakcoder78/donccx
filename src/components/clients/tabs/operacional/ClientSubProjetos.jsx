import { useState } from 'react'
import { useProjects, useProjectMutations } from '../../../../hooks/useProjects'
import { useMilestoneMutations } from '../../../../hooks/useMilestones'
import { useProfiles } from '../../../../hooks/useProfiles'
import { Button } from '../../../ui/Button'
import { Badge } from '../../../ui/Badge'
import { Modal } from '../../../ui/Modal'

const PROJ_STATUS = {
  planejado:    { label: 'Planejado',    variant: 'slate'  },
  em_andamento: { label: 'Em Andamento', variant: 'sky'    },
  concluido:    { label: 'Concluído',    variant: 'green'  },
  suspenso:     { label: 'Suspenso',     variant: 'amber'  },
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
const EMPTY_MS = { title: '', due_date: '', status: 'planejado' }

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
  const { data: projects = [], isLoading } = useProjects(client.id)
  const { createProject, updateProject, removeProject } = useProjectMutations(client.id)
  const { createMilestone, updateMilestone, removeMilestone, toggleTask, createTask } =
    useMilestoneMutations(client.id)
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

  // projeto modal
  const [showProjModal, setShowProjModal] = useState(false)
  const [editProj, setEditProj]           = useState(null)
  const [projForm, setProjForm]           = useState(EMPTY_PROJ)

  function openCreateProj() {
    setEditProj(null)
    setProjForm({ ...EMPTY_PROJ, responsible_id: client.csm_id || '' })
    setShowProjModal(true)
  }
  function openEditProj(p) {
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
    setMsForm({ title: m.title, due_date: m.due_date || '', status: m.status })
    setShowMsModal(true)
  }

  async function handleSaveMs() {
    if (editMs) {
      await updateMilestone.mutateAsync({ id: editMs.id, ...msForm })
    } else {
      await createMilestone.mutateAsync({ ...msForm, project_id: msProjectId })
    }
    setShowMsModal(false)
  }

  // tarefas inline
  const [newTask, setNewTask] = useState({})

  async function addTask(milestoneId) {
    const t = newTask[milestoneId]?.trim()
    if (!t) return
    await createTask.mutateAsync({ milestone_id: milestoneId, title: t })
    setNewTask(p => ({ ...p, [milestoneId]: '' }))
  }

  if (isLoading) return <p className="text-sm text-text-tertiary py-8 text-center">Carregando...</p>

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" onClick={openCreateProj}>+ Novo Projeto</Button>
      </div>

      {projects.length === 0 && (
        <p className="text-center py-12 text-text-tertiary">Nenhum projeto cadastrado.</p>
      )}

      {projects.map(proj => {
        const isOpen     = openSet.has(proj.id)
        const milestones = proj.milestones ?? []
        const totalMs    = milestones.length
        const doneMs     = milestones.filter(m => m.status === 'done').length
        const pct        = totalMs ? Math.round((doneMs / totalMs) * 100) : 0
        const ps         = PROJ_STATUS[proj.status] ?? PROJ_STATUS.em_andamento

        return (
          <div key={proj.id} className="border border-border-tertiary rounded-lg overflow-hidden">
            {/* Cabeçalho do projeto */}
            <button
              onClick={() => toggleProj(proj.id)}
              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-bg-tertiary transition-colors focus-visible:outline-none"
            >
              <ChevronIcon open={isOpen} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-text-primary truncate">{proj.title}</span>
                  <Badge variant={ps.variant}>{ps.label}</Badge>
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
              <div className="flex items-center gap-2 flex-shrink-0" onClick={e => e.stopPropagation()}>
                <button
                  onClick={() => openEditProj(proj)}
                  className="text-xs text-donc-sky hover:underline px-1"
                >Editar</button>
                <button
                  onClick={() => handleDeleteProj(proj.id)}
                  className="text-xs text-donc-red hover:underline px-1"
                >Excluir</button>
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
                  const tasks   = m.milestone_tasks ?? []
                  const done    = tasks.filter(t => t.done).length
                  const msPct   = tasks.length ? Math.round((done / tasks.length) * 100) : m.progress || 0
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

                      {tasks.length > 0 && (
                        <>
                          <div className="h-1.5 bg-bg-tertiary rounded-full overflow-hidden mb-1">
                            <div className="h-full bg-donc-sky rounded-full" style={{ width: `${msPct}%` }} />
                          </div>
                          <p className="text-xs text-text-tertiary mb-2">{done}/{tasks.length} · {msPct}%</p>
                          <div className="space-y-1 mb-2">
                            {tasks.map(t => (
                              <label key={t.id} className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={t.done}
                                  onChange={e => toggleTask.mutate({ id: t.id, done: e.target.checked })}
                                  className="rounded accent-donc-sky"
                                />
                                <span className={`text-sm ${t.done ? 'line-through text-text-tertiary' : 'text-text-primary'}`}>
                                  {t.title}
                                </span>
                              </label>
                            ))}
                          </div>
                        </>
                      )}

                      <div className="flex gap-2 mt-2">
                        <input
                          value={newTask[m.id] || ''}
                          onChange={e => setNewTask(p => ({ ...p, [m.id]: e.target.value }))}
                          placeholder="Nova tarefa..."
                          className="input-base flex-1 text-xs"
                          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTask(m.id) } }}
                        />
                        <Button size="sm" variant="ghost" onClick={() => addTask(m.id)}>+</Button>
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

      {/* Modal: Projeto */}
      <Modal
        isOpen={showProjModal}
        onClose={() => setShowProjModal(false)}
        title={editProj ? 'Editar Projeto' : 'Novo Projeto'}
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
    </div>
  )
}
