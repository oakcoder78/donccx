import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useClientReports, useReportMutations, useReportViews } from '../../../../hooks/useClientReports'
import { useAuth } from '../../../../contexts/AuthContext'
import { Button } from '../../../ui/Button'
import { Badge } from '../../../ui/Badge'
import { Modal } from '../../../ui/Modal'
import toast from 'react-hot-toast'

const MONTH_NAMES = [
  '','Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro',
]

function formatDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('pt-BR')
}

function periodLabel(period) {
  if (!period) return ''
  const [y, m] = period.split('-')
  return `${MONTH_NAMES[parseInt(m, 10)].slice(0, 3)}/${y}`
}

// ─── Modal de Visualizações ──────────────────────────────────
function ViewsModal({ reportId, onClose }) {
  const { data: views = [], isLoading } = useReportViews(reportId)
  return (
    <Modal isOpen onClose={onClose} title="Visualizações do Relatório" maxWidth="max-w-md">
      {isLoading ? (
        <p className="text-sm text-text-tertiary text-center py-6">Carregando…</p>
      ) : views.length === 0 ? (
        <p className="text-sm text-text-tertiary text-center py-6">Nenhuma visualização registrada ainda.</p>
      ) : (
        <div className="space-y-1 max-h-80 overflow-y-auto">
          {views.map(v => (
            <div
              key={v.id}
              className="flex items-center justify-between py-2 border-b border-border-tertiary last:border-0 text-sm"
            >
              <span className="text-text-primary font-medium truncate">{v.email}</span>
              <span className="text-text-tertiary text-xs flex-shrink-0 ml-3">
                {new Date(v.viewed_at).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })}
              </span>
            </div>
          ))}
        </div>
      )}
    </Modal>
  )
}

// ─── Modal de Autorizar E-mail ───────────────────────────────
function AllowEmailModal({ report, onClose, allowEmail }) {
  const [newEmail, setNewEmail] = useState('')

  async function handleAdd() {
    if (!newEmail.trim()) return
    await allowEmail.mutateAsync({
      id:            report.id,
      email:         newEmail.trim(),
      currentEmails: report.allowed_emails || [],
    })
    setNewEmail('')
    onClose()
  }

  const existing = report?.allowed_emails ?? []

  return (
    <Modal isOpen onClose={onClose} title="Autorizar Acesso por E-mail" maxWidth="max-w-sm">
      <div className="space-y-3">
        <p className="text-sm text-text-secondary">
          Adicione um e-mail para dar acesso direto a este relatório publicado.
        </p>

        {existing.length > 0 && (
          <div className="bg-bg-secondary rounded-md p-3 space-y-1">
            <p className="text-xs font-medium text-text-tertiary mb-2">Já autorizados:</p>
            {existing.map(e => (
              <p key={e} className="text-xs text-text-secondary">{e}</p>
            ))}
          </div>
        )}

        <input
          type="email"
          value={newEmail}
          onChange={e => setNewEmail(e.target.value)}
          placeholder="email@empresa.com"
          className="input-base w-full"
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAdd() } }}
          autoFocus
        />

        <div className="flex justify-end gap-2 pt-2 border-t border-border-tertiary">
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button
            onClick={handleAdd}
            disabled={!newEmail.trim() || allowEmail.isPending}
          >
            Autorizar
          </Button>
        </div>
      </div>
    </Modal>
  )
}

