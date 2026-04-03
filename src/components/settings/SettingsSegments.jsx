import { useState } from 'react'
import { useSegments, useSegmentsMutations } from '../../hooks/useSegments'
import { Button } from '../ui/Button'
import { Modal } from '../ui/Modal'
import { PageSpinner } from '../ui/Spinner'

function SegmentForm({ segment, onClose }) {
  const isEdit = !!segment
  const [name, setName] = useState(segment?.name || '')
  const { create, update } = useSegmentsMutations()

  async function handleSubmit(e) {
    e.preventDefault()
    if (isEdit) await update.mutateAsync({ id: segment.id, name })
    else await create.mutateAsync(name)
    onClose()
  }

  return (
    <Modal isOpen onClose={onClose} title={isEdit ? 'Editar Segmento' : 'Novo Segmento'} maxWidth="max-w-sm">
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="label-sm">Nome *</label>
          <input value={name} onChange={e => setName(e.target.value)} required className="input-base w-full" autoFocus />
        </div>
        <div className="flex justify-end gap-2 pt-2 border-t border-border-tertiary">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit">Salvar</Button>
        </div>
      </form>
    </Modal>
  )
}

export function SettingsSegments() {
  const { data: segments = [], isLoading } = useSegments()
  const { remove } = useSegmentsMutations()
  const [modal, setModal] = useState(null) // null | 'create' | segment

  if (isLoading) return <PageSpinner />

  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-text-primary">🏷️ Segmentos</h2>
        <Button size="sm" onClick={() => setModal('create')}>+ Novo Segmento</Button>
      </div>

      <div className="bg-bg-primary border border-border-tertiary rounded-lg p-4">
        <div className="space-y-2">
          {segments.map(seg => (
            <div key={seg.id} className="flex items-center gap-3 py-1.5 border-b border-border-tertiary last:border-0">
              <span className="text-sm text-text-primary flex-1">{seg.name}</span>
              <button onClick={() => setModal(seg)} className="text-xs text-donc-sky hover:underline">Editar</button>
              <button onClick={() => remove.mutateAsync(seg.id)} className="text-xs text-donc-red hover:underline">Excluir</button>
            </div>
          ))}
          {segments.length === 0 && <p className="text-sm text-text-tertiary">Nenhum segmento cadastrado.</p>}
        </div>
      </div>

      {modal && (
        <SegmentForm segment={modal === 'create' ? null : modal} onClose={() => setModal(null)} />
      )}
    </div>
  )
}
