import { useState } from 'react'
import { useMilestones, useMilestoneMutations } from '../../../../hooks/useMilestones'
import { Button } from '../../../ui/Button'
import { Badge } from '../../../ui/Badge'
import { Modal } from '../../../ui/Modal'

const statusVariant = { done: 'green', em_andamento: 'sky', planejado: 'slate' }
const statusLabel = { done: 'Concluído', em_andamento: 'Em Andamento', planejado: 'Planejado' }

function formatDate(d) {
  if (!d) return null
  return new Date(d + 'T00:00:00').toLocaleDateString('pt-BR')
}

export function ClientSubProjetos({ client }) {
  const { data: milestones = [] } = useMilestones(client.id)
  const { createMilestone, updateMilestone, removeMilestone, toggleTask, createTask } = useMilestoneMutations(client.id)
  const [showModal, setShowModal] = useState(false)
  const [editMs, setEditMs] = useState(null)
  const [form, setForm] = useState({ title: '', due_date: '', status: 'planejado' })
  const [newTask, setNewTask] = useState({})

  function openCreate() { setEditMs(null); setForm({ title: '', due_date: '', status: 'planejado' }); setShowModal(true) }
  function openEdit(m) { setEditMs(m); setForm({ title: m.title, due_date: m.due_date || '', status: m.status }); setShowModal(true) }

  async function handleSave() {
    if (editMs) await updateMilestone.mutateAsync({ id: editMs.id, ...form })
    else await createMilestone.mutateAsync(form)
    setShowModal(false)
  }

  async function addTask(milestoneId) {
    const t = newTask[milestoneId]?.trim()
    if (!t) return
    await createTask.mutateAsync({ milestone_id: milestoneId, title: t })
    setNewTask(p => ({ ...p, [milestoneId]: '' }))
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" onClick={openCreate}>+ Novo Milestone</Button>
      </div>

      {milestones.length === 0 && <p className="text-center py-12 text-text-tertiary">Nenhum milestone.</p>}

      {milestones.map(m => {
        const tasks = m.milestone_tasks || []
        const done = tasks.filter(t => t.done).length
        const pct = tasks.length ? Math.round((done/tasks.length)*100) : m.progress || 0

        return (
          <div key={m.id} className="border border-border-tertiary rounded-lg p-4">
            <div className="flex items-start justify-between gap-2 mb-2">
              <div>
                <h4 className="text-sm font-semibold text-text-primary">{m.title}</h4>
                {m.due_date && <p className="text-xs text-text-tertiary">{formatDate(m.due_date)}</p>}
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={statusVariant[m.status]}>{statusLabel[m.status]}</Badge>
                <button onClick={() => openEdit(m)} className="text-xs text-donc-sky hover:underline">Editar</button>
                <button onClick={() => removeMilestone.mutateAsync(m.id)} className="text-xs text-donc-red hover:underline">Excluir</button>
              </div>
            </div>

            {tasks.length > 0 && (
              <>
                <div className="h-1.5 bg-bg-tertiary rounded-full overflow-hidden mb-1">
                  <div className="h-full bg-donc-sky rounded-full" style={{ width: `${pct}%` }} />
                </div>
                <p className="text-xs text-text-tertiary mb-2">{done}/{tasks.length} · {pct}%</p>
                <div className="space-y-1 mb-2">
                  {tasks.map(t => (
                    <label key={t.id} className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={t.done} onChange={e => toggleTask.mutate({ id: t.id, done: e.target.checked })}
                        className="rounded accent-donc-sky" />
                      <span className={`text-sm ${t.done ? 'line-through text-text-tertiary' : 'text-text-primary'}`}>{t.title}</span>
                    </label>
                  ))}
                </div>
              </>
            )}

            <div className="flex gap-2 mt-2">
              <input value={newTask[m.id] || ''} onChange={e => setNewTask(p => ({ ...p, [m.id]: e.target.value }))}
                placeholder="Nova tarefa..." className="input-base flex-1 text-xs"
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTask(m.id) }}} />
              <Button size="sm" variant="ghost" onClick={() => addTask(m.id)}>+</Button>
            </div>
          </div>
        )
      })}

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editMs ? 'Editar Milestone' : 'Novo Milestone'} maxWidth="max-w-md">
        <div className="space-y-3">
          <div>
            <label className="label-sm">Título *</label>
            <input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} className="input-base w-full" />
          </div>
          <div>
            <label className="label-sm">Data Prevista</label>
            <input type="date" value={form.due_date} onChange={e => setForm(p => ({ ...p, due_date: e.target.value }))} className="input-base w-full" />
          </div>
          <div>
            <label className="label-sm">Status</label>
            <select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))} className="input-base w-full">
              <option value="planejado">Planejado</option>
              <option value="em_andamento">Em Andamento</option>
              <option value="done">Concluído</option>
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-border-tertiary">
            <Button variant="secondary" onClick={() => setShowModal(false)}>Cancelar</Button>
            <Button onClick={handleSave}>Salvar</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
