import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../contexts/AuthContext'

const TYPE_OPTIONS = [
  { value: 'onboarding', label: 'Onboarding' },
  { value: 'expansao', label: 'Expansão' },
  { value: 'interno', label: 'Interno' },
]

function Toggle({ checked, onChange, disabled, title }) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      style={{
        width: 30, height: 17, borderRadius: 9,
        background: checked ? '#173557' : '#d4d3ce',
        border: 'none', padding: 0, cursor: disabled ? 'default' : 'pointer',
        position: 'relative', display: 'inline-block', transition: 'background 0.2s',
      }}
      title={title}
    >
      <span style={{
        position: 'absolute', top: 2, left: checked ? 13 : 2,
        width: 13, height: 13, borderRadius: '50%', background: '#fff',
        display: 'block', transition: 'left 0.18s',
      }} />
    </button>
  )
}

function useFaseTypes() {
  return useQuery({
    queryKey: ['onb_fase_types'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('onboarding_fase_types')
        .select('id, name, is_milestone, requires_evidence, display_order')
        .eq('active', true)
        .order('display_order', { ascending: true })
      if (error) throw error
      return data ?? []
    },
    staleTime: 10 * 60 * 1000,
  })
}

function useActivityTypes() {
  return useQuery({
    queryKey: ['onb_activity_types'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('onboarding_activity_types')
        .select('id, name, display_order')
        .eq('active', true)
        .order('display_order', { ascending: true })
      if (error) throw error
      return data ?? []
    },
    staleTime: 10 * 60 * 1000,
  })
}

function useProjectTemplates() {
  return useQuery({
    queryKey: ['project_templates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_templates')
        .select('*')
        .eq('active', true)
        .order('type', { ascending: true })
        .order('name', { ascending: true })
      if (error) throw error
      return data ?? []
    },
  })
}

function useTemplateFases(templateId) {
  return useQuery({
    queryKey: ['template_fases', templateId],
    enabled: !!templateId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_template_activities')
        .select('fase_type_id, display_order, template_id, fase_type:onboarding_fase_types(id, name, is_milestone, requires_evidence, display_order)')
        .eq('template_id', templateId)
        .order('display_order', { ascending: true })
      if (error) throw error
      
      const faseTypesMap = {}
      for (const row of data ?? []) {
        if (!faseTypesMap[row.fase_type_id]) {
          faseTypesMap[row.fase_type_id] = {
            id: row.fase_type_id,
            template_id: row.template_id,
            fase_type_id: row.fase_type_id,
            display_order: row.display_order,
            fase_type: row.fase_type,
          }
        }
      }
      return Object.values(faseTypesMap).sort((a, b) => a.display_order - b.display_order)
    },
  })
}

function useTemplateActivities(templateId, faseTypeId) {
  return useQuery({
    queryKey: ['template_activities', templateId, faseTypeId],
    enabled: !!templateId && !!faseTypeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_template_activities')
        .select('*, activity_type:onboarding_activity_types(id, name, display_order)')
        .eq('template_id', templateId)
        .eq('fase_type_id', faseTypeId)
        .order('display_order', { ascending: true })
      if (error) throw error
      return data ?? []
    },
  })
}

