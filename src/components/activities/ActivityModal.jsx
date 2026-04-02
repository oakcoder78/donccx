import { useState } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { useActivityMutations } from '../../hooks/useActivities'
import { useClients } from '../../hooks/useClients'
import { useProfiles } from '../../hooks/useProfiles'
import { useContacts } from '../../hooks/useContacts'

const TYPES = [
  { value: 'reuniao', label: 'Reunião' },
  { value: 'ligacao', label: 'Ligação' },
  { value: 'email', label: 'E-mail' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'tarefa', label: 'Tarefa' },
  { value: 'nota', label: 'Nota' },
]

const TODAY = new Date().toISOString().split('T')[0]

export function ActivityModal({ onClose, activity, defaultClientId }) {
  const isEdit = !!activity
  const [form, setForm] = useState({
    type: activity?.type || 'reuniao',
    title: activity?.title || '',
    description: activity?.description || '',
    client_id: activity?.client_id || defaultClientId || '',
    contact_id: activity?.contact_id || '',
    responsible_id: activity?.responsible_id || '',
    activity_date: activity?.activity_date || TODAY,
    activity_time: activity?.activity_time || '',
    status: activity?.status || 'pendente',
    due_date: activity?.due_date || '',
    notes: activity?.notes || '',
  })

  const { create, update } = useActivityMutations()
  const { data: clients = [] } = useClients()
  const { data: profiles = [] } = useProfiles()
  const { data: contacts = [] } = useContacts(form.client_id ? { client_id: Number(form.client_id) } : {})

  function handleChange(e) {
    const { name, value } = e.target
    setForm(prev => ({ ...prev, [name]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const payload = {
      ...form,
      client_id: form.client_id ? Number(form.client_id) : null,
      contact_id: form.contact_id ? Number(form.contact_id) : null,
      responsible_id: form.responsible_id || null,
    }
    if (isEdit) await update.mutateAsync({ id: activity.id, ...payload })
    else await create.mutateAsync(payload)
    onClose()
  }

  const isMutating = create.isPending || update.isPending

  return (
    <Modal isOpen onClose={onClose} title={isEdit ? 'Editar Atividade' : 'Nova Atividade'} maxWidth="max-w-2xl">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="label-sm">Tipo *</label>
            <select name="type" value={form.type} onChange={handleChange} className="input-base w-full">
              {TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label className="label-sm">Data *</label>
            <input name="activity_date" type="date" value={form.activity_date} onChange={handleChange} required className="input-base w-full" />
          </div>
          <div>
            <label className="label-sm">Hora</label>
            <input name="activity_time" type="time" value={form.activity_time} onChange={handleChange} className="input-base w-full" />
          </div>
        </div>

        <div>
          <label className="label-sm">Título</label>
          <input name="title" value={form.title} onChange={handleChange} className="input-base w-full" placeholder="Título opcional" />
        </div>

        <div>
          <label className="label-sm">Descrição *</label>
          <textarea name="description" value={form.description} onChange={handleChange} required rows={3}
            className="input-base w-full resize-none" placeholder="Descreva a atividade..." />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label-sm">Status</label>
            <select name="status" value={form.status} onChange={handleChange} className="input-base w-full">
              <option value="pendente">Pendente</option>
              <option value="concluida">Concluída</option>
            </select>
          </div>
          <div>
            <label className="label-sm">Vencimento</label>
            <input name="due_date" type="date" value={form.due_date} onChange={handleChange} className="input-base w-full" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label-sm">Cliente *</label>
            <select name="client_id" value={form.client_id} onChange={handleChange} required className="input-base w-full">
              <option value="">Selecionar cliente</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label-sm">Contato</label>
            <select name="contact_id" value={form.contact_id} onChange={handleChange} className="input-base w-full" disabled={!form.client_id}>
              <option value="">Sem contato</option>
              {contacts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="label-sm">Responsável</label>
          <select name="responsible_id" value={form.responsible_id} onChange={handleChange} className="input-base w-full">
            <option value="">Sem responsável</option>
            {profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>

        <div>
          <label className="label-sm">Resultado / Notas</label>
          <textarea name="notes" value={form.notes} onChange={handleChange} rows={2}
            className="input-base w-full resize-none" />
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-border-tertiary">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={isMutating}>{isMutating ? 'Salvando...' : isEdit ? 'Salvar' : 'Criar Atividade'}</Button>
        </div>
      </form>
    </Modal>
  )
}
