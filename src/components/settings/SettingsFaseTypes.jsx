import { useState, useEffect } from 'react'
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd'
import { supabase } from '../../lib/supabaseClient'
import { SettingsMenuIcons } from '../../lib/icons'
import { useAuth } from '../../contexts/AuthContext'
import { PageSpinner } from '../ui/Spinner'
import { Button } from '../ui/Button'
import toast from 'react-hot-toast'
import { Pencil, Trash2 } from 'lucide-react'

const EMPTY = {
  nome: '', descricao: '', is_milestone: false,
  requires_evidence: false, display_order: 0, ativo: true,
}

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

function Badge({ label, color = 'blue' }) {
  const colors = {
    blue:  { backgroundColor: '#dbeafe', color: '#1d4ed8' },
    green: { backgroundColor: '#dcfce7', color: '#15803d' },
  }
  return (
    <span style={{
      fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4,
      ...(colors[color] || colors.blue),
    }}>
      {label}
    </span>
  )
}

function InlineForm({ form, setForm, onSave, onCancel, saving, withMilestone }) {
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
        {withMilestone && (
          <>
            <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer select-none">
              <Toggle value={form.is_milestone} onChange={v => set('is_milestone', v)} />
              Marco
            </label>
            <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer select-none">
              <Toggle value={form.requires_evidence} onChange={v => set('requires_evidence', v)} />
              Requer Evidência
            </label>
          </>
        )}
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

export function SettingsFaseTypes() {
  const FaseIcon = SettingsMenuIcons['fase-types']
  const { isAdmin } = useAuth()

  const [items, setItems]       = useState([])
  const [loading, setLoading]   = useState(true)
  const [adding, setAdding]     = useState(false)
  const [newForm, setNewForm]   = useState(EMPTY)
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [saving, setSaving]     = useState(false)
  const [deletingId, setDeletingId] = useState(null)

  async function load() {
    setLoading(true)
    const { data, error } = await supabase
      .from('onboarding_fase_types')
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
      is_milestone: item.is_milestone,
      requires_evidence: item.requires_evidence,
      display_order: item.display_order,
      ativo: item.active,
    })
  }

  async function handleAdd() {
    if (!newForm.nome.trim()) { toast.error('Nome obrigatório'); return }
    setSaving(true)
    const { error } = await supabase.from('onboarding_fase_types').insert({
      nome: newForm.nome.trim(),
      descricao: newForm.descricao || null,
      is_milestone: newForm.is_milestone,
      requires_evidence: newForm.requires_evidence,
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
      .from('onboarding_fase_types')
      .update({
        nome: editForm.nome.trim(),
        descricao: editForm.descricao || null,
        is_milestone: editForm.is_milestone,
        requires_evidence: editForm.requires_evidence,
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
      .from('onboarding_fase_types')
      .update({ ativo: !item.active })
      .eq('id', item.id)
    if (error) { toast.error(error.message); return }
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, ativo: !i.ativo } : i))
  }

  async function handleDelete(item) {
    if (!window.confirm(`Excluir "${item.name}"?`)) return
    setDeletingId(item.id)
    const { count, error: countErr } = await supabase
      .from('onboarding_fases')
      .select('id', { count: 'exact', head: true })
      .eq('fase_type_id', item.id)
    if (countErr) { toast.error(countErr.message); setDeletingId(null); return }
    if (count > 0) {
      toast.error(`Este tipo está em uso em ${count} projeto(s) e não pode ser excluído.`)
      setDeletingId(null)
      return
    }
    const { error } = await supabase.from('onboarding_fase_types').delete().eq('id', item.id)
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
          supabase.from('onboarding_fase_types').update({ display_order: idx + 1 }).eq('id', item.id)
        )
      )
      setItems(reordered.map((item, idx) => ({ ...item, display_order: idx + 1 })))
    } catch {
      toast.error('Erro ao reordenar')
      load()
    }
  }

  if (loading) return <PageSpinner />

  const colSpan = isAdmin ? 8 : 6

  return (
    <div className="w-full max-w-6xl space-y-4">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-base font-semibold text-text-primary flex items-center gap-2">
            <FaseIcon className="w-4 h-4" />
            Tipos de Fase
          </h2>
          <p className="text-xs text-text-tertiary mt-1">
            Define os tipos de fase utilizados nos projetos e onboardings.
          </p>
        </div>
        {isAdmin && !adding && (
          <Button size="sm" onClick={() => { setAdding(true); setEditingId(null) }}>
            + Novo Tipo
          </Button>
        )}
      </div>

      {/* Card */}
      <div className="bg-bg-primary border border-border-tertiary rounded-lg overflow-hidden w-full">

        {/* New form */}
        {adding && (
          <div className="p-4 border-b border-border-tertiary bg-bg-secondary">
            <p className="text-xs font-semibold text-text-primary mb-3">Novo Tipo de Fase</p>
            <InlineForm
              form={newForm}
              setForm={setNewForm}
              onSave={handleAdd}
              onCancel={() => { setAdding(false); setNewForm(EMPTY) }}
              saving={saving}
              withMilestone
            />
          </div>
        )}

        {/* Table */}
        <div className="overflow-x-auto w-full">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-donc-navy text-white">
                {isAdmin && <th className="w-8 px-3 py-2.5" />}
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-white">Nome</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-white">Descrição</th>
                <th className="px-4 py-2.5 text-center text-xs font-semibold uppercase tracking-wider text-white">Marco</th>
                <th className="px-4 py-2.5 text-center text-xs font-semibold uppercase tracking-wider text-white">Req. Evidência</th>
                <th className="px-4 py-2.5 text-center text-xs font-semibold uppercase tracking-wider text-white">Ordem</th>
                <th className="px-4 py-2.5 text-center text-xs font-semibold uppercase tracking-wider text-white">Ativo</th>
                {isAdmin && <th className="px-4 py-2.5 text-center text-xs font-semibold uppercase tracking-wider text-white">Ações</th>}
              </tr>
            </thead>

            <DragDropContext onDragEnd={handleDragEnd}>
              <Droppable droppableId="fase-types" isDropDisabled={!isAdmin}>
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
                                  withMilestone
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
                              <td className="px-4 py-2.5 text-center">
                                {item.is_milestone
                                  ? <Badge label="Marco" color="blue" />
                                  : <span className="text-text-tertiary text-xs">—</span>}
                              </td>
                              <td className="px-4 py-2.5 text-center">
                                {item.requires_evidence
                                  ? <Badge label="Sim" color="green" />
                                  : <span className="text-text-tertiary text-xs">—</span>}
                              </td>
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
                                  <div className="flex items-center justify-center gap-2">
                                    <button
                                      onClick={() => startEdit(item)}
                                      title="Editar"
                                      className="p-1 text-text-secondary hover:text-donc-sky rounded"
                                    >
                                      <Pencil size={14} />
                                    </button>
                                    <button
                                      onClick={() => handleDelete(item)}
                                      disabled={deletingId === item.id}
                                      title="Excluir"
                                      className="p-1 text-text-secondary hover:text-red-500 rounded disabled:opacity-40"
                                    >
                                      <Trash2 size={14} />
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
                          Nenhum tipo de fase cadastrado.
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
