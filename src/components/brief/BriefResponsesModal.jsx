import { useState } from 'react'
import { Modal } from '../ui/Modal'
import { Badge } from '../ui/Badge'
import { useBriefResponses } from '../../hooks/useBrief'
import { BriefIcons } from '../../lib/icons'

const STATUS_CONFIG = {
  draft: { bg: '#e2e8f0', color: '#475569', label: 'Rascunho' },
  sent: { bg: 'rgba(89,194,237,0.15)', color: '#0a6a96', label: 'Enviado' },
  in_progress: { bg: 'rgba(211,218,71,0.2)', color: '#4a5c20', label: 'Em progresso' },
  completed: { bg: '#173557', color: '#ffffff', label: 'Concluído' },
}

export function BriefResponsesModal({ instance, onClose }) {
  const { responses, attachments, isLoading } = useBriefResponses(instance.id)
  const [openSections, setOpenSections] = useState({})

  const structure = instance?.structure_snapshot?.sections || []

  const toggleSection = (secId) => {
    setOpenSections(prev => ({
      ...prev,
      [secId]: !prev[secId],
    }))
  }

  const calcProgress = () => {
    let total = 0
    let answered = 0
    for (const sec of structure) {
      for (const q of sec.questions || []) {
        total++
        const resp = responses.find(r => r.question_id === q.id)
        if (resp?.answer) answered++
      }
    }
    return { answered, total }
  }

  const { answered, total } = calcProgress()
  const pct = total > 0 ? Math.round((answered / total) * 100) : 0

  const getAnswer = (questionId) => {
    const resp = responses.find(r => r.question_id === questionId)
    return resp?.answer || null
  }

  const getQuestionAttachments = (questionId) => {
    return attachments.filter(a => a.question_id === questionId)
  }

  const getGeneralAttachments = () => {
    return attachments.filter(a => !a.question_id)
  }

  return (
    <Modal isOpen onClose={onClose} title={instance.title} maxWidth="max-w-2xl">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 16, borderBottom: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Badge bg={STATUS_CONFIG[instance.status]?.bg} color={STATUS_CONFIG[instance.status]?.color}>
              {STATUS_CONFIG[instance.status]?.label}
            </Badge>
            {instance.completed_at && (
              <span style={{ fontSize: 12, color: 'rgba(23,53,87,0.5)' }}>
                Concluído em {new Date(instance.completed_at).toLocaleDateString('pt-BR')}
              </span>
            )}
          </div>
        </div>

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(23,53,87,0.7)' }}>Progresso Geral</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#173557' }}>{answered} / {total} ({pct}%)</span>
          </div>
          <div style={{ height: 8, background: '#e2e8f0', borderRadius: 999, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${pct}%`, background: '#59c2ed', borderRadius: 999, transition: 'width 0.3s ease' }} />
          </div>
        </div>

        {isLoading ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'rgba(23,53,87,0.5)' }}>Carregando respostas...</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {structure.map(sec => {
              const secAnswered = sec.questions?.filter(q => getAnswer(q.id)).length || 0
              const secTotal = sec.questions?.length || 0
              const isOpen = openSections[sec.id]

              return (
                <div key={sec.id} style={{ border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '12px 16px',
                      background: '#fafbfc',
                      cursor: 'pointer',
                    }}
                    onClick={() => toggleSection(sec.id)}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 12, transform: isOpen ? 'rotate(90deg)' : 'rotate(0)', transition: 'transform 0.2s ease' }}>▶</span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#173557' }}>{sec.order}. {sec.title}</span>
                    </div>
                    <span style={{ fontSize: 11, color: 'rgba(23,53,87,0.5)' }}>
                      {secAnswered}/{secTotal}
                    </span>
                  </div>

                  {isOpen && (
                    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16, borderTop: '1px solid #e2e8f0' }}>
                      {sec.questions?.map(q => {
                        const answer = getAnswer(q.id)
                        const qAttachments = getQuestionAttachments(q.id)

                        return (
                          <div key={q.id}>
                            <div style={{ fontSize: 12, fontWeight: 500, color: '#173557', marginBottom: 6 }}>
                              {q.order}. {q.text}
                              {q.required && <span style={{ color: '#e53e3e' }}> *</span>}
                            </div>
                            {answer ? (
                              <div style={{ fontSize: 13, color: '#2d3748', background: '#f7fafc', padding: '8px 12px', borderRadius: 6, border: '1px solid #e2e8f0' }}>
                                {answer}
                              </div>
                            ) : (
                              <div style={{ fontSize: 12, color: '#a0aec0', fontStyle: 'italic' }}>Não respondida</div>
                            )}
                            {qAttachments?.length > 0 && (
                              <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                                {qAttachments.map(att => (
                                  <a
                                    key={att.id}
                                    href={att.storage_path}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{ fontSize: 12, color: '#0a6a96', display: 'flex', alignItems: 'center', gap: 4 }}
                                  >
                                    📎 {att.file_name}
                                  </a>
                                ))}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {getGeneralAttachments().length > 0 && (
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(23,53,87,0.7)', marginBottom: 8 }}>Anexos Gerais</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {getGeneralAttachments().map(att => (
                <a
                  key={att.id}
                  href={att.storage_path}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: 13, color: '#0a6a96', display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', background: '#f7fafc', borderRadius: 6, textDecoration: 'none' }}
                >
                  <BriefIcons.activity size={14} />
                  {att.file_name}
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}