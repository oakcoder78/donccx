import { useState } from 'react'
import { SettingsMenuIcons } from '../../lib/icons'
import { useStages, useStagesMutations } from '../../hooks/useStages'
import { Button } from '../ui/Button'
import { Modal } from '../ui/Modal'
import { PageSpinner } from '../ui/Spinner'
import { SettingsSectionHeader } from './SettingsSectionHeader'
import { Pencil, Trash2 } from 'lucide-react'

function StageForm({ stage, onClose }) {
  const isEdit = !!stage
  const [form, setForm] = useState({ name: '', color: '#59c2ed', description: '', display_order: 0, ...stage })
  const { create, update } = useStagesMutations()

  async function handleSubmit(e) {
    e.preventDefault()
    if (isEdit) await update.mutateAsync({ id: stage.id, ...form })
    else await create.mutateAsync(form)
    onClose()
  }

  return (
    <Modal isOpen onClose={onClose} title={isEdit ? 'Editar Estágio' : 'Novo Estágio'} maxWidth="max-w-sm">
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="label-sm">Nome *</label>
          <input value={form.name} onChange={e => setForm(p => ({...p, name: e.target.value}))} required className="input-base w-full" />
        </div>
        <div>
          <label className="label-sm">Cor</label>
          <div className="flex gap-2 items-center">
            <input type="color" value={form.color} onChange={e => setForm(p => ({...p, color: e.target.value}))} className="h-9 w-12 rounded cursor-pointer border border-border-secondary" />
            <input value={form.color} onChange={e => setForm(p => ({...p, color: e.target.value}))} className="input-base flex-1" />
          </div>
        </div>
        <div>
          <label className="label-sm">Descrição</label>
          <input value={form.description} onChange={e => setForm(p => ({...p, description: e.target.value}))} className="input-base w-full" />
        </div>
        <div>
          <label className="label-sm">Ordem</label>
          <input type="number" value={form.display_order} onChange={e => setForm(p => ({...p, display_order: Number(e.target.value)}))} className="input-base w-full" />
        </div>
        <div className="flex justify-end gap-2 pt-2 border-t border-border-tertiary">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit">Salvar</Button>
        </div>
      </form>
    </Modal>
  )
}

export function SettingsStages() {
  const StagesIcon = SettingsMenuIcons['stages']
  const { data: stages = [], isLoading } = useStages()
  const { remove } = useStagesMutations()
  const { isAdmin } = useAuth()
  const [modal, setModal] = useState(null)

  if (isLoading) return <PageSpinner />

  return (
    <div className="max-w-2xl space-y-4">
      <SettingsSectionHeader
        icon={StagesIcon}
        title="Estágios"
        subtitle="Define os estágios utilizados no ciclo de vida das empresas."
        actions={
          isAdmin && (
            <Button
              size="sm"
              onClick={() => {
                setModal('create')
              }}
            >
              + Novo Estágio
            </Button>
          )
        }
      />

      <div className="bg-bg-primary border border-border-tertiary rounded-lg p-4">
        <div className="space-y-2">
          {stages.map(s => (
            <div key={s.id} className="flex items-center gap-3 py-1.5">
              <span className="w-4 h-4 rounded" style={{ backgroundColor: s.color }} />
              <span className="text-xs text-text-tertiary w-6">#{s.display_order}</span>
              <span className="text-sm text-text-primary flex-1">{s.name}</span>
              {s.description && <span className="text-xs text-text-tertiary">{s.description}</span>}
              {isAdmin && (
                <>
                  <button
                    onClick={() => setModal(s)}
                    title="Editar"
                    className="p-1 text-text-secondary hover:text-donc-sky rounded"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => remove.mutateAsync(s.id)}
                    title="Excluir"
                    className="p-1 text-text-secondary hover:text-red-500 rounded"
                  >
                    <Trash2 size={14} />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      </div>

      {modal && <StageForm stage={modal === 'create' ? null : modal} onClose={() => setModal(null)} />}
    </div>
  )
}
