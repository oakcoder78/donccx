import { useState, useCallback, useRef, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useBriefResponses, useBriefCsmNotes } from '../../hooks/useBrief'
import { Icons } from '../../lib/icons'
import { supabase } from '../../lib/supabaseClient'
import toast from 'react-hot-toast'

const NAVY = '#173557'
const SKY = '#59c2ed'
const LIME = '#d3da47'
const GREEN = '#1aa56a'
const AMBER = '#d98c1e'

const STATUS_CONFIG = {
  draft:       { bg: '#e2e8f0',              color: '#475569',  label: 'Rascunho' },
  sent:        { bg: 'rgba(89,194,237,0.18)', color: '#0a6a96', label: 'Enviado' },
  in_progress: { bg: 'rgba(211,218,71,0.22)', color: '#4a5c20', label: 'Em progresso' },
  completed:   { bg: NAVY,                   color: '#ffffff',  label: 'Concluído' },
  archived:    { bg: '#e2e8f0',              color: '#94a3b8',  label: 'Arquivado' },
}

function relativeTime(isoStr) {
  if (!isoStr) return null
  const diff = (Date.now() - new Date(isoStr).getTime()) / 1000
  if (diff < 60) return 'agora mesmo'
  if (diff < 3600) return `há ${Math.floor(diff / 60)} min`
  if (diff < 86400) return `há ${Math.floor(diff / 3600)} h`
  return `há ${Math.floor(diff / 86400)} dias`
}

// ── SVG progress ring ────────────────────────────────────────────────────────
function ProgressRing({ answered, total, size = 38 }) {
  const r = (size - 6) / 2
  const cx = size / 2
  const circumference = 2 * Math.PI * r
  const pct = total === 0 ? 0 : answered / total
  const done = answered === total && total > 0

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
      <circle cx={cx} cy={cx} r={r} fill="none" stroke="#e2e8f0" strokeWidth="3.5" />
      {pct > 0 && (
        <circle
          cx={cx} cy={cx} r={r}
          fill="none"
          stroke={done ? GREEN : SKY}
          strokeWidth="3.5"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - pct)}
          strokeLinecap="round"
          transform={`rotate(-90 ${cx} ${cx})`}
        />
      )}
      {done ? (
        <text x={cx} y={cx + 4.5} textAnchor="middle" fontSize="13" fill={GREEN} fontWeight="700">✓</text>
      ) : (
        <text x={cx} y={cx + 3.5} textAnchor="middle" fontSize="9" fill={NAVY} fontWeight="600" fontFamily="Montserrat, sans-serif">
          {answered}/{total}
        </text>
      )}
    </svg>
  )
}

