import { useState } from 'react'
import { BriefIcons } from '../../lib/icons'
import { useBrief } from '../../hooks/useBrief'
import { Button } from '../ui/Button'
import { Badge } from '../ui/Badge'
import { BriefCreateModal } from './BriefCreateModal'
import { BriefResponsesModal } from './BriefResponsesModal'

const STATUS_CONFIG = {
  draft: { bg: '#e2e8f0', color: '#475569', label: 'Rascunho' },
  sent: { bg: 'rgba(89,194,237,0.15)', color: '#0a6a96', label: 'Enviado' },
  in_progress: { bg: 'rgba(211,218,71,0.2)', color: '#4a5c20', label: 'Em progresso' },
  completed: { bg: '#173557', color: '#ffffff', label: 'Concluído' },
}

function calcProgress(instance, responses) {
  if (!instance?.structure_snapshot?.sections) return { answered: 0, total: 0 }
  let total = 0
  let answered = 0
  for (const sec of instance.structure_snapshot.sections) {
    for (const q of sec.questions || []) {
      total++
      const resp = responses.find(r => r.question_id === q.id)
      if (resp?.answer) answered++
    }
  }
  return { answered, total }
}

export function BriefPanel({ faseId, clientId, clientName, faseName }) {
  const [showCreate, setShowCreate] = useState(false)
  const [showResponses, setShowResponses] = useState(false)
  const [selectedInstance, setSelectedInstance] = useState(null)

  const { briefInstances, briefTemplates, createBrief, updateBriefStatus, copyPublicLink, isLoading } = useBrief(faseId, clientId)

  const instance = briefInstances[0]

  const handleSend = async () => {
    if (!instance) return
    await updateBriefStatus.mutateAsync({ id: instance.id, status: 'sent' })
    await copyPublicLink(instance.access_token)
  }

  const handleCopyLink = async () => {
    if (!instance) return
    await copyPublicLink(instance.access_token)
  }

  const handleViewResponses = (inst) => {
    setSelectedInstance(inst)
    setShowResponses(true)
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(23,53,87,0.65)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'flex', alignItems: 'center', gap: 8 }}>
            Brief de Discovery
            {instance && <span style={{ fontSize: 10, background: 'rgba(23,53,87,0.08)', color: 'rgba(23,53,87,0.7)', padding: '1px 7px', borderRadius: 999, fontWeight: 600, textTransform: 'none', letterSpacing: 0 }}>1</span>}
          </div>
        </div>

        {!instance ? (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: 13, color: 'rgba(23,53,87,0.6)', marginBottom: 12 }}>Nenhum brief de discovery criado para esta fase</div>
            <Button variant="primary" size="sm" onClick={() => setShowCreate(true)}>
              <BriefIcons.template size={14} style={{ marginRight: 6 }} />
              Criar Brief
            </Button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ background: '#fafbfc', borderRadius: 8, padding: 14, border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#173557', marginBottom: 4 }}>{instance.title}</div>
                  <div style={{ fontSize: 11, color: 'rgba(23,53,87,0.5)' }}>
                    {instance.sent_at ? `Enviado em ${new Date(instance.sent_at).toLocaleDateString('pt-BR')}` : 'Rascunho'}
                  </div>
                </div>
                <Badge
                  bg={STATUS_CONFIG[instance.status]?.bg}
                  color={STATUS_CONFIG[instance.status]?.color}
                >
                  {STATUS_CONFIG[instance.status]?.label}
                </Badge>
              </div>

              <ProgressInfo instance={instance} />
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {instance.status === 'draft' && (
                <Button variant="primary" size="sm" onClick={handleSend}>
                  <BriefIcons.send size={14} style={{ marginRight: 6 }} />
                  Enviar
                </Button>
              )}
              {instance.status !== 'draft' && (
                <Button variant="secondary" size="sm" onClick={handleCopyLink}>
                  <BriefIcons.send size={14} style={{ marginRight: 6 }} />
                  Copiar link
                </Button>
              )}
              <Button variant="secondary" size="sm" onClick={() => handleViewResponses(instance)}>
                <BriefIcons.activity size={14} style={{ marginRight: 6 }} />
                Ver respostas
              </Button>
            </div>
          </div>
        )}
      </div>

      {showCreate && (
        <BriefCreateModal
          faseId={faseId}
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
          onClose={() => setShowResponses(false)}
        />
      )}
    </>
  )
}

function ProgressInfo({ instance }) {
  const { responses } = useBriefResponses(instance.id)
  const { answered, total } = calcProgress(instance, responses)

  const pct = total > 0 ? Math.round((answered / total) * 100) : 0

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontSize: 11, color: 'rgba(23,53,87,0.6)' }}>Progresso</span>
        <span style={{ fontSize: 11, fontWeight: 600, color: '#173557' }}>{answered} de {total} perguntas respondidas</span>
      </div>
      <div style={{ height: 6, background: '#e2e8f0', borderRadius: 999, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: '#59c2ed', borderRadius: 999, transition: 'width 0.3s ease' }} />
      </div>
    </div>
  )
}