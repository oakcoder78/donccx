import { useState } from 'react'
import { Icons } from '../lib/icons'
import { Button } from '../components/ui/Button'
import { PageSpinner } from '../components/ui/Spinner'
import { SettingsSectionHeader } from '../components/settings/SettingsSectionHeader'
import { BriefTemplateEditorModal } from '../components/brief/BriefTemplateEditorModal'
import { useBriefTemplates } from '../hooks/useBriefTemplates'

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
          <Button size="sm" onClick={() => { setEditingTemplate(null); setShowModal(true) }}>
            <Icons.Plus size={16} className="mr-1" />
            Novo template
          </Button>
        }
      />

      <div className="space-y-3">
        {briefTemplates.length === 0 ? (
          <div className="text-center py-12 text-text-tertiary">
            Nenhum template criado ainda
          </div>
        ) : (
          briefTemplates.map(template => (
            <div
              key={template.id}
              className="bg-bg-primary border border-border-tertiary rounded-lg p-4 flex items-center justify-between gap-4"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-medium text-text-primary truncate">{template.name}</h3>
                  {template.operation_type && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-[#59c2ed]/10 text-[#59c2ed] border border-[#59c2ed]/20 flex-shrink-0">
                      {template.operation_type}
                    </span>
                  )}
                  <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${
                    template.is_active ? 'bg-green-50 text-green-600' : 'bg-bg-secondary text-text-tertiary'
                  }`}>
                    {template.is_active ? 'publicado' : 'rascunho'}
                  </span>
                </div>
                <div className="text-sm text-text-tertiary mt-0.5">
                  {template.structure?.sections?.length || 0} seções · {calcQuestions(template)} perguntas
                </div>
              </div>

              <div className="flex items-center gap-3 flex-shrink-0">
                <Toggle
                  checked={template.is_active}
                  onChange={val => toggleActive.mutate({ id: template.id, is_active: val })}
                />
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => { setEditingTemplate(template); setShowModal(true) }}
                >
                  Editar
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => {
                    if (window.confirm('Remover este template?')) deleteTemplate.mutate(template.id)
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
