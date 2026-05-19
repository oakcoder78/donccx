import { useState } from 'react'
import { Icons } from '@/lib/icons'
import { supabase } from '@/lib/supabaseClient'
import { useBrief, useBriefResponses, useBriefViews } from '@/hooks/useBrief'
import { useAuditLog } from '@/hooks/useAuditLog'
import { Button } from '../ui/Button'
import { Badge } from '../ui/Badge'
import { BriefCreateModal } from './BriefCreateModal'
import { BriefResponsesModal } from './BriefResponsesModal'

const NAVY = '#173557'
const SKY  = '#59c2ed'
const SKY_D = '#0a6a96'
const GREEN = '#1aa56a'
const FONT = "'Montserrat',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"

const STATUS_CONFIG = {
  draft:       { bg: '#e2e8f0',                  color: '#475569', label: 'Rascunho' },
  sent:        { bg: 'rgba(89,194,237,0.15)',     color: '#0a6a96', label: 'Enviado' },
  in_progress: { bg: 'rgba(211,218,71,0.2)',      color: '#4a5c20', label: 'Em progresso' },
  completed:   { bg: '#173557',                   color: '#ffffff', label: 'Concluído' },
  archived:    { bg: 'rgba(23,53,87,0.08)',       color: 'rgba(23,53,87,0.5)', label: 'Arquivado' },
}

function calcProgress(instance, responses) {
  if (!instance?.structure_snapshot?.sections) return { answered: 0, total: 0 }
  let total = 0, answered = 0
  for (const sec of instance.structure_snapshot.sections) {
    for (const q of sec.questions || []) {
      total++
      const resp = responses.find(r => r.question_id === q.id)
      if (resp?.response_text) answered++
    }
  }
  return { answered, total }
}