export function SettingsProjectTemplates() {
  const { isAdmin } = useAuth()
  const qc = useQueryClient()
  const [expanded, setExpanded] = useState({})
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState({ name: '', type: 'onboarding', description: '', is_default: false })
  const [saving, setSaving] = useState(false)
  const [addingFase, setAddingFase] = useState(null)
  const [selectedFaseType, setSelectedFaseType] = useState('')
  const [addingActivity, setAddingActivity] = useState(null)
  const [selectedActivityType, setSelectedActivityType] = useState('')

  const { data: faseTypes } = useFaseTypes()
  const { data: activityTypes } = useActivityTypes()
  const { data: templates } = useProjectTemplates()

  const toggleExpanded = (id) => setExpanded(p => ({ ...p, [id]: !p[id] }))

  const createTemplate = useMutation({
    mutationFn: async (data) => {
      if (data.is_default) {
        await supabase.from('project_templates').update({ is_default: false }).eq('type', data.type).eq('is_default', true)
      }
      const { error } = await supabase.from('project_templates').insert(data)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project_templates'] })
      toast.success('Template criado')
      setShowForm(false)
      setFormData({ name: '', type: 'onboarding', description: '', is_default: false })
    },
    onError: (e) => toast.error(e.message),
  })

  const handleSave = async () => {
    if (!formData.name.trim()) return toast.error('Nome é obrigatório')
    setSaving(true)
    try {
      await createTemplate.mutateAsync(formData)
    } finally {
      setSaving(false)
    }
  }

  const deleteTemplate = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('project_templates').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project_templates'] })
      toast.success('Template removido')
    },
    onError: (e) => toast.error(e.message),
  })

  const toggleDefault = useMutation({
    mutationFn: async ({ id, type, currentDefault }) => {
      if (!currentDefault) {
        await supabase.from('project_templates').update({ is_default: false }).eq('type', type).eq('is_default', true)
      }
      const { error } = await supabase.from('project_templates').update({ is_default: !currentDefault }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project_templates'] })
    },
    onError: (e) => toast.error(e.message),
  })

  const addFase = useMutation({
    mutationFn: async ({ templateId, faseTypeId }) => {
      const faseType = faseTypes?.find(f => f.id === parseInt(faseTypeId))
      const { error } = await supabase.from('project_template_activities').insert({
        template_id: templateId,
        fase_type_id: parseInt(faseTypeId),
        display_order: faseType?.display_order || 0,
      })
      if (error) throw error
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['template_fases', vars.templateId] })
      setAddingFase(null)
      setSelectedFaseType('')
      toast.success('Fase adicionada')
    },
    onError: (e) => toast.error(e.message),
  })

  const removeFase = useMutation({
    mutationFn: async ({ templateId, faseTypeId }) => {
      const { error } = await supabase.from('project_template_activities').delete().eq('template_id', templateId).eq('fase_type_id', faseTypeId)
      if (error) throw error
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['template_fases', vars.templateId] })
      toast.success('Fase removida')
    },
    onError: (e) => toast.error(e.message),
  })

  const addActivity = useMutation({
    mutationFn: async ({ templateId, faseTypeId, activityTypeId }) => {
      const actType = activityTypes?.find(a => a.id === parseInt(activityTypeId))
      const { error } = await supabase.from('project_template_activities').insert({
        template_id: templateId,
        fase_type_id: faseTypeId,
        activity_type_id: parseInt(activityTypeId),
        display_order: actType?.display_order || 0,
      })
      if (error) throw error
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['template_activities', vars.templateId, vars.faseTypeId] })
      setAddingActivity(null)
      setSelectedActivityType('')
      toast.success('Atividade adicionada')
    },
    onError: (e) => toast.error(e.message),
  })

  const removeActivity = useMutation({
    mutationFn: async ({ templateId, faseTypeId, activityId }) => {
      const { error } = await supabase.from('project_template_activities').delete().eq('id', activityId)
      if (error) throw error
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['template_activities', vars.templateId, vars.faseTypeId] })
      toast.success('Atividade removida')
    },
    onError: (e) => toast.error(e.message),
  })

  const groupedTemplates = TYPE_OPTIONS.map(type => ({
    type: type.value,
    label: type.label,
    items: templates?.filter(t => t.type === type.value) ?? [],
  }))

  if (!isAdmin) {
    return <div className="p-6 text-text-secondary">Acesso restrito a administradores.</div>
  }

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Templates de Projeto</h2>
          <p className="text-sm text-text-tertiary mt-1">Gerencie templates de projeto com fases e atividades padrão</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="px-4 py-2 rounded-lg text-sm font-semibold bg-donc-navy text-white disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
        >
          + Novo Template
        </button>
      </div>

      {showForm && (
        <div className="mb-6 p-4 bg-bg-secondary rounded-lg border border-border-tertiary">
          <h3 className="text-sm font-semibold text-text-primary mb-4">Novo Template</h3>
          <div className="grid gap-4" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <div>
              <label className="block text-xs font-medium text-text-tertiary mb-1">Nome *</label>
              <input
                type="text"
                value={formData.name}
                onChange={e => setFormData(p => ({ ...p, name: e.target.value }))}
                className="w-full px-3 py-2 border border-border-secondary rounded-lg text-sm"
                placeholder="ex: Onboarding Padrão"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-text-tertiary mb-1">Tipo</label>
              <select
                value={formData.type}
                onChange={e => setFormData(p => ({ ...p, type: e.target.value }))}
                className="w-full px-3 py-2 border border-border-secondary rounded-lg text-sm"
              >
                {TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label className="block text-xs font-medium text-text-tertiary mb-1">Descrição</label>
              <textarea
                value={formData.description}
                onChange={e => setFormData(p => ({ ...p, description: e.target.value }))}
                className="w-full px-3 py-2 border border-border-secondary rounded-lg text-sm"
                rows={2}
                placeholder="Descrição opcional..."
              />
            </div>
            <div className="flex items-center gap-2">
              <Toggle
                checked={formData.is_default}
                onChange={v => setFormData(p => ({ ...p, is_default: v }))}
              />
              <span className="text-sm text-text-secondary">Template padrão</span>
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button
              onClick={handleSave}
              disabled={saving || !formData.name.trim()}
              className="px-4 py-2 rounded-lg text-sm font-semibold bg-donc-navy text-white disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
            >
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
            <button
              onClick={() => { setShowForm(false); setFormData({ name: '', type: 'onboarding', description: '', is_default: false }) }}
              className="px-4 py-2 border border-border-secondary rounded-lg text-sm text-text-primary hover:bg-bg-secondary"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {groupedTemplates.map(group => (
        <div key={group.type} className="mb-8">
          <h3 className="text-sm font-semibold text-text-primary mb-3 px-1">{group.label}</h3>
          {group.items.length === 0 ? (
            <p className="text-sm text-text-tertiary px-1">Nenhum template</p>
          ) : (
            <div className="space-y-3">
              {group.items.map(template => (
                <TemplateCard
                  key={template.id}
                  template={template}
                  expanded={expanded[template.id]}
                  onToggle={() => toggleExpanded(template.id)}
                  isAdmin={isAdmin}
                  onDelete={() => deleteTemplate.mutate(template.id)}
                  onToggleDefault={(val) => toggleDefault.mutate({ id: template.id, type: template.type, currentDefault: template.is_default })}
                  addingFase={addingFase}
                  setAddingFase={setAddingFase}
                  selectedFaseType={selectedFaseType}
                  setSelectedFaseType={setSelectedFaseType}
                  faseTypes={faseTypes}
                  onAddFase={(faseTypeId) => addFase.mutate({ templateId: template.id, faseTypeId })}
                  onRemoveFase={(faseTypeId) => removeFase.mutate({ templateId: template.id, faseTypeId })}
                  addingActivity={addingActivity}
                  setAddingActivity={setAddingActivity}
                  selectedActivityType={selectedActivityType}
                  setSelectedActivityType={setSelectedActivityType}
                  activityTypes={activityTypes}
                  onAddActivity={(faseTypeId, activityTypeId) => addActivity.mutate({ templateId: template.id, faseTypeId, activityTypeId })}
                  onRemoveActivity={(activityId, faseTypeId) => removeActivity.mutate({ templateId: template.id, faseTypeId, activityId })}
                />
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function TemplateCard({
  template, expanded, onToggle, isAdmin, onDelete, onToggleDefault,
  addingFase, setAddingFase, selectedFaseType, setSelectedFaseType, faseTypes, onAddFase, onRemoveFase,
  addingActivity, setAddingActivity, selectedActivityType, setSelectedActivityType, activityTypes, onAddActivity, onRemoveActivity,
}) {
  const { data: fases } = useTemplateFases(template.id)

  return (
    <div className="bg-bg-secondary border border-border-tertiary rounded-lg overflow-hidden">
      <div
        className="flex items-center justify-between p-4 cursor-pointer hover:bg-bg-tertiary transition-colors"
        onClick={onToggle}
      >
        <div className="flex items-center gap-3">
          <svg
            className={`w-4 h-4 text-text-tertiary transition-transform ${expanded ? 'rotate-90' : ''}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-medium text-text-primary">{template.name}</span>
              {template.is_default && (
                <span className="px-2 py-0.5 bg-primary/10 text-primary text-xs rounded-full">Padrão</span>
              )}
            </div>
            {template.description && (
              <p className="text-xs text-text-tertiary mt-0.5">{template.description}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-text-secondary" title="Definir como padrão">
            <span>Padrão</span>
            <Toggle
              checked={template.is_default}
              onChange={e => { e.stopPropagation(); onToggleDefault(template.is_default) }}
            />
          </label>
          {isAdmin && (
            <button
              onClick={e => { e.stopPropagation(); if (confirm('Remover este template?')) onDelete() }}
              className="p-1.5 text-text-tertiary text-red-600 hover:bg-red-50 rounded transition-colors"
              title="Remover"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border-tertiary p-4 bg-bg-primary">
          {fases?.length === 0 ? (
            <p className="text-sm text-text-tertiary text-center py-4">Nenhuma fase adicionada</p>
          ) : (
            <div className="space-y-4">
              {fases?.map(fase => (
                <FaseRow
                  key={fase.id}
                  fase={fase}
                  templateId={template.id}
                  isAdmin={isAdmin}
                  addingActivity={addingActivity}
                  setAddingActivity={setAddingActivity}
                  selectedActivityType={selectedActivityType}
                  setSelectedActivityType={setSelectedActivityType}
                  activityTypes={activityTypes}
                  onAddActivity={onAddActivity}
                  onRemoveActivity={onRemoveActivity}
                  onRemoveFase={onRemoveFase}
                />
              ))}
            </div>
          )}

          <div className="mt-4 pt-4 border-t border-border-tertiary">
            {addingFase === template.id ? (
              <div className="flex items-center gap-2">
                <select
                  value={selectedFaseType}
                  onChange={e => setSelectedFaseType(e.target.value)}
                  className="flex-1 px-3 py-2 border border-border-secondary rounded-lg text-sm"
                >
                  <option value="">Selecionar fase...</option>
                  {faseTypes?.map(ft => (
                    <option key={ft.id} value={ft.id}>{ft.name}</option>
                  ))}
                </select>
                <button
                  onClick={() => selectedFaseType && onAddFase(selectedFaseType)}
                  disabled={!selectedFaseType}
                  className="px-3 py-2 rounded-lg text-sm font-semibold bg-donc-navy text-white disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
                >
                  Adicionar
                </button>
                <button
                  onClick={() => { setAddingFase(null); setSelectedFaseType('') }}
                  className="px-3 py-2 border border-border-secondary rounded-lg text-sm text-text-primary hover:bg-bg-secondary"
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <button
                onClick={() => setAddingFase(template.id)}
                className="text-sm text-primary hover:underline"
              >
                + Adicionar fase
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function FaseRow({ fase, templateId, isAdmin, addingActivity, setAddingActivity, selectedActivityType, setSelectedActivityType, activityTypes, onAddActivity, onRemoveActivity, onRemoveFase }) {
  const { data: activities } = useTemplateActivities(templateId, fase.fase_type_id)

  return (
    <div className="pl-4 border-l-2 border-border-secondary">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {fase.is_milestone && (
            <span className="w-5 h-5 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center text-xs" title="Marco">M</span>
          )}
          <span className="font-medium text-text-primary text-sm">{fase.fase_type?.name}</span>
        </div>
        {isAdmin && (
          <button
            onClick={() => onRemoveFase(fase.fase_type_id)}
            className="text-xs text-red-600 hover:bg-red-50"
          >
            Remover
          </button>
        )}
      </div>

      {activities?.length > 0 && (
        <div className="ml-7 space-y-1 mb-2">
          {activities.map(act => (
            <div key={act.id} className="flex items-center justify-between text-xs">
              <span className="text-text-secondary">• {act.activity_type?.name}</span>
              {isAdmin && (
                <button
                  onClick={() => onRemoveActivity(act.id, fase.fase_type_id)}
                  className="text-text-tertiary text-red-600 hover:bg-red-50"
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="ml-7 mt-2">
        {addingActivity === fase.id ? (
          <div className="flex items-center gap-2">
            <select
              value={selectedActivityType}
              onChange={e => setSelectedActivityType(e.target.value)}
              className="flex-1 px-2 py-1 border border-border-secondary rounded text-xs"
            >
              <option value="">Selecionar atividade...</option>
              {activityTypes?.filter(at => !activities?.some(a => a.activity_type_id === at.id)).map(at => (
                <option key={at.id} value={at.id}>{at.name}</option>
              ))}
            </select>
            <button
              onClick={() => selectedActivityType && onAddActivity(fase.fase_type_id, selectedActivityType)}
              disabled={!selectedActivityType}
              className="px-2 py-1 rounded text-xs font-semibold bg-donc-navy text-white disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90"
            >
              +
            </button>
            <button
              onClick={() => { setAddingActivity(null); setSelectedActivityType('') }}
              className="px-2 py-1 border border-border-secondary rounded text-xs text-text-primary hover:bg-bg-secondary"
            >
              ×
            </button>
          </div>
        ) : (
          <button
            onClick={() => setAddingActivity(fase.id)}
            className="text-xs text-primary hover:underline"
          >
            + Atividade
          </button>
        )}
      </div>
    </div>
  )
}