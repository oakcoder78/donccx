import { useState } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'

export function BriefCreateModal({ onboardingId, clientId, clientName, faseName, templates, onClose, onCreate, isCreating }) {
  const [title, setTitle] = useState(`Brief — ${clientName} — ${faseName}`)
  const [selectedTemplate, setSelectedTemplate] = useState('')

  const templatesByType = templates.reduce((acc, t) => {
    const type = t.operation_type || 'outros'
    if (!acc[type]) acc[type] = []
    acc[type].push(t)
    return acc
  }, {})

  const selectedTemplateData = templates.find(t => t.id === selectedTemplate)

  const handleCreate = async () => {
    if (!selectedTemplate) {
      toast.error('Selecione um template')
      return
    }
    if (!title.trim()) {
      toast.error('Informe um título')
      return
    }
    await onCreate({
      onboarding_id: onboardingId,
      client_id: clientId,
      template_id: selectedTemplate,
      title: title.trim(),
    })
    onClose()
  }

  return (
    <Modal isOpen onClose={onClose} title="Criar Brief de Discovery" maxWidth="max-w-lg">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'rgba(23,53,87,0.7)', marginBottom: 6 }}>Título do Brief</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            style={{
              width: '100%',
              border: '1px solid #d4d3ce',
              borderRadius: 8,
              padding: '10px 12px',
              fontSize: 13,
              fontFamily: 'inherit',
              color: '#173557',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'rgba(23,53,87,0.7)', marginBottom: 6 }}>Template</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 200, overflowY: 'auto' }}>
            {Object.entries(templatesByType).map(([type, typeTemplates]) => (
              <div key={type}>
                <div style={{ fontSize: 10, fontWeight: 600, color: 'rgba(23,53,87,0.5)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
                  {type}
                </div>
                {typeTemplates.map(t => (
                  <label
                    key={t.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '10px 12px',
                      borderRadius: 6,
                      border: selectedTemplate === t.id ? '1.5px solid #173557' : '1px solid #e2e8f0',
                      background: selectedTemplate === t.id ? 'rgba(23,53,87,0.04)' : '#fff',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <input
                      type="radio"
                      name="template"
                      value={t.id}
                      checked={selectedTemplate === t.id}
                      onChange={() => setSelectedTemplate(t.id)}
                      style={{ accentColor: '#173557' }}
                    />
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500, color: '#173557' }}>{t.name}</div>
                    </div>
                  </label>
                ))}
              </div>
            ))}
            {templates.length === 0 && (
              <div style={{ fontSize: 13, color: 'rgba(23,53,87,0.5)', textAlign: 'center', padding: 20 }}>
                Nenhum template disponível
              </div>
            )}
          </div>
        </div>

        {selectedTemplateData?.structure?.sections && (
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'rgba(23,53,87,0.7)', marginBottom: 6 }}>Preview das Seções</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 180, overflowY: 'auto', padding: 12, background: '#fafbfc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
              {selectedTemplateData.structure.sections.map(sec => (
                <div key={sec.id} style={{ fontSize: 12 }}>
                  <div style={{ fontWeight: 600, color: '#173557' }}>{sec.order}. {sec.title}</div>
                  {sec.deliverable && (
                    <div style={{ fontSize: 11, color: 'rgba(23,53,87,0.6)', marginTop: 2 }}>
                      Entregável: {sec.deliverable}
                    </div>
                  )}
                  <div style={{ fontSize: 10, color: 'rgba(23,53,87,0.4)', marginTop: 2 }}>
                    {sec.questions?.length || 0} perguntas
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, paddingTop: 8, borderTop: '1px solid #e2e8f0' }}>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={handleCreate} disabled={isCreating || !selectedTemplate}>
            {isCreating ? 'Criando...' : 'Criar Brief'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}