// ────────────────────────────────────────────────────────────
export function ClientSubRelatorios({ client }) {
  const navigate = useNavigate()
  const { profile } = useAuth()

  const { data: reports = [], isLoading } = useClientReports(client.id)
  const { createReport, deleteReport, allowEmail } = useReportMutations(client.id)

  // Create modal
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ period: '', title: '' })

  // Views modal
  const [viewsReportId, setViewsReportId] = useState(null)

  // Allow email modal
  const [allowEmailReport, setAllowEmailReport] = useState(null)

  function handlePeriodChange(period) {
    if (!period) { setForm({ period: '', title: '' }); return }
    const [y, m] = period.split('-')
    const autoTitle = `RMC ${MONTH_NAMES[parseInt(m, 10)]} ${y} — ${client.fantasy_name || client.name}`
    setForm({ period, title: autoTitle })
  }

  async function handleCreate() {
    if (!form.period || !form.title.trim()) return
    const report = await createReport.mutateAsync({
      period:     form.period,
      title:      form.title.trim(),
      created_by: profile?.id,
      sections:   {},
    })
    setShowCreate(false)
    setForm({ period: '', title: '' })
    navigate(`/empresas/${client.id}/relatorios/${report.id}/editar`)
  }

  function copyLink(token) {
    const url = `${window.location.origin}/r/${token}`
    navigator.clipboard.writeText(url)
    toast.success('Link copiado!')
  }

  async function handleDelete(id) {
    if (!window.confirm('Remover este relatório? Esta ação é irreversível.')) return
    deleteReport.mutate(id)
  }

  // ─────────────────────────────────────────────────────────
  if (isLoading) {
    return <p className="text-sm text-text-tertiary py-8 text-center">Carregando…</p>
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setShowCreate(true)}>
          + Novo Relatório
        </Button>
      </div>

      {reports.length === 0 && (
        <p className="text-center py-12 text-text-tertiary">
          Nenhum relatório criado para esta empresa.
        </p>
      )}

      <div className="space-y-2">
        {reports.map(r => {
          const viewsArr   = r.report_views ?? []
          const viewsCount = viewsArr[0]?.count ?? 0

          return (
            <div
              key={r.id}
              className="border border-border-tertiary rounded-lg p-4 flex items-center gap-4 hover:border-border-secondary transition-colors"
            >
              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-text-primary truncate">
                    {r.title}
                  </span>
                  <span className="text-xs text-text-tertiary flex-shrink-0">
                    {periodLabel(r.period)}
                  </span>
                  <Badge variant={r.status === 'published' ? 'green' : 'slate'}>
                    {r.status === 'published' ? 'Publicado' : 'Rascunho'}
                  </Badge>
                </div>
                <div className="text-xs text-text-tertiary mt-1 flex items-center gap-3">
                  <span>Criado em {formatDate(r.created_at)}</span>
                  {r.status === 'published' && viewsCount > 0 && (
                    <span className="text-donc-sky">
                      👁️ {viewsCount} visualizaç{viewsCount !== 1 ? 'ões' : 'ão'}
                    </span>
                  )}
                </div>
              </div>

              {/* Ações */}
              <div className="flex items-center gap-3 flex-shrink-0 text-xs">
                <button
                  onClick={() => navigate(`/empresas/${client.id}/relatorios/${r.id}/editar`)}
                  className="text-donc-sky hover:underline font-medium"
                >
                  Editar
                </button>

                {r.status === 'published' && (
                  <>
                    <button
                      onClick={() => copyLink(r.public_token)}
                      className="text-text-tertiary hover:text-text-primary"
                      title="Copiar link público"
                    >
                      🔗 Link
                    </button>
                    <button
                      onClick={() => setViewsReportId(r.id)}
                      className="text-text-tertiary hover:text-text-primary"
                      title="Ver visualizações"
                    >
                      👁️ Views
                    </button>
                    <button
                      onClick={() => setAllowEmailReport(r)}
                      className="text-text-tertiary hover:text-text-primary"
                      title="Autorizar e-mail"
                    >
                      + E-mail
                    </button>
                  </>
                )}

                <button
                  onClick={() => handleDelete(r.id)}
                  className="text-donc-red hover:underline"
                >
                  Excluir
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Modal: Criar Relatório ── */}
      <Modal
        isOpen={showCreate}
        onClose={() => { setShowCreate(false); setForm({ period: '', title: '' }) }}
        title="Novo Relatório Mensal"
        maxWidth="max-w-md"
      >
        <div className="space-y-3">
          <div>
            <label className="label-sm">Período de referência *</label>
            <input
              type="month"
              value={form.period}
              onChange={e => handlePeriodChange(e.target.value)}
              className="input-base w-full"
            />
          </div>
          <div>
            <label className="label-sm">Título *</label>
            <input
              value={form.title}
              onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
              className="input-base w-full"
              placeholder={`RMC Março 2025 — ${client.fantasy_name || client.name}`}
            />
          </div>
          <p className="text-xs text-text-tertiary">
            Após criar, você será direcionado para o editor onde poderá preencher
            as seções e visualizar o relatório em tempo real.
          </p>
          <div className="flex justify-end gap-2 pt-2 border-t border-border-tertiary">
            <Button
              variant="secondary"
              onClick={() => { setShowCreate(false); setForm({ period: '', title: '' }) }}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleCreate}
              disabled={!form.period || !form.title.trim() || createReport.isPending}
            >
              {createReport.isPending ? 'Criando…' : 'Criar e Editar'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── Modal: Visualizações ── */}
      {viewsReportId && (
        <ViewsModal
          reportId={viewsReportId}
          onClose={() => setViewsReportId(null)}
        />
      )}

      {/* ── Modal: Autorizar E-mail ── */}
      {allowEmailReport && (
        <AllowEmailModal
          report={allowEmailReport}
          onClose={() => setAllowEmailReport(null)}
          allowEmail={allowEmail}
        />
      )}
    </div>
  )
}
