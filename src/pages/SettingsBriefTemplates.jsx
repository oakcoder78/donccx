import { useState } from 'react'
import { Icons } from '../lib/icons'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { PageSpinner } from '../components/ui/Spinner'
import { SettingsSectionHeader } from '../components/settings/SettingsSectionHeader'
import { useBriefTemplates } from '../hooks/useBriefTemplates'
import toast from 'react-hot-toast'

const OPERATION_TYPES = [
  { value: 'padrao', label: 'Padrão' },
  { value: 'entrega', label: 'Entrega' },
  { value: 'montagem', label: 'Montagem' },
  { value: 'assistencia', label: 'Assistência Técnica' },
  { value: 'instalacao', label: 'Instalação' },
]

function Toggle({ checked, onChange, disabled }) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${checked ? 'bg-donc-navy' : 'bg-gray-300'} ${disabled ? 'cursor-default' : 'cursor-pointer'}`}
    >
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${checked ? 'translate-x-4' : 'translate-x-0.5'}`} />
    </button>
  )
}

function BriefTemplateEditorModal({ template, onClose, onSave, isSaving }) {
  const [form, setForm] = useState({
    name: template?.name || '',
    operation_type: template?.operation_type || 'padrao',
    sections: template?.structure?.sections || [],
  })

  const [newSection, setNewSection] = useState({ title: '', deliverable: '', callout: '', audience: '' })

  const addSection = () => {
    if (!newSection.title.trim()) return
    setForm(f => ({
      ...f,
      sections: [...f.sections, {
        id: `sec_${Date.now()}`,
        order: f.sections.length + 1,
        title: newSection.title,
        deliverable: newSection.deliverable,
        callout: newSection.callout,
        audience: newSection.audience,
        questions: [],
      }],
    }))
    setNewSection({ title: '', deliverable: '', callout: '', audience: '' })
  }

  const removeSection = (idx) => {
    setForm(f => ({
      ...f,
      sections: f.sections.filter((_, i) => i !== idx),
    }))
  }

  const addQuestion = (secIdx) => {
    setForm(f => ({
      ...f,
      sections: f.sections.map((sec, i) => {
        if (i !== secIdx) return sec
        return {
          ...sec,
          questions: [...(sec.questions || []), {
            id: `q_${Date.now()}`,
            order: (sec.questions?.length || 0) + 1,
            text: '',
            type: 'text',
            required: true,
            allow_attachment: false,
          }],
        }
      }),
    }))
  }

  const updateQuestion = (secIdx, qIdx, field, value) => {
    setForm(f => ({
      ...f,
      sections: f.sections.map((sec, i) => {
        if (i !== secIdx) return sec
        return {
          ...sec,
          questions: sec.questions.map((q, j) => j === qIdx ? { ...q, [field]: value } : q),
        }
      }),
    }))
  }

  const removeQuestion = (secIdx, qIdx) => {
    setForm(f => ({
      ...f,
      sections: f.sections.map((sec, i) => {
        if (i !== secIdx) return sec
        return {
          ...sec,
          questions: sec.questions.filter((_, j) => j !== qIdx),
        }
      }),
    }))
  }

  const handleSave = () => {
    if (!form.name.trim()) {
      toast.error('Informe o nome do template')
      return
    }
    if (form.sections.length === 0) {
      toast.error('Adicione pelo menos uma seção')
      return
    }
    onSave({
      id: template?.id,
      name: form.name,
      operation_type: form.operation_type,
      structure: { sections: form.sections },
    })
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-bg-primary rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="p-6 border-b border-border-tertiary">
          <h2 className="text-lg font-semibold text-text-primary">
            {template ? 'Editar Template' : 'Novo Template'}
          </h2>
        </div>

        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label-sm">Nome *</label>
              <input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="input-base w-full"
                placeholder="Nome do template"
              />
            </div>
            <div>
              <label className="label-sm">Tipo de Operação</label>
              <select
                value={form.operation_type}
                onChange={e => setForm(f => ({ ...f, operation_type: e.target.value }))}
                className="input-base w-full"
              >
                {OPERATION_TYPES.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="border-t border-border-tertiary pt-4">
            <h3 className="text-sm font-semibold text-text-primary mb-3">Seções</h3>

            {form.sections.map((sec, secIdx) => (
              <div key={sec.id || secIdx} className="bg-bg-secondary rounded-md p-3 mb-3 border border-border-tertiary">
                <div className="flex justify-between items-start mb-2">
                  <span className="text-sm font-medium text-text-primary">{sec.order}. {sec.title}</span>
                  <button onClick={() => removeSection(secIdx)} className="text-xs text-red-500 hover:underline">Remover</button>
                </div>
                {sec.deliverable && (
                  <p className="text-xs text-text-tertiary mb-2">Entregável: {sec.deliverable}</p>
                )}
                <div className="text-xs text-text-tertiary mb-2">
                  {sec.questions?.length || 0} perguntas
                </div>

                {(sec.questions || []).map((q, qIdx) => (
                  <div key={q.id || qIdx} className="ml-4 mt-2 p-2 bg-bg-primary rounded border border-border-tertiary">
                    <div className="flex gap-2 items-start">
                      <input
                        value={q.text}
                        onChange={e => updateQuestion(secIdx, qIdx, 'text', e.target.value)}
                        className="input-base flex-1 text-xs"
                        placeholder="Texto da pergunta"
                      />
                      <button onClick={() => removeQuestion(secIdx, qIdx)} className="text-xs text-red-500">✕</button>
                    </div>
                    <div className="flex gap-3 mt-1 items-center">
                      <select
                        value={q.type}
                        onChange={e => updateQuestion(secIdx, qIdx, 'type', e.target.value)}
                        className="input-base text-xs"
                      >
                        <option value="text">Texto curto</option>
                        <option value="textarea">Texto longo</option>
                      </select>
                      <label className="flex items-center gap-1.5 text-xs text-text-secondary">
                        <span>Obrigatória</span>
                        <Toggle
                          checked={q.required}
                          onChange={v => updateQuestion(secIdx, qIdx, 'required', v)}
                        />
                      </label>
                      <label className="flex items-center gap-1.5 text-xs text-text-secondary">
                        <span>Anexo</span>
                        <Toggle
                          checked={q.allow_attachment ?? false}
                          onChange={v => updateQuestion(secIdx, qIdx, 'allow_attachment', v)}
                        />
                      </label>
                    </div>
                    <div className="flex items-center gap-2 mt-1.5">
                      <Icons.HelpCircle size={14} className="text-donc-sky flex-shrink-0" />
                      <input
                        value={q.note || ''}
                        onChange={e => updateQuestion(secIdx, qIdx, 'note', e.target.value)}
                        className="input-base flex-1 text-xs"
                        placeholder="Orientação opcional para o cliente ao responder esta pergunta"
                      />
                    </div>
                  </div>
                ))}

                <button
                  onClick={() => addQuestion(secIdx)}
                  className="mt-2 text-xs text-donc-sky hover:underline"
                >
                  + Adicionar pergunta
                </button>
              </div>
            ))}

            <div className="border border-dashed border-border-secondary rounded-md p-3">
              <h4 className="text-xs font-medium text-text-secondary mb-2">Nova Seção</h4>
              <div className="space-y-2">
                <input
                  value={newSection.title}
                  onChange={e => setNewSection(s => ({ ...s, title: e.target.value }))}
                  className="input-base w-full text-sm"
                  placeholder="Título da seção *"
                />
                <input
                  value={newSection.deliverable}
                  onChange={e => setNewSection(s => ({ ...s, deliverable: e.target.value }))}
                  className="input-base w-full text-sm"
                  placeholder="Entregável"
                />
                <input
                  value={newSection.audience}
                  onChange={e => setNewSection(s => ({ ...s, audience: e.target.value }))}
                  className="input-base w-full text-sm"
                  placeholder="Público (ex: Financeiro, TI)"
                />
                <button
                  onClick={addSection}
                  disabled={!newSection.title.trim()}
                  className="text-xs bg-bg-secondary px-2 py-1 rounded hover:bg-bg-tertiary disabled:opacity-50"
                >
                  + Adicionar Seção
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-border-tertiary bg-bg-secondary flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={handleSave} disabled={isSaving}>
            {isSaving ? 'Salvando...' : 'Salvar'}
          </Button>
        </div>
      </div>
    </div>
  )
}

export default function SettingsBriefTemplates() {
  const { briefTemplates, createTemplate, updateTemplate, toggleActive, deleteTemplate, isLoading, isSaving } = useBriefTemplates()

  const [showModal, setShowModal] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState(null)

  const handleSave = async (data) => {
    if (data.id) {
      await updateTemplate.mutateAsync(data)
    } else {
      await createTemplate.mutateAsync(data)
    }
    setShowModal(false)
    setEditingTemplate(null)
  }

  const calcQuestions = (template) => {
    if (!template?.structure?.sections) return 0
    return template.structure.sections.reduce((acc, sec) => acc + (sec.questions?.length || 0), 0)
  }

  if (isLoading) return <PageSpinner />

  return (
    <div className="max-w-3xl space-y-6">
      <SettingsSectionHeader
        icon={Icons.FileQuestion}
        title="Templates de Brief"
        subtitle="Gerencie os modelos de questionário de discovery."
        actions={
          <Button size="sm" onClick={() => setShowModal(true)}>
            <Icons.Plus size={16} className="mr-1" />
            Novo Template
          </Button>
        }
      />

      <div className="space-y-4">
        {briefTemplates.length === 0 ? (
          <div className="text-center py-12 text-text-tertiary">
            Nenhum template criado ainda
          </div>
        ) : (
          briefTemplates.map(template => (
            <div
              key={template.id}
              className="bg-bg-primary border border-border-tertiary rounded-lg p-4 flex items-center justify-between"
            >
              <div className="flex-1">
                <div className="flex items-center gap-3">
                  <h3 className="font-medium text-text-primary">{template.name}</h3>
                  <Badge
                    label={OPERATION_TYPES.find(t => t.value === template.operation_type)?.label || template.operation_type}
                    variant="blue"
                  />
                  {!template.is_active && (
                    <span className="text-xs text-text-tertiary bg-bg-secondary px-2 py-0.5 rounded">Inativo</span>
                  )}
                </div>
                <div className="text-sm text-text-tertiary mt-1">
                  {template.structure?.sections?.length || 0} seções • {calcQuestions(template)} perguntas
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Toggle
                  checked={template.is_active}
                  onChange={(val) => toggleActive.mutate({ id: template.id, is_active: val })}
                />
                <Button variant="secondary" size="sm" onClick={() => { setEditingTemplate(template); setShowModal(true) }}>
                  Editar
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => {
                    if (window.confirm('Remover este template?')) {
                      deleteTemplate.mutate(template.id)
                    }
                  }}
                >
                  Excluir
                </Button>
              </div>
            </div>
          ))
        )}
      </div>

      {showModal && (
        <BriefTemplateEditorModal
          template={editingTemplate}
          onClose={() => { setShowModal(false); setEditingTemplate(null) }}
          onSave={handleSave}
          isSaving={isSaving}
        />
      )}
    </div>
  )
}