// ── Segmented progress bar ───────────────────────────────────────────────────
function SegmentedBar({ structure, responses }) {
  const totalQ = structure.reduce((a, s) => a + (s.questions?.length || 0), 0)
  const totalAnswered = structure.reduce((a, s) => {
    return a + (s.questions?.filter(q => responses.find(r => r.question_id === q.id)?.response_text)?.length || 0)
  }, 0)
  const pct = totalQ > 0 ? Math.round((totalAnswered / totalQ) * 100) : 0

  return (
    <div className="px-5 py-3 border-b border-border-tertiary bg-bg-secondary/50 flex-shrink-0">
      <div className="flex justify-between items-center mb-1.5">
        <span className="text-xs font-semibold text-text-secondary">Progresso Geral</span>
        <span className="text-xs font-semibold" style={{ color: NAVY }}>
          {totalAnswered} de {totalQ} respondidas · {pct}%
        </span>
      </div>
      <div className="flex h-2 rounded-full overflow-hidden gap-px bg-bg-tertiary">
        {structure.map((sec) => {
          const secTotal = sec.questions?.length || 0
          if (secTotal === 0) return null
          const secAns = sec.questions?.filter(q => responses.find(r => r.question_id === q.id)?.response_text).length || 0
          const fillPct = secTotal > 0 ? (secAns / secTotal) * 100 : 0
          const done = secAns === secTotal && secTotal > 0
          const widthPct = (secTotal / totalQ) * 100

          return (
            <div key={sec.id} style={{ width: `${widthPct}%`, position: 'relative', background: '#e2e8f0', overflow: 'hidden' }}>
              <div
                style={{
                  height: '100%',
                  width: `${fillPct}%`,
                  background: done ? GREEN : `linear-gradient(to right, ${SKY}, #3aafe0)`,
                  transition: 'width 0.4s ease',
                }}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── CSM Note area ────────────────────────────────────────────────────────────
function CsmNoteArea({ questionId, savedNote, onSave, onDelete, isSaving }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState({ text: '', isVisible: false })

  const openEdit = (existing) => {
    setDraft({ text: existing?.note_text || '', isVisible: existing?.is_visible || false })
    setEditing(true)
  }

  const handleSave = async () => {
    if (!draft.text.trim()) { toast.error('Nota não pode estar vazia'); return }
    await onSave({ id: savedNote?.id, question_id: questionId, note_text: draft.text.trim(), is_visible: draft.isVisible })
    setEditing(false)
  }

  const handleCancel = () => setEditing(false)

  if (editing) {
    return (
      <div className="mt-2 rounded-lg border border-border-tertiary overflow-hidden">
        <div className="px-3 py-2 bg-bg-secondary flex items-center justify-between border-b border-border-tertiary">
          <span className="text-xs font-semibold text-text-secondary">Nota interna do CSM</span>
          <button
            type="button"
            onClick={() => setDraft(d => ({ ...d, isVisible: !d.isVisible }))}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors"
            style={draft.isVisible
              ? { background: `${LIME}20`, borderColor: `${LIME}60`, color: '#4a5c20' }
              : { background: `${NAVY}0c`, borderColor: `${NAVY}20`, color: NAVY }
            }
          >
            {draft.isVisible
              ? <><Icons.Eye size={12} /> Visível ao cliente</>
              : <><Icons.EyeOff size={12} /> Apenas interno</>
            }
          </button>
        </div>
        <textarea
          value={draft.text}
          onChange={e => setDraft(d => ({ ...d, text: e.target.value }))}
          rows={3}
          placeholder="Adicione uma observação interna sobre esta resposta…"
          autoFocus
          className="w-full px-3 py-2.5 text-sm bg-bg-primary text-text-primary placeholder-text-tertiary outline-none resize-none"
          style={{ fontFamily: 'inherit' }}
        />
        <div className="flex justify-end gap-2 px-3 py-2 border-t border-border-tertiary bg-bg-secondary">
          <button
            onClick={handleCancel}
            className="text-xs px-3 py-1.5 rounded-md text-text-secondary hover:bg-bg-tertiary transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="text-xs px-3 py-1.5 rounded-md text-white font-medium disabled:opacity-50 transition-colors"
            style={{ background: NAVY }}
          >
            {isSaving ? 'Salvando…' : 'Salvar nota'}
          </button>
        </div>
      </div>
    )
  }

  if (savedNote) {
    const isVisible = savedNote.is_visible
    return (
      <div
        className="mt-2 rounded-lg px-3 py-2.5 text-sm"
        style={isVisible
          ? { background: `${NAVY}08`, borderLeft: `3px solid ${NAVY}` }
          : { background: `${LIME}14`, borderLeft: `3px solid ${LIME}` }
        }
      >
        <div className="flex items-center justify-between gap-2 mb-1">
          <div className="flex items-center gap-1.5">
            {isVisible
              ? <Icons.Eye size={12} style={{ color: NAVY }} />
              : <Icons.EyeOff size={12} style={{ color: '#4a5c20' }} />
            }
            <span className="text-xs font-semibold" style={{ color: isVisible ? NAVY : '#4a5c20' }}>
              {isVisible ? 'Nota da equipe DONC' : 'Nota interna'}
            </span>
          </div>
          <div className="flex gap-1">
            <button
              onClick={() => openEdit(savedNote)}
              className="text-xs px-2 py-0.5 rounded text-text-tertiary hover:text-text-primary hover:bg-bg-secondary transition-colors"
            >
              Editar
            </button>
            <button
              onClick={() => onDelete(savedNote.id)}
              className="text-xs px-2 py-0.5 rounded text-text-tertiary hover:text-red-500 hover:bg-bg-secondary transition-colors"
            >
              Remover
            </button>
          </div>
        </div>
        <p className="text-text-primary text-sm leading-relaxed">{savedNote.note_text}</p>
      </div>
    )
  }

  return (
    <button
      onClick={() => openEdit(null)}
      className="mt-2 w-full text-left text-xs text-text-tertiary hover:text-[#59c2ed] py-1.5 px-2 rounded-md border border-dashed border-transparent hover:border-[#59c2ed]/40 transition-all flex items-center gap-1.5"
    >
      <Icons.Plus size={11} />
      Adicionar nota interna
    </button>
  )
}

// ── Client Doubts Panel ───────────────────────────────────────────────────────
function ClientDoubtsPanel({ clientQuestions, structure, onReply, onToggleVisibility, isReplying, targetId }) {
  const [drafts, setDrafts] = useState({})
  const [editingIds, setEditingIds] = useState({})
  const itemRefs = useRef({})

  useEffect(() => {
    if (!targetId) return
    const target = clientQuestions.find(cq => cq.question_id === targetId)
    if (target && itemRefs.current[target.id]) {
      setTimeout(() => itemRefs.current[target.id]?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80)
    }
  }, [targetId])

  const getQText = (qId) => {
    if (!qId) return null
    for (const sec of structure) {
      const q = sec.questions?.find(q => q.id === qId)
      if (q) return q.text
    }
    return null
  }

  const openReply = (id, existing = '') => {
    setDrafts(d => ({ ...d, [id]: existing }))
    setEditingIds(e => ({ ...e, [id]: true }))
  }

  const cancelReply = (id) => setEditingIds(e => ({ ...e, [id]: false }))

  const submitReply = async (q) => {
    const text = (drafts[q.id] || '').trim()
    if (!text) { toast.error('Resposta não pode estar vazia'); return }
    await onReply({ id: q.id, csm_reply: text })
    setEditingIds(e => ({ ...e, [q.id]: false }))
  }

  if (clientQuestions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-text-tertiary py-20">
        <Icons.MessageCircle size={40} style={{ opacity: 0.2, marginBottom: 12 }} />
        <p className="text-sm">Nenhuma dúvida enviada pelo cliente até o momento.</p>
      </div>
    )
  }

  return (
    <div className="p-5 space-y-4">
      {clientQuestions.map(q => {
        const hasReply = !!q.csm_reply
        const isEditing = !!editingIds[q.id]
        const qText = getQText(q.question_id)
        const replied = hasReply && !isEditing

        let borderColor = 'rgba(217,140,30,0.35)'
        let bg = 'rgba(217,140,30,0.06)'
        let badgeLabel = 'Aguardando resposta'
        let badgeBg = 'rgba(217,140,30,0.15)'
        let badgeColor = '#92520a'

        if (replied && q.is_visible) {
          borderColor = 'rgba(26,165,106,0.35)'
          bg = 'rgba(26,165,106,0.06)'
          badgeLabel = 'Respondida · visível ao cliente'
          badgeBg = 'rgba(26,165,106,0.15)'
          badgeColor = '#117a4f'
        } else if (replied && !q.is_visible) {
          borderColor = 'rgba(148,163,184,0.4)'
          bg = '#f8fafc'
          badgeLabel = 'Respondida · interna'
          badgeBg = '#e2e8f0'
          badgeColor = '#475569'
        }

        return (
          <div
            key={q.id}
            ref={el => { itemRefs.current[q.id] = el }}
            className="rounded-xl border p-4"
            style={{ borderColor, background: bg }}
          >
            {/* Doubt header */}
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="flex items-center gap-2 min-w-0">
                <Icons.MessageCircle size={14} style={{ color: '#92520a', flexShrink: 0 }} />
                <span className="text-xs font-semibold text-text-primary truncate">
                  {q.client_name || q.client_email}
                </span>
                <span className="text-xs text-text-tertiary flex-shrink-0">
                  · {new Date(q.created_at).toLocaleDateString('pt-BR')}
                </span>
              </div>
              <span
                className="text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0"
                style={{ background: badgeBg, color: badgeColor }}
              >
                {badgeLabel}
              </span>
            </div>

            {/* Doubt text */}
            <p className="text-sm text-text-primary leading-relaxed mb-2">{q.note_text}</p>

            {/* Linked question tag */}
            {qText && (
              <div
                className="mb-3 inline-flex items-center gap-1.5 text-[10px] px-2 py-1 rounded-md"
                style={{ background: `${NAVY}0c`, color: NAVY }}
              >
                <Icons.ClipboardList size={10} />
                {qText.length > 64 ? qText.slice(0, 64) + '…' : qText}
              </div>
            )}

            {/* Reply area */}
            {replied ? (
              <div
                className="mt-1 rounded-lg px-3 py-2.5"
                style={{ background: `${GREEN}08`, borderLeft: `3px solid ${GREEN}` }}
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-xs font-semibold" style={{ color: GREEN }}>Resposta do CSM</span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => onToggleVisibility(q)}
                      className="text-[10px] px-2 py-0.5 rounded border transition-colors text-text-tertiary hover:text-text-primary"
                      style={{ borderColor: 'var(--color-border-tertiary)' }}
                    >
                      {q.is_visible ? 'Tornar interno' : 'Tornar visível'}
                    </button>
                    <button
                      onClick={() => openReply(q.id, q.csm_reply)}
                      className="text-[10px] px-2 py-0.5 rounded text-text-tertiary hover:text-text-primary hover:bg-bg-secondary transition-colors"
                    >
                      Editar resposta
                    </button>
                  </div>
                </div>
                <p className="text-sm text-text-primary leading-relaxed">{q.csm_reply}</p>
                {q.replied_at && (
                  <div className="text-[10px] text-text-tertiary mt-1">
                    {new Date(q.replied_at).toLocaleDateString('pt-BR')}
                  </div>
                )}
              </div>
            ) : isEditing ? (
              <div className="mt-2 rounded-lg border border-border-tertiary overflow-hidden">
                <textarea
                  value={drafts[q.id] || ''}
                  onChange={e => setDrafts(d => ({ ...d, [q.id]: e.target.value }))}
                  rows={3}
                  placeholder="Digite a resposta…"
                  autoFocus
                  className="w-full px-3 py-2.5 text-sm bg-bg-primary text-text-primary placeholder-text-tertiary outline-none resize-none"
                  style={{ fontFamily: 'inherit' }}
                />
                <div className="flex justify-end gap-2 px-3 py-2 border-t border-border-tertiary bg-bg-secondary">
                  <button
                    onClick={() => cancelReply(q.id)}
                    className="text-xs px-3 py-1.5 rounded-md text-text-secondary hover:bg-bg-tertiary transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => submitReply(q)}
                    disabled={isReplying}
                    className="text-xs px-3 py-1.5 rounded-md text-white font-medium disabled:opacity-50 transition-colors"
                    style={{ background: NAVY }}
                  >
                    {isReplying ? 'Salvando…' : 'Responder'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-2">
                <button
                  onClick={() => openReply(q.id, '')}
                  className="text-xs px-3 py-1.5 rounded-lg text-white font-medium transition-colors"
                  style={{ background: NAVY }}
                >
                  Responder
                </button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Question card ────────────────────────────────────────────────────────────
function QuestionCard({ question, idx, response, attachments, savedNote, onSaveNote, onDeleteNote, isSavingNote, clientQsForQ, onShowDoubts }) {
  const hasResponse = !!response?.response_text

  const handleDownload = useCallback(async (att) => {
    const { data, error } = await supabase.storage
      .from('project-briefs')
      .createSignedUrl(att.storage_path, 300)
    if (error || !data?.signedUrl) { toast.error('Erro ao gerar link'); return }
    window.open(data.signedUrl, '_blank', 'noopener')
  }, [])

  return (
    <div
      className="rounded-xl border transition-all p-4 mb-3"
      style={hasResponse
        ? { borderColor: 'rgba(34,160,98,0.32)', background: '#f9fcfa' }
        : { borderColor: 'var(--color-border-tertiary)', background: '#fff' }
      }
    >
      {/* Question header */}
      <div className="flex items-start gap-2 mb-3">
        <span className="w-5 h-5 rounded text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5"
          style={{ background: hasResponse ? 'rgba(34,160,98,0.15)' : 'rgba(23,53,87,0.08)', color: hasResponse ? GREEN : NAVY }}>
          {idx + 1}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2 flex-wrap">
            <span className="text-sm font-medium text-text-primary leading-snug flex-1">
              {question.text}
              {question.required && <span className="text-red-400 ml-0.5">*</span>}
            </span>
            {hasResponse && (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0"
                style={{ background: 'rgba(34,160,98,0.15)', color: GREEN }}>
                Respondida
              </span>
            )}
          </div>

          {question.note && (
            <div className="mt-1.5 flex items-start gap-1.5 text-xs px-2 py-1.5 rounded-md"
              style={{ background: `${SKY}0c`, border: `1px solid ${SKY}30` }}>
              <Icons.HelpCircle size={12} className="flex-shrink-0 mt-0.5" style={{ color: SKY }} />
              <span className="text-text-secondary">{question.note}</span>
            </div>
          )}
        </div>
      </div>

      {/* Response (read-only) */}
      {hasResponse ? (
        <div className="ml-7 mb-2">
          <div className="text-xs text-text-tertiary mb-1 font-medium">Resposta do cliente</div>
          <div
            className="text-sm text-text-primary leading-relaxed px-3 py-2 rounded-lg whitespace-pre-wrap"
            style={{ background: 'rgba(34,160,98,0.06)', border: '1px solid rgba(34,160,98,0.18)' }}
          >
            {response.response_text}
          </div>
          {response.responded_by_name && (
            <div className="text-[10px] text-text-tertiary mt-1">
              Por {response.responded_by_name}
              {response.responded_at && ` · ${new Date(response.responded_at).toLocaleDateString('pt-BR')}`}
            </div>
          )}
        </div>
      ) : (
        <div className="ml-7 mb-2">
          <div className="text-xs text-text-tertiary italic px-3 py-2 rounded-lg border border-dashed border-border-tertiary bg-bg-secondary">
            Sem resposta ainda
          </div>
        </div>
      )}

      {/* Attachments */}
      {attachments?.length > 0 && (
        <div className="ml-7 mb-2 flex flex-col gap-1">
          {attachments.map(att => (
            <div key={att.id}
              className="flex items-center justify-between px-2.5 py-1.5 rounded-lg border border-border-tertiary bg-bg-secondary">
              <div className="flex items-center gap-2 min-w-0">
                <Icons.Paperclip size={11} className="text-text-tertiary flex-shrink-0" />
                <span className="text-xs text-text-primary truncate">{att.file_name}</span>
                {att.file_size && (
                  <span className="text-[10px] text-text-tertiary flex-shrink-0">
                    {att.file_size < 1024 * 1024
                      ? `${Math.round(att.file_size / 1024)}KB`
                      : `${(att.file_size / (1024 * 1024)).toFixed(1)}MB`
                    }
                  </span>
                )}
              </div>
              <button
                onClick={() => handleDownload(att)}
                className="flex items-center gap-1 text-xs px-2 py-0.5 rounded text-[#0a6a96] hover:bg-[#59c2ed]/10 transition-colors flex-shrink-0 ml-2"
              >
                <Icons.Download size={11} />
                Ver
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Client doubts indicator */}
      {clientQsForQ?.length > 0 && (
        <div className="ml-7 mb-2">
          <button
            onClick={onShowDoubts}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-opacity hover:opacity-75"
            style={{ background: 'rgba(217,140,30,0.08)', border: '1px solid rgba(217,140,30,0.35)' }}
          >
            <Icons.MessageCircle size={13} style={{ color: '#92520a', flexShrink: 0 }} />
            <span className="text-xs font-medium flex-1" style={{ color: '#92520a' }}>
              {clientQsForQ.length === 1 ? '1 dúvida do cliente' : `${clientQsForQ.length} dúvidas`}
            </span>
            <Icons.ChevronRight size={11} style={{ color: '#92520a' }} />
          </button>
        </div>
      )}

      {/* CSM note */}
      <div className="ml-7">
        <CsmNoteArea
          questionId={question.id}
          savedNote={savedNote}
          onSave={onSaveNote}
          onDelete={onDeleteNote}
          isSaving={isSavingNote}
        />
      </div>
    </div>
  )
}

// ── Main modal ───────────────────────────────────────────────────────────────
export function BriefResponsesModal({ instance, onClose }) {
  const qc = useQueryClient()
  const structure = instance?.structure_snapshot?.sections || []
  const [activeSectionIdx, setActiveSectionIdx] = useState(0)
  const [activeView, setActiveView] = useState('section') // 'section' | 'doubts'
  const [doubtTarget, setDoubtTarget] = useState(null) // question_id to scroll to in doubts panel

  const { responses, attachments, isLoading } = useBriefResponses(instance.id)
  const {
    csmNotes,
    clientQuestions,
    upsertCsmNote,
    deleteCsmNote,
    isUpsertingNote,
    replyToQuestion,
    isReplying,
  } = useBriefCsmNotes(instance.id)

  const activeSection = structure[activeSectionIdx] ?? null
  const unansweredCount = clientQuestions.filter(q => !q.csm_reply).length

  const updateStatus = useMutation({
    mutationFn: async (status) => {
      const updates = { status }
      if (status === 'sent') updates.sent_at = new Date().toISOString()
      const { error } = await supabase.from('brief_instances').update(updates).eq('id', instance.id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['brief_instances', instance.onboarding_id] })
      toast.success('Status atualizado')
    },
    onError: () => toast.error('Erro ao atualizar status'),
  })

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/brief/${instance.access_token}`)
      toast.success('Link copiado!')
    } catch {
      toast.error('Erro ao copiar link')
    }
  }

  const handleSendToClient = async () => {
    await updateStatus.mutateAsync('sent')
    await copyLink()
  }

  const handleShowDoubts = useCallback((questionId) => {
    setActiveView('doubts')
    setDoubtTarget(questionId)
  }, [])

  const handleToggleClientQVisibility = useCallback(async (q) => {
    await upsertCsmNote.mutateAsync({ id: q.id, question_id: q.question_id, note_text: q.note_text, is_visible: !q.is_visible })
    qc.invalidateQueries({ queryKey: ['brief_client_questions', instance.id] })
  }, [upsertCsmNote, qc, instance.id])

  const handleReplyToQuestion = useCallback(async ({ id, csm_reply }) => {
    await replyToQuestion.mutateAsync({ id, csm_reply })
  }, [replyToQuestion])

  const selectSection = (idx) => {
    setActiveSectionIdx(idx)
    setActiveView('section')
  }

  const getResponse = (qId) => responses.find(r => r.question_id === qId)
  const getAttachments = (qId) => attachments.filter(a => a.question_id === qId)
  const getNoteForQ = (qId) => csmNotes.find(n => n.question_id === qId && n.origin === 'csm')
  const getClientQsForQ = (qId) => clientQuestions.filter(q => q.question_id === qId)

  const canSend = instance.status === 'draft' || instance.status === 'in_progress'
  const statusCfg = STATUS_CONFIG[instance.status] ?? STATUS_CONFIG.draft
  const updatedAt = instance.updated_at || instance.created_at

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-bg-primary rounded-xl w-full flex flex-col overflow-hidden shadow-2xl"
        style={{ maxWidth: 1000, maxHeight: '92vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="px-5 pt-5 pb-4 border-b border-border-tertiary flex-shrink-0">
          <div className="flex items-start gap-3 justify-between">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 text-xs text-text-tertiary mb-1">
                <Icons.ClipboardList size={13} style={{ color: SKY }} />
                <span>Roteiro do Cliente</span>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <h2 className="text-lg font-bold text-text-primary truncate">{instance.title}</h2>
                <span
                  className="text-xs font-semibold px-2.5 py-0.5 rounded-full flex-shrink-0"
                  style={{ background: statusCfg.bg, color: statusCfg.color }}
                >
                  {statusCfg.label}
                </span>
                {instance.completed_at && (
                  <span className="text-xs text-text-tertiary flex-shrink-0">
                    Concluído em {new Date(instance.completed_at).toLocaleDateString('pt-BR')}
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={copyLink}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-border-tertiary bg-bg-secondary hover:bg-bg-tertiary transition-colors font-medium text-text-primary"
              >
                <Icons.Link size={13} />
                Copiar link
              </button>
              {canSend && (
                <button
                  onClick={handleSendToClient}
                  disabled={updateStatus.isPending}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium text-white disabled:opacity-60 transition-colors"
                  style={{ background: NAVY }}
                >
                  <Icons.Send size={13} />
                  {updateStatus.isPending ? 'Enviando…' : 'Enviar para cliente'}
                </button>
              )}
              <button
                onClick={onClose}
                className="p-1.5 rounded-md text-text-tertiary hover:text-text-primary hover:bg-bg-secondary transition-colors"
              >
                <Icons.X size={18} />
              </button>
            </div>
          </div>
        </div>

        {/* ── Segmented progress bar ── */}
        <SegmentedBar structure={structure} responses={responses} />

        {/* ── Body: rail + panel ── */}
        {isLoading ? (
          <div className="flex-1 flex items-center justify-center text-text-tertiary text-sm">
            Carregando respostas…
          </div>
        ) : (
          <div className="flex flex-1 overflow-hidden">

            {/* Left rail */}
            <div className="flex-shrink-0 border-r border-border-tertiary flex flex-col overflow-hidden" style={{ width: 240 }}>
              <div className="px-3 py-2.5 border-b border-border-tertiary flex-shrink-0">
                <span className="text-xs font-semibold text-text-secondary">Seções</span>
              </div>
              <div className="flex-1 overflow-y-auto p-2">
                {structure.map((sec, idx) => {
                  const secTotal = sec.questions?.length || 0
                  const secAns = sec.questions?.filter(q => getResponse(q.id)?.response_text).length || 0
                  const isActive = activeView === 'section' && idx === activeSectionIdx

                  return (
                    <button
                      key={sec.id}
                      onClick={() => selectSection(idx)}
                      className={`w-full flex items-center gap-2.5 px-2.5 py-2.5 rounded-lg text-left mb-1 transition-all
                        ${isActive
                          ? 'border border-[#59c2ed] bg-white shadow-sm'
                          : 'border border-transparent hover:bg-bg-secondary'
                        }`}
                    >
                      <ProgressRing answered={secAns} total={secTotal} size={38} />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-text-primary truncate leading-tight">{sec.title}</div>
                        <div className="text-[10px] text-text-tertiary mt-0.5">{secAns}/{secTotal} respondidas</div>
                      </div>
                    </button>
                  )
                })}

                {/* Separator + Doubts item */}
                <div className="mx-1 my-2 border-t border-border-tertiary" />
                <button
                  onClick={() => { setActiveView('doubts'); setDoubtTarget(null) }}
                  className={`w-full flex items-center gap-2.5 px-2.5 py-2.5 rounded-lg text-left transition-all
                    ${activeView === 'doubts'
                      ? 'border border-[#59c2ed] bg-white shadow-sm'
                      : 'border border-transparent hover:bg-bg-secondary'
                    }`}
                >
                  <div
                    className="w-9 h-9 flex items-center justify-center rounded-full flex-shrink-0"
                    style={{ background: activeView === 'doubts' ? `${SKY}14` : 'var(--color-bg-secondary)' }}
                  >
                    <Icons.MessageCircle
                      size={18}
                      style={{ color: activeView === 'doubts' ? SKY : 'var(--color-text-tertiary)' }}
                    />
                  </div>
                  <div className="flex-1 min-w-0 flex items-center justify-between gap-1">
                    <span className="text-xs font-semibold text-text-primary">Dúvidas</span>
                    {unansweredCount > 0 && (
                      <span
                        className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                        style={{ background: 'rgba(196,68,68,0.14)', color: '#b42828' }}
                      >
                        {unansweredCount}
                      </span>
                    )}
                  </div>
                </button>
              </div>

              {/* Rail footer */}
              <div className="px-3 py-2 border-t border-border-tertiary flex-shrink-0">
                <div className="flex items-center gap-1.5 text-[10px] text-text-tertiary">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 flex-shrink-0" />
                  Salvo automaticamente
                </div>
              </div>
            </div>

            {/* Right panel */}
            <div className="flex-1 overflow-y-auto min-w-0">
              {activeView === 'doubts' ? (
                <>
                  <div className="sticky top-0 z-10 bg-bg-primary border-b border-border-tertiary px-5 py-3 flex-shrink-0">
                    <div className="text-xs text-text-tertiary mb-0.5">Perguntas dos clientes</div>
                    <h3 className="text-base font-bold" style={{ color: NAVY }}>Dúvidas do cliente</h3>
                    <p className="text-xs text-text-tertiary mt-0.5">
                      Perguntas enviadas pelo cliente durante o preenchimento
                    </p>
                  </div>
                  <ClientDoubtsPanel
                    clientQuestions={clientQuestions}
                    structure={structure}
                    onReply={handleReplyToQuestion}
                    onToggleVisibility={handleToggleClientQVisibility}
                    isReplying={isReplying}
                    targetId={doubtTarget}
                  />
                </>
              ) : activeSection ? (
                <>
                  {/* Sticky section header */}
                  <div className="sticky top-0 z-10 bg-bg-primary border-b border-border-tertiary px-5 py-3 flex-shrink-0">
                    <div className="text-xs text-text-tertiary mb-0.5">
                      Seção {activeSectionIdx + 1} de {structure.length}
                    </div>
                    <h3 className="text-base font-bold" style={{ color: NAVY }}>{activeSection.title}</h3>
                    {activeSection.deliverable && (
                      <p className="text-xs text-text-tertiary mt-1 max-w-xl">
                        <span className="font-medium" style={{ color: SKY }}>Entregável:</span>{' '}
                        {activeSection.deliverable}
                      </p>
                    )}
                  </div>

                  {/* Questions */}
                  <div className="p-5">
                    {(activeSection.questions || []).map((q, qIdx) => (
                      <QuestionCard
                        key={q.id}
                        question={q}
                        idx={qIdx}
                        response={getResponse(q.id)}
                        attachments={getAttachments(q.id)}
                        savedNote={getNoteForQ(q.id)}
                        onSaveNote={(payload) => upsertCsmNote.mutateAsync(payload)}
                        onDeleteNote={(id) => deleteCsmNote.mutateAsync(id)}
                        isSavingNote={isUpsertingNote}
                        clientQsForQ={getClientQsForQ(q.id)}
                        onShowDoubts={() => handleShowDoubts(q.id)}
                      />
                    ))}
                    {(activeSection.questions || []).length === 0 && (
                      <div className="text-center py-12 text-text-tertiary text-sm">
                        Nenhuma pergunta nesta seção
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-center h-full text-sm text-text-tertiary">
                  Selecione uma seção
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Footer ── */}
        <div className="px-5 py-3 border-t border-border-tertiary bg-bg-secondary flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2 text-xs text-text-tertiary">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 flex-shrink-0" />
            <span>Salvo automaticamente</span>
            {updatedAt && <span>· {relativeTime(updatedAt)}</span>}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => selectSection(Math.max(0, activeSectionIdx - 1))}
              disabled={activeView === 'doubts' || activeSectionIdx === 0}
              className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg border border-border-tertiary bg-bg-primary text-text-secondary hover:bg-bg-secondary disabled:opacity-40 transition-colors"
            >
              <Icons.ArrowLeft size={13} />
              Anterior
            </button>
            <button
              onClick={() => selectSection(Math.min(structure.length - 1, activeSectionIdx + 1))}
              disabled={activeView === 'doubts' || activeSectionIdx >= structure.length - 1}
              className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg border border-border-tertiary bg-bg-primary text-text-secondary hover:bg-bg-secondary disabled:opacity-40 transition-colors"
            >
              Próxima seção
              <Icons.ChevronRight size={13} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
