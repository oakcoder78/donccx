import { useState, useRef } from 'react'
import { Modal } from '../ui/Modal'
import { Badge } from '../ui/Badge'
import { useBriefResponses } from '../../hooks/useBrief'
import { Icons } from '../../lib/icons'
import { supabase } from '../../lib/supabaseClient'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'

const STATUS_CONFIG = {
  draft: { bg: '#e2e8f0', color: '#475569', label: 'Rascunho' },
  sent: { bg: 'rgba(89,194,237,0.15)', color: '#0a6a96', label: 'Enviado' },
  in_progress: { bg: 'rgba(211,218,71,0.2)', color: '#4a5c20', label: 'Em progresso' },
  completed: { bg: '#173557', color: '#ffffff', label: 'Concluído' },
}

export function BriefResponsesModal({ instance, onClose }) {
  const qc = useQueryClient()
  const { responses, attachments, isLoading } = useBriefResponses(instance.id)
  const [openSections, setOpenSections] = useState({})
  const [savingId, setSavingId] = useState(null)
  const [uploadingId, setUploadingId] = useState(null)
  const fileInputRefs = useRef({})

  const structure = instance?.structure_snapshot?.sections || []

  const toggleSection = (secId) => {
    setOpenSections(prev => ({ ...prev, [secId]: !prev[secId] }))
  }

  const saveAnswer = useMutation({
    mutationFn: async ({ questionId, answer }) => {
      const { error } = await supabase
        .from('brief_responses')
        .upsert(
          { instance_id: instance.id, question_id: questionId, answer, updated_at: new Date().toISOString() },
          { onConflict: 'instance_id,question_id' }
        )
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['brief_responses', instance.id] })
    },
    onError: e => {
      console.error(e)
      toast.error('Erro ao salvar resposta')
    },
  })

  const uploadAttachment = useMutation({
    mutationFn: async ({ questionId, file }) => {
      const ext = file.name.split('.').pop()
      const path = `brief-attachments/${instance.id}/${questionId}/${Date.now()}_${Math.random().toString(36).slice(2, 6)}.${ext}`
      const { error: upErr } = await supabase.storage.from('activity-attachments').upload(path, file)
      if (upErr) throw upErr
      const { error: dbErr } = await supabase.from('brief_attachments').insert({
        instance_id: instance.id, question_id: questionId, file_name: file.name, file_size: file.size,
        file_type: file.type, storage_path: path,
      })
      if (dbErr) throw dbErr
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['brief_attachments', instance.id] })
      toast.success('Anexo salvo')
    },
    onError: e => {
      console.error(e)
      toast.error('Erro ao anexar arquivo')
    },
  })

  const deleteAttachment = useMutation({
    mutationFn: async (att) => {
      await supabase.storage.from('activity-attachments').remove([att.storage_path])
      const { error } = await supabase.from('brief_attachments').delete().eq('id', att.id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['brief_attachments', instance.id] })
    },
    onError: e => {
      console.error(e)
      toast.error('Erro ao remover anexo')
    },
  })

  const updateStatus = useMutation({
    mutationFn: async (status) => {
      const updates = { status }
      if (status === 'sent') updates.sent_at = new Date().toISOString()
      if (status === 'completed') updates.completed_at = new Date().toISOString()
      const { error } = await supabase.from('brief_instances').update(updates).eq('id', instance.id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['brief_instances', instance.onboarding_id] })
    },
    onError: e => toast.error('Erro ao atualizar status'),
  })

  const copyLink = async () => {
    const url = `${window.location.origin}/brief/${instance.access_token}`
    try {
      await navigator.clipboard.writeText(url)
      toast.success('Link copiado!')
    } catch {
      toast.error('Erro ao copiar link')
    }
  }

  const handleSendToClient = async () => {
    await updateStatus.mutateAsync('sent')
    await copyLink()
  }

  const calcProgress = () => {
    let total = 0, answered = 0
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
    return resp?.answer || ''
  }

  const getQuestionAttachments = (questionId) => {
    return attachments.filter(a => a.question_id === questionId)
  }

  const getGeneralAttachments = () => {
    return attachments.filter(a => !a.question_id)
  }

  const openFirstBlankSection = () => {
    for (const sec of structure) {
      const hasBlank = sec.questions?.some(q => !getAnswer(q.id))
      if (hasBlank) {
        setOpenSections(prev => ({ ...prev, [sec.id]: true }))
        break
      }
    }
  }

  const canSend = instance.status === 'draft' || instance.status === 'in_progress'

  return (
    <Modal isOpen onClose={onClose} title={instance.title} maxWidth="max-w-2xl">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 16, borderBottom: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Badge bg={STATUS_CONFIG[instance.status]?.bg} color={STATUS_CONFIG[instance.status]?.color}>
              {STATUS_CONFIG[instance.status]?.label}
            </Badge>
            {instance.completed_at && (
              <span style={{ fontSize: 12, color: 'rgba(23,53,87,0.5)' }}>
                Concluído em {new Date(instance.completed_at).toLocaleDateString('pt-BR')}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={copyLink}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 7, border: '1px solid rgba(15,34,58,0.14)', background: '#fff', color: '#173557', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              <Icons.Link size={12} />
              Copiar link
            </button>
            {canSend && (
              <button
                onClick={handleSendToClient}
                disabled={updateStatus.isPending}
                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 7, border: 'none', background: '#173557', color: '#fff', fontSize: 12, fontWeight: 500, cursor: updateStatus.isPending ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: updateStatus.isPending ? 0.7 : 1 }}
              >
                <Icons.Send size={12} />
                {updateStatus.isPending ? 'Enviando...' : 'Enviar para cliente'}
              </button>
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
            {structure.map((sec, secIdx) => {
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
                    onClick={() => {
                      if (secIdx === 0 && !isOpen) openFirstBlankSection()
                      else toggleSection(sec.id)
                    }}
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
                    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 20, borderTop: '1px solid #e2e8f0' }}>
                      {sec.questions?.map(q => {
                        const answer = getAnswer(q.id)
                        const qAttachments = getQuestionAttachments(q.id)
                        const isSaving = savingId === q.id
                        const isUploading = uploadingId === q.id

                        return (
                          <div key={q.id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                              <div style={{ fontSize: 12, fontWeight: 500, color: '#173557' }}>
                                {q.order}. {q.text}
                                {q.required && <span style={{ color: '#e53e3e' }}> *</span>}
                              </div>
                              {isSaving && (
                                <span style={{ fontSize: 10, color: '#0a6a96', flexShrink: 0, marginTop: 2 }}>salvando...</span>
                              )}
                            </div>

                            <textarea
                              rows={3}
                              value={answer}
                              placeholder="Digite a resposta..."
                              disabled={isSaving}
                              onChange={e => {
                                const newVal = e.target.value
                                const { error } = supabase
                                  .from('brief_responses')
                                  .upsert(
                                    { instance_id: instance.id, question_id: q.id, answer: newVal, updated_at: new Date().toISOString() },
                                    { onConflict: 'instance_id,question_id' }
                                  )
                                if (!error) qc.invalidateQueries({ queryKey: ['brief_responses', instance.id] })
                              }}
                              onBlur={e => {
                                const newVal = e.target.value
                                const existing = responses.find(r => r.question_id === q.id)?.answer || ''
                                if (newVal !== existing) {
                                  setSavingId(q.id)
                                  saveAnswer.mutate({ questionId: q.id, answer: newVal }, {
                                    onSettled: () => setSavingId(null),
                                  })
                                }
                              }}
                              style={{
                                width: '100%',
                                border: `1px solid ${isSaving ? '#59c2ed' : '#d4d3ce'}`,
                                borderRadius: 7,
                                padding: '8px 12px',
                                fontSize: 13,
                                fontFamily: 'inherit',
                                color: '#173557',
                                background: '#fff',
                                outline: 'none',
                                resize: 'vertical',
                                minHeight: 72,
                                boxSizing: 'border-box',
                                opacity: isSaving ? 0.8 : 1,
                              }}
                            />

                            {qAttachments?.length > 0 && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
                                {qAttachments.map(att => (
                                  <div key={att.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 10px', background: '#f7fafc', borderRadius: 6, border: '1px solid #e2e8f0' }}>
                                    <span style={{ fontSize: 12, color: '#0a6a96', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                                      {att.file_name}
                                    </span>
                                    <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                                      <a
                                        href={att.storage_path}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        style={{ fontSize: 11, color: '#0a6a96', textDecoration: 'none', padding: '2px 4px' }}
                                      >
                                        Ver
                                      </a>
                                      <button
                                        onClick={() => deleteAttachment.mutate(att)}
                                        disabled={deleteAttachment.isPending}
                                        style={{ fontSize: 11, color: '#c44', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', fontFamily: 'inherit' }}
                                      >
                                        Remover
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}

                            <label
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 5,
                                padding: '5px 10px',
                                borderRadius: 6,
                                border: '1px dashed rgba(15,34,58,0.2)',
                                cursor: isUploading ? 'default' : 'pointer',
                                width: 'fit-content',
                                opacity: isUploading ? 0.6 : 1,
                              }}
                            >
                              <Icons.Paperclip size={12} style={{ color: 'rgba(23,53,87,0.6)' }} />
                              <span style={{ fontSize: 11, color: 'rgba(23,53,87,0.7)', fontFamily: 'inherit' }}>
                                {isUploading ? 'Enviando...' : 'Anexar'}
                              </span>
                              <input
                                ref={el => fileInputRefs.current[q.id] = el}
                                type="file"
                                style={{ display: 'none' }}
                                disabled={isUploading}
                                onChange={e => {
                                  const file = e.target.files?.[0]
                                  if (!file) return
                                  setUploadingId(q.id)
                                  uploadAttachment.mutate({ questionId: q.id, file }, {
                                    onSettled: () => {
                                      setUploadingId(null)
                                      if (fileInputRefs.current[q.id]) fileInputRefs.current[q.id].value = ''
                                    },
                                  })
                                }}
                              />
                            </label>
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
                  <Icons.ClipboardList size={14} />
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