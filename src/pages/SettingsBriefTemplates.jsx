import { useState } from 'react'
import { Icons } from '../lib/icons'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { PageSpinner } from '../components/ui/Spinner'
import { useBriefTemplates } from '../hooks/useBriefTemplates'
import toast from 'react-hot-toast'

const OPERATION_TYPES = [
  { value: 'entrega', label: 'Entrega' },
  { value: 'instalacao', label: 'Instalação' },
  { value: 'assistencia', label: 'Assistência Técnica' },
  { value: 'seguranca', label: 'Segurança' },
]

function Toggle({ checked, onChange, disabled }) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      style={{
        width: 36, height: 20, borderRadius: 10,
        backgroundColor: checked ? '#173557' : '#d4d3ce',
        position: 'relative', transition: 'background 0.2s',
        cursor: disabled ? 'default' : 'pointer',
        border: 'none', padding: 0,
      }}
    >
      <span style={{
        position: 'absolute', top: 2, left: checked ? 18 : 2,
        width: 16, height: 16, borderRadius: '50%', backgroundColor: '#fff',
        transition: 'left 0.2s',
      }} />
    </button>
  )
}

function BriefTemplateEditorModal({ template, onClose, onSave, isSaving }) {
  const [form, setForm] = useState({
    name: template?.name || '',
    operation_type: template?.operation_type || 'entrega',
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
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            {template ? 'Editar Template' : 'Novo Template'}
          </h2>
        </div>

        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
              <input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                placeholder="Nome do template"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de Operação</label>
              <select
                value={form.operation_type}
                onChange={e => setForm(f => ({ ...f, operation_type: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              >
                {OPERATION_TYPES.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="border-t pt-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Seções</h3>

            {form.sections.map((sec, secIdx) => (
              <div key={sec.id || secIdx} className="bg-gray-50 rounded-md p-3 mb-3 border border-gray-200">
                <div className="flex justify-between items-start mb-2">
                  <span className="text-sm font-medium">{sec.order}. {sec.title}</span>
                  <button onClick={() => removeSection(secIdx)} className="text-red-500 text-xs">Remover</button>
                </div>
                {sec.deliverable && (
                  <p className="text-xs text-gray-600 mb-2">Entregável: {sec.deliverable}</p>
                )}
                <div className="text-xs text-gray-500 mb-2">
                  {sec.questions?.length || 0} perguntas
                </div>

                {(sec.questions || []).map((q, qIdx) => (
                  <div key={q.id || qIdx} className="ml-4 mt-2 p-2 bg-white rounded border border-gray-200">
                    <div className="flex gap-2 items-start">
                      <input
                        value={q.text}
                        onChange={e => updateQuestion(secIdx, qIdx, 'text', e.target.value)}
                        className="flex-1 px-2 py-1 text-xs border rounded"
                        placeholder="Texto da pergunta"
                      />
                      <button onClick={() => removeQuestion(secIdx, qIdx)} className="text-red-400 text-xs">✕</button>
                    </div>
                    <div className="flex gap-2 mt-1">
                      <select
                        value={q.type}
                        onChange={e => updateQuestion(secIdx, qIdx, 'type', e.target.value)}
                        className="text-xs px-2 py-1 border rounded"
                      >
                        <option value="text">Texto curto</option>
                        <option value="textarea">Texto longo</option>
                      </select>
                      <label className="flex items-center gap-1 text-xs">
                        <input
                          type="checkbox"
                          checked={q.required}
                          onChange={e => updateQuestion(secIdx, qIdx, 'required', e.target.checked)}
                        />
                        Obrigatória
                      </label>
                    </div>
                  </div>
                ))}

                <button
                  onClick={() => addQuestion(secIdx)}
                  className="mt-2 text-xs text-blue-600 hover:underline"
                >
                  + Adicionar pergunta
                </button>
              </div>
            ))}

            <div className="border border-dashed border-gray-300 rounded-md p-3">
              <h4 className="text-xs font-medium text-gray-700 mb-2">Nova Seção</h4>
              <div className="space-y-2">
                <input
                  value={newSection.title}
                  onChange={e => setNewSection(s => ({ ...s, title: e.target.value }))}
                  className="w-full px-2 py-1 text-sm border rounded"
                  placeholder="Título da seção *"
                />
                <input
                  value={newSection.deliverable}
                  onChange={e => setNewSection(s => ({ ...s, deliverable: e.target.value }))}
                  className="w-full px-2 py-1 text-sm border rounded"
                  placeholder="Entregável"
                />
                <input
                  value={newSection.audience}
                  onChange={e => setNewSection(s => ({ ...s, audience: e.target.value }))}
                  className="w-full px-2 py-1 text-sm border rounded"
                  placeholder="Público (ex: Financeiro, TI)"
                />
                <button
                  onClick={addSection}
                  disabled={!newSection.title.trim()}
                  className="text-xs bg-gray-100 px-2 py-1 rounded hover:bg-gray-200 disabled:opacity-50"
                >
                  + Adicionar Seção
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="p-4 border-t bg-gray-50 flex justify-end gap-2">
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
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Templates de Brief</h1>
          <p className="text-sm text-gray-500 mt-1">Gerencie os modelos de questionário de discovery</p>
        </div>
        <Button variant="primary" onClick={() => setShowModal(true)}>
          <Icons.Plus size={16} className="mr-2" />
          Novo Template
        </Button>
      </div>

      <div className="grid gap-4">
        {briefTemplates.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            Nenhum template criado ainda
          </div>
        ) : (
          briefTemplates.map(template => (
            <div
              key={template.id}
              className="bg-white border border-gray-200 rounded-lg p-4 flex items-center justify-between"
            >
              <div className="flex-1">
                <div className="flex items-center gap-3">
                  <h3 className="font-medium text-gray-900">{template.name}</h3>
                  <Badge
                    label={OPERATION_TYPES.find(t => t.value === template.operation_type)?.label || template.operation_type}
                    color={template.operation_type === 'entrega' ? 'blue' : template.operation_type === 'seguranca' ? 'green' : 'blue'}
                  />
                  {!template.is_active && (
                    <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded">Inativo</span>
                  )}
                </div>
                <div className="text-sm text-gray-500 mt-1">
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
                <button
                  onClick={() => {
                    if (window.confirm('Remover este template?')) {
                      deleteTemplate.mutate(template.id)
                    }
                  }}
                  className="text-red-500 text-sm hover:underline"
                >
                  Excluir
                </button>
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