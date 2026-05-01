import { useState, useEffect } from 'react'
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd'
import { Pencil, Trash2 } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { SettingsMenuIcons } from '../../lib/icons'
import { useAuth } from '../../contexts/AuthContext'
import { PageSpinner } from '../ui/Spinner'
import { Button } from '../ui/Button'
import { SettingsSectionHeader } from './SettingsSectionHeader'
import toast from 'react-hot-toast'

const EMPTY = { nome: '', descricao: '', display_order: 0, ativo: true }

function Toggle({ value, onChange, disabled }) {
  return (
    <div
      role="switch"
      aria-checked={value}
      onClick={() => !disabled && onChange(!value)}
      style={{
        width: 36, height: 20, borderRadius: 10, flexShrink: 0,
        backgroundColor: value ? '#173557' : '#d4d3ce',
        position: 'relative', transition: 'background 0.2s',
        cursor: disabled ? 'default' : 'pointer',
        display: 'inline-block',
      }}
    >
      <div style={{
        position: 'absolute', top: 2, left: value ? 18 : 2,
        width: 16, height: 16, borderRadius: '50%', backgroundColor: '#fff',
        transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
      }} />
    </div>
  )
}

function InlineForm({ form, setForm, onSave, onCancel, saving }) {
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="label-sm">Nome *</label>
          <input
            value={form.nome}
            onChange={e => set('nome', e.target.value)}
            className="input-base w-full"
            placeholder="Nome do tipo"
          />
        </div>
        <div>
          <label className="label-sm">Descrição</label>
          <input
            value={form.descricao}
            onChange={e => set('descricao', e.target.value)}
            className="input-base w-full"
            placeholder="Opcional"
          />
        </div>
        <div>
          <label className="label-sm">Ordem</label>
          <input
            type="number"
            value={form.display_order}
            onChange={e => set('display_order', e.target.value)}
            className="input-base w-24"
            min="0"
          />
        </div>
      </div>
      <div className="flex items-center gap-6">
        <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer select-none">
          <Toggle value={form.ativo} onChange={v => set('ativo', v)} />
          Ativo
        </label>
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={onSave} disabled={saving}>
          {saving ? 'Salvando...' : 'Salvar'}
        </Button>
        <Button size="sm" variant="secondary" onClick={onCancel} disabled={saving}>
          Cancelar
        </Button>
      </div>
    </div>
  )
}