function formatDate(iso) {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// ── Views modal ─────────────────────────────────────────────────────────────────
function BriefViewsModal({ instance, onClose }) {
  const { data: views = [], isLoading } = useBriefViews(instance.id)

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: FONT }}>
      <div style={{ background: '#fff', borderRadius: 14, maxWidth: 480, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', overflow: 'hidden' }}>
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid rgba(15,34,58,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(23,53,87,0.5)', marginBottom: 3 }}>Visualizações</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: NAVY }}>{instance.title}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, color: 'rgba(23,53,87,0.5)', borderRadius: 6 }}>
            <Icons.X size={16} />
          </button>
        </div>

        <div style={{ maxHeight: 360, overflowY: 'auto', padding: '12px 24px 20px' }}>
          {isLoading ? (
            <div style={{ textAlign: 'center', padding: '24px 0', fontSize: 13, color: 'rgba(23,53,87,0.5)' }}>Carregando…</div>
          ) : views.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '28px 0' }}>
              <Icons.Eye size={28} color="rgba(23,53,87,0.2)" style={{ marginBottom: 10 }} />
              <div style={{ fontSize: 13, color: 'rgba(23,53,87,0.5)' }}>Ainda sem visualizações</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {views.map((v, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 0', borderBottom: i < views.length - 1 ? '1px solid rgba(15,34,58,0.06)' : 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'rgba(89,194,237,0.12)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                      <Icons.User size={13} color={SKY_D} />
                    </div>
                    <span style={{ fontSize: 13, color: NAVY, fontWeight: 500 }}>{v.email}</span>
                  </div>
                  <span style={{ fontSize: 11, color: 'rgba(23,53,87,0.5)', flexShrink: 0, marginLeft: 12 }}>
                    {new Date(v.viewed_at).toLocaleDateString('pt-BR')} {new Date(v.viewed_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Progress bar per card ────────────────────────────────────────────────────────
function ProgressInfo({ instance }) {
  const { responses } = useBriefResponses(instance.id)
  const { answered, total } = calcProgress(instance, responses)
  const pct = total > 0 ? Math.round((answered / total) * 100) : 0

  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
        <span style={{ fontSize: 11, color: 'rgba(23,53,87,0.55)' }}>Progresso</span>
        <span style={{ fontSize: 11, fontWeight: 600, color: NAVY }}>{answered}/{total} respondidas</span>
      </div>
      <div style={{ height: 5, background: 'rgba(23,53,87,0.08)', borderRadius: 999, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: pct === 100 ? GREEN : SKY, borderRadius: 999, transition: 'width 0.3s ease' }} />
      </div>
    </div>
  )
}

// ── Brief card ───────────────────────────────────────────────────────────────────
function BriefCard({ inst, onViewResponses, onSend, onCopyLink, onViewViewers, onDelete, isDeleting }) {
  const viewCount = inst.brief_views?.[0]?.count ?? 0
  const statusCfg = STATUS_CONFIG[inst.status] || STATUS_CONFIG.draft

  return (
    <div style={{ background: '#fafbfc', borderRadius: 10, padding: '14px 16px', border: '1px solid rgba(15,34,58,0.09)' }}>
      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
        <div style={{ minWidth: 0, flex: 1, marginRight: 10 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: NAVY, marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{inst.title}</div>
          <div style={{ fontSize: 11, color: 'rgba(23,53,87,0.5)' }}>
            {inst.sent_at
              ? `Enviado em ${formatDate(inst.sent_at)}`
              : inst.completed_at
              ? `Concluído em ${formatDate(inst.completed_at)}`
              : 'Rascunho'
            }
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          {viewCount > 0 && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 500, color: SKY_D, background: 'rgba(89,194,237,0.10)', padding: '2px 8px', borderRadius: 999 }}>
              <Icons.Eye size={11} />
              {viewCount} {viewCount === 1 ? 'visualização' : 'visualizações'}
            </span>
          )}
          <Badge bg={statusCfg.bg} color={statusCfg.color}>{statusCfg.label}</Badge>
        </div>
      </div>

      <ProgressInfo instance={inst} />

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12 }}>
        {inst.status === 'draft' && (
          <Button variant="primary" size="sm" onClick={onSend}>
            <Icons.Send size={12} style={{ marginRight: 5 }} />Enviar
          </Button>
        )}
        {inst.status !== 'draft' && (
          <Button variant="secondary" size="sm" onClick={onCopyLink}>
            <Icons.Copy size={12} style={{ marginRight: 5 }} />Copiar link
          </Button>
        )}
        <Button variant="secondary" size="sm" onClick={onViewResponses}>
          <Icons.ClipboardList size={12} style={{ marginRight: 5 }} />Ver respostas
        </Button>
        {viewCount > 0 && (
          <Button variant="secondary" size="sm" onClick={onViewViewers}>
            <Icons.Eye size={12} style={{ marginRight: 5 }} />Visualizações
          </Button>
        )}
        <button onClick={onDelete} disabled={isDeleting}
          style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: isDeleting ? 'default' : 'pointer', padding: '0 4px', color: 'rgba(23,53,87,0.3)', opacity: isDeleting ? 0.4 : 1 }}>
          <Icons.Trash2 size={14} />
        </button>
      </div>
    </div>
  )
}

// ── Main export ─────────────────────────────────────────────────────────────────
export function BriefPanel({ onboardingId, clientId, clientName, faseName }) {
  const [showCreate,   setShowCreate]   = useState(false)
  const [showResponses, setShowResponses] = useState(false)
  const [showViews,    setShowViews]    = useState(false)
  const [selectedInstance, setSelectedInstance] = useState(null)

  const { briefInstances, briefTemplates, createBrief, updateBriefStatus, deleteBrief, copyPublicLink, isLoading, isDeleting } = useBrief(onboardingId, clientId)
  const { logAction } = useAuditLog()

  const handleSend = async (inst) => {
    await updateBriefStatus.mutateAsync({ id: inst.id, status: 'sent' })
    await copyPublicLink(inst.access_token)
  }

  const handleCopyLink = async (inst) => {
    await copyPublicLink(inst.access_token)
  }

  const handleViewResponses = (inst) => {
    setSelectedInstance(inst)
    setShowResponses(true)
  }

  const handleViewViewers = (inst) => {
    setSelectedInstance(inst)
    setShowViews(true)
  }

  const handleDelete = async (inst) => {
    const { count } = await supabase
      .from('brief_responses')
      .select('id', { count: 'exact', head: true })
      .eq('instance_id', inst.id)

    const msg = count > 0
      ? `"${inst.title}" tem ${count} resposta(s).\nTodas as respostas, anexos e visualizações serão excluídos permanentemente.\n\nConfirmar exclusão?`
      : `Excluir "${inst.title}"?`

    if (!window.confirm(msg)) return

    await deleteBrief.mutateAsync(inst.id)
    logAction('deleted', 'questionnaire', inst.id, inst.title, {
      status: inst.status,
      has_responses: count,
    })
  }

  if (isLoading) {
    return (
      <div style={{ padding: '16px 0', borderTop: '1px dashed #59c2ed', marginTop: 16 }}>
        <div style={{ fontSize: 13, color: 'rgba(23,53,87,0.5)', fontStyle: 'italic' }}>Carregando...</div>
      </div>
    )
  }

  return (
    <>
      <div style={{ padding: '16px 0', borderTop: '1px dashed #59c2ed', marginTop: 16 }}>
        {/* Panel header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(23,53,87,0.65)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'flex', alignItems: 'center', gap: 8 }}>
            Lista de Questionários
            {briefInstances.length > 0 && (
              <span style={{ fontSize: 10, background: 'rgba(23,53,87,0.08)', color: 'rgba(23,53,87,0.7)', padding: '1px 7px', borderRadius: 999, fontWeight: 600, textTransform: 'none', letterSpacing: 0 }}>
                {briefInstances.length}
              </span>
            )}
          </div>
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Icons.Plus size={14} className="mr-1" />Novo
          </Button>
        </div>

        {/* Body */}
        {briefInstances.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: 13, color: 'rgba(23,53,87,0.6)' }}>Nenhum brief de discovery criado para esta fase</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {briefInstances.map(inst => (
              <BriefCard
                key={inst.id}
                inst={inst}
                onViewResponses={() => handleViewResponses(inst)}
                onSend={() => handleSend(inst)}
                onCopyLink={() => handleCopyLink(inst)}
                onViewViewers={() => handleViewViewers(inst)}
                onDelete={() => handleDelete(inst)}
                isDeleting={isDeleting}
              />
            ))}
          </div>
        )}
      </div>

      {showCreate && (
        <BriefCreateModal
          onboardingId={onboardingId}
          clientId={clientId}
          clientName={clientName}
          faseName={faseName}
          templates={briefTemplates}
          onClose={() => setShowCreate(false)}
          onCreate={createBrief.mutateAsync}
          isCreating={createBrief.isPending}
        />
      )}

      {showResponses && selectedInstance && (
        <BriefResponsesModal
          instance={selectedInstance}
          onClose={() => { setShowResponses(false); setSelectedInstance(null) }}
        />
      )}

      {showViews && selectedInstance && (
        <BriefViewsModal
          instance={selectedInstance}
          onClose={() => { setShowViews(false); setSelectedInstance(null) }}
        />
      )}
    </>
  )
}
