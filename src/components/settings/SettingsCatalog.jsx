import { useState } from 'react'
import { Icons } from '../../lib/icons'
import { useCatalog, useCatalogMutations } from '../../hooks/useCatalog'
import { useAuth } from '../../contexts/AuthContext'
import { Button } from '../ui/Button'
import { Modal } from '../ui/Modal'
import { PageSpinner } from '../ui/Spinner'
import { SettingsSectionHeader } from './SettingsSectionHeader'

function CatalogForm({ item, onClose }) {
  const isEdit = !!item
  const [form, setForm] = useState({ type: 'servico', name: '', color: '#173557', ...item })
  const { create, update } = useCatalogMutations()

  async function handleSubmit(e) {
    e.preventDefault()
    if (isEdit) await update.mutateAsync({ id: item.id, ...form })
    else await create.mutateAsync(form)
    onClose()
  }

  return (
    <Modal isOpen onClose={onClose} title={isEdit ? 'Editar Item' : 'Novo Item'} maxWidth="max-w-sm">
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="label-sm">Tipo</label>
          <select value={form.type} onChange={e => setForm(p => ({...p, type: e.target.value}))} className="input-base w-full">
            <option value="servico">Serviço</option>
            <option value="solucao">Solução</option>
          </select>
        </div>
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
        <div className="flex justify-end gap-2 pt-2 border-t border-border-tertiary">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit">Salvar</Button>
        </div>
      </form>
    </Modal>
  )
}

export function SettingsCatalog() {
  const CatalogIcon = Icons.Package
  const { data: catalog = [], isLoading } = useCatalog()
  const { remove } = useCatalogMutations()
  const { isManager } = useAuth()
  const [modal, setModal] = useState(null) // null | 'create' | item

  if (isLoading) return <PageSpinner />

  const servicos = catalog.filter(c => c.type === 'servico')
  const solucoes = catalog.filter(c => c.type === 'solucao')

  return (
    <div className="max-w-2xl space-y-4">
      <SettingsSectionHeader
        icon={CatalogIcon}
        title="Catálogos"
        subtitle="Gerencie os serviços e soluções disponíveis para uso em projetos e contratos."
        actions={
          isManager && (
            <Button size="sm" onClick={() => setModal('create')}>
              + Novo Item
            </Button>
          )
        }
      />

      {[{ label: 'Serviços', items: servicos }, { label: 'Soluções', items: solucoes }].map(({ label, items }) => (
        <div key={label} className="bg-bg-primary border border-border-tertiary rounded-lg p-4">
          <h3 className="text-sm font-semibold text-text-primary mb-3">{label}</h3>
          <div className="space-y-2">
            {items.map(item => (
              <div key={item.id} className="flex items-center gap-3 py-1.5">
                <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }} />
                <span className="text-sm text-text-primary flex-1">{item.name}</span>
                {isManager && (
                  <>
                    <button
                      onClick={() => setModal(item)}
                      title="Editar"
                      className="p-1 text-text-secondary hover:text-donc-sky rounded"
                    >
                      <Icons.Pencil size={14} />
                    </button>
                    <button
                      onClick={() => remove.mutateAsync(item.id)}
                      title="Excluir"
                      className="p-1 text-text-secondary hover:text-red-500 rounded"
                    >
                      <Icons.Trash2 size={14} />
                    </button>
                  </>
                )}
              </div>
            ))}
            {items.length === 0 && <p className="text-sm text-text-tertiary">Nenhum item.</p>}
          </div>
        </div>
      ))}

      {modal && (
        <CatalogForm item={modal === 'create' ? null : modal} onClose={() => setModal(null)} />
      )}
    </div>
  )
}