export function SettingsActivityTypes() {
  const ActivityIcon = SettingsMenuIcons['activity-types']
  const { isAdmin } = useAuth()

  const [items, setItems]           = useState([])
  const [loading, setLoading]       = useState(true)
  const [adding, setAdding]         = useState(false)
  const [newForm, setNewForm]       = useState(EMPTY)
  const [editingId, setEditingId]   = useState(null)
  const [editForm, setEditForm]     = useState({})
  const [saving, setSaving]         = useState(false)
  const [deletingId, setDeletingId] = useState(null)

  async function load() {
    setLoading(true)
    const { data, error } = await supabase
      .from('onboarding_activity_types')
      .select('*')
      .order('display_order')
    if (error) toast.error(error.message)
    else setItems(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function startEdit(item) {
    setEditingId(item.id)
    setEditForm({
      nome: item.name,
      descricao: item.description || '',
      display_order: item.display_order,
      ativo: item.active,
    })
  }

  async function handleAdd() {
    if (!newForm.nome.trim()) { toast.error('Nome obrigatório'); return }
    setSaving(true)
    const { error } = await supabase.from('onboarding_activity_types').insert({
      nome: newForm.nome.trim(),
      descricao: newForm.descricao || null,
      display_order: Number(newForm.display_order),
      ativo: newForm.ativo,
    })
    setSaving(false)
    if (error) { toast.error(error.message); return }
    toast.success('Tipo criado')
    setAdding(false)
    setNewForm(EMPTY)
    load()
  }

  async function handleEdit() {
    if (!editForm.nome.trim()) { toast.error('Nome obrigatório'); return }
    setSaving(true)
    const { error } = await supabase
      .from('onboarding_activity_types')
      .update({
        nome: editForm.nome.trim(),
        descricao: editForm.descricao || null,
        display_order: Number(editForm.display_order),
        ativo: editForm.ativo,
      })
      .eq('id', editingId)
    setSaving(false)
    if (error) { toast.error(error.message); return }
    toast.success('Tipo atualizado')
    setEditingId(null)
    load()
  }

  async function handleToggleAtivo(item) {
    const { error } = await supabase
      .from('onboarding_activity_types')
      .update({ ativo: !item.active })
      .eq('id', item.id)
    if (error) { toast.error(error.message); return }
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, ativo: !i.ativo } : i))
  }

  async function handleDelete(item) {
    if (!window.confirm(`Excluir "${item.name}"?`)) return
    setDeletingId(item.id)
    const { count, error: countErr } = await supabase
      .from('onboarding_activities')
      .select('id', { count: 'exact', head: true })
      .eq('activity_type_id', item.id)
    if (countErr) { toast.error(countErr.message); setDeletingId(null); return }
    if (count > 0) {
      toast.error(`Este tipo está em uso em ${count} atividade(s) e não pode ser excluído.`)
      setDeletingId(null)
      return
    }
    const { error } = await supabase.from('onboarding_activity_types').delete().eq('id', item.id)
    setDeletingId(null)
    if (error) { toast.error(error.message); return }
    toast.success('Tipo excluído')
    load()
  }

  async function handleDragEnd(result) {
    if (!result.destination || result.source.index === result.destination.index) return
    const reordered = Array.from(items)
    const [moved] = reordered.splice(result.source.index, 1)
    reordered.splice(result.destination.index, 0, moved)
    setItems(reordered)
    try {
      await Promise.all(
        reordered.map((item, idx) =>
          supabase.from('onboarding_activity_types').update({ display_order: idx + 1 }).eq('id', item.id)
        )
      )
      setItems(reordered.map((item, idx) => ({ ...item, display_order: idx + 1 })))
    } catch {
      toast.error('Erro ao reordenar')
      load()
    }
  }

  if (loading) return <PageSpinner />

  const colSpan = isAdmin ? 6 : 4

  return (
    <div className="max-w-6xl space-y-4">

      <SettingsSectionHeader
        icon={ActivityIcon}
        title="Tipos de Atividade"
        subtitle="Gerencie os tipos de atividades disponíveis para uso em templates"
        actions={
          isAdmin && (
            <Button
              size="sm"
              onClick={() => {
                setAdding(true)
                setEditingId(null)
              }}
            >
              + Novo Tipo
            </Button>
          )
        }
      />

      {/* Card */}
      <div className="bg-bg-primary border border-border-tertiary rounded-lg overflow-hidden w-full">

        {/* New form */}
        {adding && (
          <div className="p-4 border-b border-border-tertiary bg-bg-secondary">
            <p className="text-xs font-semibold text-text-primary mb-3">Novo Tipo de Atividade</p>
            <InlineForm
              form={newForm}
              setForm={setNewForm}
              onSave={handleAdd}
              onCancel={() => { setAdding(false); setNewForm(EMPTY) }}
              saving={saving}
            />
          </div>
        )}

        {/* Table */}
        <div className="overflow-x-auto w-full">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-tertiary bg-donc-navy text-white">
                {isAdmin && <th className="w-8 px-3 py-2.5" />}
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-white uppercase tracking-wider">Nome</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-white uppercase tracking-wider">Descrição</th>
                <th className="px-4 py-2.5 text-center text-xs font-semibold text-white uppercase tracking-wider">Ordem</th>
                <th className="px-4 py-2.5 text-center text-xs font-semibold text-white uppercase tracking-wider">Ativo</th>
                {isAdmin && <th className="px-4 py-2.5 text-center text-xs font-semibold text-white uppercase tracking-wider">Ações</th>}
              </tr>
            </thead>

            <DragDropContext onDragEnd={handleDragEnd}>
              <Droppable droppableId="activity-types" isDropDisabled={!isAdmin}>
                {(provided) => (
                  <tbody ref={provided.innerRef} {...provided.droppableProps}>
                    {items.map((item, index) => (
                      <Draggable
                        key={item.id}
                        draggableId={String(item.id)}
                        index={index}
                        isDragDisabled={!isAdmin || editingId === item.id}
                      >
                        {(drag, snapshot) =>
                          editingId === item.id ? (
                            <tr
                              ref={drag.innerRef}
                              {...drag.draggableProps}
                              className="border-b border-border-tertiary bg-bg-secondary"
                            >
                              <td colSpan={colSpan} className="px-4 py-3">
                                <InlineForm
                                  form={editForm}
                                  setForm={setEditForm}
                                  onSave={handleEdit}
                                  onCancel={() => setEditingId(null)}
                                  saving={saving}
                                />
                              </td>
                            </tr>
                          ) : (
                            <tr
                              ref={drag.innerRef}
                              {...drag.draggableProps}
                              className={`border-b border-border-tertiary transition-colors ${
                                snapshot.isDragging ? 'bg-bg-tertiary shadow-sm' : 'hover:bg-bg-secondary'
                              }`}
                            >
                              {isAdmin && (
                                <td className="px-3 py-2.5 text-text-tertiary" {...drag.dragHandleProps}>
                                  <svg className="w-4 h-4 cursor-grab" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
                                  </svg>
                                </td>
                              )}
                              <td className="px-4 py-2.5 font-medium text-text-primary whitespace-nowrap">{item.name}</td>
                              <td className="px-4 py-2.5 text-text-secondary max-w-xs truncate">{item.description || <span className="text-text-tertiary">—</span>}</td>
                              <td className="px-4 py-2.5 text-center text-text-secondary">{item.display_order}</td>
                              <td className="px-4 py-2.5 text-center">
                                <Toggle
                                  value={item.active}
                                  onChange={() => handleToggleAtivo(item)}
                                  disabled={!isAdmin}
                                />
                              </td>
                              {isAdmin && (
                                <td className="px-4 py-2.5 text-center">
                                  <div className="flex items-center justify-center gap-3">
                                    <button
                                      onClick={() => startEdit(item)}
                                      className="p-1 text-text-secondary hover:text-donc-sky rounded"
                                      title="Editar"
                                    >
                                      <Pencil size={14} />
                                    </button>
                                    <button
                                      onClick={() => handleDelete(item)}
                                      disabled={deletingId === item.id}
                                      className="p-1 text-text-secondary hover:text-red-500 rounded disabled:opacity-40"
                                      title="Excluir"
                                    >
                                      {deletingId === item.id ? '...' : <Trash2 size={14} />}
                                    </button>
                                  </div>
                                </td>
                              )}
                            </tr>
                          )
                        }
                      </Draggable>
                    ))}
                    {provided.placeholder}
                    {items.length === 0 && (
                      <tr>
                        <td colSpan={colSpan} className="px-4 py-8 text-center text-sm text-text-tertiary">
                          Nenhum tipo de atividade cadastrado.
                        </td>
                      </tr>
                    )}
                  </tbody>
                )}
              </Droppable>
            </DragDropContext>
          </table>
        </div>
      </div>
    </div>
  )
}
