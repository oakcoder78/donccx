import { useState } from 'react'
import { supabase } from '../../../../lib/supabaseClient'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '../../../ui/Button'
import { Badge } from '../../../ui/Badge'
import toast from 'react-hot-toast'

const statusVariant = { done: 'green', in_progress: 'sky', pending: 'slate' }
const statusLabel = { done: 'Concluído', in_progress: 'Em Andamento', pending: 'Pendente' }

export function ClientSubOnboarding({ client }) {
  const qc = useQueryClient()
  const phases = (client.onboarding_phases || []).sort((a,b) => a.display_order - b.display_order)

  async function toggleTask(taskId, done) {
    const { error } = await supabase.from('onboarding_tasks').update({ done }).eq('id', taskId)
    if (error) { toast.error(error.message); return }
    qc.invalidateQueries({ queryKey: ['client', String(client.id)] })
  }

  async function addPhase() {
    const name = prompt('Nome da fase:')
    if (!name) return
    const { error } = await supabase.from('onboarding_phases').insert({ client_id: client.id, name, display_order: phases.length })
    if (error) { toast.error(error.message); return }
    qc.invalidateQueries({ queryKey: ['client', String(client.id)] })
  }

  async function setPhaseStatus(phaseId, status) {
    const { error } = await supabase.from('onboarding_phases').update({ status }).eq('id', phaseId)
    if (error) { toast.error(error.message); return }
    qc.invalidateQueries({ queryKey: ['client', String(client.id)] })
  }

  if (phases.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-text-tertiary text-sm mb-4">Nenhuma fase de onboarding cadastrada.</p>
        <Button size="sm" onClick={addPhase}>+ Adicionar Fase</Button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" variant="secondary" onClick={addPhase}>+ Fase</Button>
      </div>
      {phases.map(phase => {
        const tasks = phase.onboarding_tasks || []
        const done = tasks.filter(t => t.done).length
        const pct = tasks.length ? Math.round((done/tasks.length)*100) : 0
        return (
          <div key={phase.id} className="border border-border-tertiary rounded-lg p-4">
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-text-primary">{phase.name}</span>
                {phase.is_parallel && <Badge variant="sky">Paralelo</Badge>}
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={phase.status}
                  onChange={e => setPhaseStatus(phase.id, e.target.value)}
                  className="text-xs border border-border-secondary rounded px-2 py-1 bg-bg-primary"
                >
                  <option value="pending">Pendente</option>
                  <option value="in_progress">Em Andamento</option>
                  <option value="done">Concluído</option>
                </select>
              </div>
            </div>

            {tasks.length > 0 && (
              <>
                <div className="h-1.5 bg-bg-tertiary rounded-full overflow-hidden mb-2">
                  <div className="h-full bg-donc-sky rounded-full" style={{ width: `${pct}%` }} />
                </div>
                <p className="text-xs text-text-tertiary mb-2">{done}/{tasks.length} · {pct}%</p>
                <div className="space-y-1">
                  {tasks.map(t => (
                    <label key={t.id} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={t.done}
                        onChange={e => toggleTask(t.id, e.target.checked)}
                        className="rounded accent-donc-sky"
                      />
                      <span className={`text-sm ${t.done ? 'line-through text-text-tertiary' : 'text-text-primary'}`}>{t.title}</span>
                    </label>
                  ))}
                </div>
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}
