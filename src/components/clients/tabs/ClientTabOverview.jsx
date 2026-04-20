import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Card } from '../../ui/Card'
import { Badge } from '../../ui/Badge'
import { Avatar } from '../../ui/Avatar'
import { Button } from '../../ui/Button'
import { ActivityIcons, DefaultActivityIcon, HealthDimensionIcons, ActionIcons } from '../../../lib/icons'
import { syncClient } from '../../../lib/clientSync'
import { useCatalog } from '../../../hooks/useCatalog'
import toast from 'react-hot-toast'

const GAP_META = {
  pausado:    { icon: '⚠', label: 'Pausado' },
  abandonado: { icon: '⛔', label: 'Abandonado' },
}

function formatDate(d) {
  if (!d) return '—'
  return new Date(d + 'T00:00:00').toLocaleDateString('pt-BR')
}

function fmtMonth(ym) {
  if (!ym) return ''
  const [y, m] = ym.split('-')
  const months = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
  return `${months[parseInt(m, 10) - 1]}/${y.slice(2)}`
}

function fmtNum(v) {
  if (v === null || v === undefined) return '—'
  return Number(v).toLocaleString('pt-BR')
}

function pct(a, b) {
  if (!b || b === 0) return null
  return Math.round(((a - b) / b) * 100)
}

const DIMS = [
  { key: 'uso',            label: 'Uso',        Icon: HealthDimensionIcons.health_uso            },
  { key: 'suporte',        label: 'Suporte',    Icon: HealthDimensionIcons.health_suporte        },
  { key: 'relacionamento', label: 'Relac.',     Icon: HealthDimensionIcons.health_relacionamento },
  { key: 'financeiro',     label: 'Financeiro', Icon: HealthDimensionIcons.health_financeiro     },
  { key: 'projeto',        label: 'Projeto',    Icon: HealthDimensionIcons.health_projeto        },
]

export function ClientTabOverview({ client }) {
  const navigate   = useNavigate()
  const qc         = useQueryClient()
  const { data: catalog = [] } = useCatalog()
  const [syncing, setSyncing] = useState(false)

  // ── Dados derivados ──────────────────────────────────────────────────────────

  // Atividade mais recente
  const lastActivity = [...(client.activities || [])]
    .sort((a, b) => b.activity_date?.localeCompare(a.activity_date))[0] ?? null

  // Próxima atividade pendente
  const nextActivity = [...(client.activities || [])]
    .filter(a => a.status === 'pendente' && a.due_date)
    .sort((a, b) => a.due_date.localeCompare(b.due_date))[0] ?? null

  // Uso: mês atual vs anterior
  const usageSorted = [...(client.client_usage || [])]
    .filter(u => !u.partial_day)
    .sort((a, b) => b.ref_month.localeCompare(a.ref_month))
  const curUsage  = usageSorted[0] ?? null
  const prevUsage = usageSorted[1] ?? null
  const osVar = curUsage && prevUsage ? pct(curUsage.os_created, prevUsage.os_created) : null

  // Suporte: tickets não resolvidos do mês mais recente
  const supportSorted = [...(client.client_support || [])]
    .sort((a, b) => b.ref_month.localeCompare(a.ref_month))
  const curSupport  = supportSorted[0] ?? null
  const openTickets = curSupport
    ? Math.max(0, (curSupport.tickets_opened ?? 0) - (curSupport.tickets_resolved ?? 0))
    : 0

  // Financeiro
  const delayDays = client.delay_days ?? 0

  // Decisor principal
  const decisor = client.contact_links?.find(l => l.papel === 'Decisor')

  // Renovação
  const renewalDays = client.contract_renewal
    ? Math.ceil((new Date(client.contract_renewal + 'T00:00:00') - new Date()) / (1000 * 60 * 60 * 24))
    : null

  // Milestones atrasados
  const todayStr = new Date().toISOString().slice(0, 10)
  const lateMilestones = (client.milestones || [])
    .filter(m => m.status !== 'done' && m.due_date && m.due_date < todayStr)

  // Oportunidades de expansão
  const allSolucoes = catalog.filter(c => c.type === 'solucao')
  const catalogMap = {}
  client.client_catalog?.forEach(cc => { catalogMap[cc.catalog_item_id] = cc })
  const contractedIds = new Set(Object.keys(catalogMap).map(Number))
  const gaps    = allSolucoes.filter(sol => catalogMap[sol.id] && (catalogMap[sol.id].status === 'pausado' || catalogMap[sol.id].status === 'abandonado'))
  const expansao = allSolucoes.filter(sol => !contractedIds.has(sol.id))

  // Alertas
  const alerts = []
  if (renewalDays !== null && renewalDays <= 60 && renewalDays >= 0)
    alerts.push({ color: '#BA7517', bg: '#fef9c3', text: `Renovação em ${renewalDays} dias` })
  if (renewalDays !== null && renewalDays < 0)
    alerts.push({ color: '#E24B4A', bg: '#fee2e2', text: `Renovação vencida há ${Math.abs(renewalDays)} dias` })
  if (lateMilestones.length > 0)
    alerts.push({ color: '#BA7517', bg: '#fef9c3', text: `${lateMilestones.length} milestone${lateMilestones.length > 1 ? 's' : ''} atrasado${lateMilestones.length > 1 ? 's' : ''}` })
  if (openTickets > 0)
    alerts.push({ color: '#E24B4A', bg: '#fee2e2', text: `${openTickets} ticket${openTickets > 1 ? 's' : ''} sem resolução` })
  if (delayDays > 0)
    alerts.push({ color: '#E24B4A', bg: '#fee2e2', text: `Atraso financeiro: ${delayDays} dias` })

  // Health score
  const score      = client.health_total ?? 0
  const scoreColor = score >= 75 ? '#1D9E75' : score >= 50 ? '#BA7517' : '#E24B4A'
  const scoreLabel = score >= 75 ? 'Saudável' : score >= 50 ? 'Atenção' : 'Em Risco'

  // Sync disponível?
  const hasSync = !!(client.client_donc_instances?.length || client.freshdesk_company_id)

  async function handleSync() {
    setSyncing(true)
    try {
      const result = await syncClient(client)
      if (result.errors.length > 0) {
        result.errors.forEach(e => toast.error(e))
      } else {
        toast.success('Dados sincronizados e health score atualizado', { icon: '🔄' })
      }
      qc.invalidateQueries({ queryKey: ['client', String(client.id)] })
    } catch (e) {
      toast.error(e.message)
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="space-y-4">

      {/* ── Linha 1: Health + Próxima Ação ── */}
      <div className="grid md:grid-cols-2 gap-4">

        {/* Health Score */}
        <Card>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-text-primary">Health Score</h3>
            <button onClick={() => navigate(`/empresas/${client.id}?tab=health`)} className="text-xs text-donc-sky hover:underline">Ver detalhes</button>
          </div>
          <div className="flex items-center gap-4 mb-3">
            <div className="text-4xl font-bold" style={{ color: scoreColor }}>{score}</div>
            <div>
              <div className="text-sm font-medium" style={{ color: scoreColor }}>{scoreLabel}</div>
              <div className="text-xs text-text-tertiary mt-0.5">
                {client.health_calculated_at
                  ? `Calculado em ${new Date(client.health_calculated_at).toLocaleDateString('pt-BR')}`
                  : 'Nunca calculado'}
              </div>
            </div>
          </div>
          <div className="space-y-1.5">
            {DIMS.map(d => {
              const val   = client[`health_${d.key}`] ?? 0
              const color = val >= 15 ? '#1D9E75' : val >= 10 ? '#BA7517' : '#E24B4A'
              return (
                <div key={d.key} className="flex items-center gap-2">
                  <span className="text-xs text-text-tertiary w-16">{d.label}</span>
                  <div className="flex-1 h-1.5 bg-bg-tertiary rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${(val / 20) * 100}%`, backgroundColor: color }} />
                  </div>
                  <span className="text-xs font-medium w-6 text-right" style={{ color }}>{val}</span>
                </div>
              )
            })}
          </div>
        </Card>

        {/* Próxima Ação + Última Interação */}
        <Card>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-text-primary">Ações</h3>
            <button onClick={() => navigate(`/empresas/${client.id}?tab=atividades`)} className="text-xs text-donc-sky hover:underline">Ver todas</button>
          </div>

          <div className="space-y-3">
            <div>
              <p className="text-xs font-semibold text-text-tertiary uppercase tracking-wide mb-1">Próxima atividade</p>
              {nextActivity ? (
                <div className="flex items-start gap-2">
                  {(() => { const Icon = ActivityIcons[nextActivity.type] || DefaultActivityIcon; return <Icon className="w-4 h-4 text-text-secondary mt-0.5 flex-shrink-0" strokeWidth={1.8} /> })()}
                  <div>
                    <p className="text-sm font-medium text-text-primary">{nextActivity.title || nextActivity.description}</p>
                    <p className="text-xs text-text-tertiary">{formatDate(nextActivity.due_date)}</p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-text-tertiary italic">Nenhuma atividade agendada</p>
              )}
            </div>

            <div className="border-t border-border-tertiary pt-3">
              <p className="text-xs font-semibold text-text-tertiary uppercase tracking-wide mb-1">Última interação</p>
              {lastActivity ? (
                <div className="flex items-start gap-2">
                  {(() => { const Icon = ActivityIcons[lastActivity.type] || DefaultActivityIcon; return <Icon className="w-4 h-4 text-text-secondary mt-0.5 flex-shrink-0" strokeWidth={1.8} /> })()}
                  <div>
                    <p className="text-sm font-medium text-text-primary">{lastActivity.title || lastActivity.description}</p>
                    <p className="text-xs text-text-tertiary">{formatDate(lastActivity.activity_date)} · {lastActivity.responsible?.name}</p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-text-tertiary italic">Nenhuma atividade registrada</p>
              )}
            </div>

            {decisor && (
              <div className="border-t border-border-tertiary pt-3">
                <p className="text-xs font-semibold text-text-tertiary uppercase tracking-wide mb-1">Decisor</p>
                <div className="flex items-center gap-2">
                  <Avatar name={decisor.contacts?.name} size="sm" />
                  <div>
                    <p className="text-sm font-medium text-text-primary">{decisor.contacts?.name}</p>
                    <p className="text-xs text-text-tertiary">{decisor.contacts?.cargo}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* ── Linha 2: Operação + Alertas ── */}
      <div className="grid md:grid-cols-2 gap-4">

        {/* Operação do mês */}
        <Card>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-text-primary">
              Operação {curUsage ? `— ${fmtMonth(curUsage.ref_month)}` : ''}
            </h3>
            <button onClick={() => navigate(`/empresas/${client.id}?tab=operacional&sub=uso`)} className="text-xs text-donc-sky hover:underline">Ver detalhes</button>
          </div>
          {curUsage ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-text-secondary">OS Criadas</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-text-primary">{fmtNum(curUsage.os_created)}</span>
                  {osVar !== null && (
                    <span className="text-xs font-medium" style={{ color: osVar >= 0 ? '#1D9E75' : '#E24B4A' }}>
                      {osVar >= 0 ? '▲' : '▼'} {Math.abs(osVar)}%
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-text-secondary">Usuários Ativos</span>
                <span className="text-sm font-semibold text-text-primary">{fmtNum(curUsage.active_users)}</span>
              </div>
              {openTickets > 0 && (
                <div className="flex items-center justify-between border-t border-border-tertiary pt-2 mt-2">
                  <span className="text-sm text-text-secondary">Tickets em aberto</span>
                  <span className="text-sm font-semibold" style={{ color: '#E24B4A' }}>{openTickets}</span>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-text-tertiary italic">Nenhum dado de uso registrado.</p>
          )}
        </Card>

        {/* Alertas + Sync */}
        <Card>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-text-primary">Alertas</h3>
            {hasSync && (
              <Button size="sm" variant="secondary" onClick={handleSync} disabled={syncing}>
                {syncing
                  ? 'Sincronizando...'
                  : <span className="flex items-center gap-1.5"><ActionIcons.recalculate className="w-3.5 h-3.5" /> Sincronizar</span>}
              </Button>
            )}
          </div>
          {alerts.length > 0 ? (
            <div className="space-y-2">
              {alerts.map((a, i) => (
                <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium" style={{ backgroundColor: a.bg, color: a.color }}>
                  {a.text}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-text-tertiary italic">Nenhum alerta no momento.</p>
          )}
        </Card>
      </div>

      {/* ── Linha 3: Power Map + Oportunidades ── */}
      {(client.contact_links?.length > 0 || gaps.length > 0 || expansao.length > 0) && (
        <div className="grid md:grid-cols-2 gap-4">

          {/* Power Map resumido */}
          {client.contact_links?.length > 0 && (
            <Card>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-text-primary">Power Map</h3>
                <button onClick={() => navigate(`/empresas/${client.id}?tab=contatos`)} className="text-xs text-donc-sky hover:underline">Ver todos</button>
              </div>
              <div className="space-y-2">
                {client.contact_links.slice(0, 4).map(cl => (
                  <div key={cl.id} className="flex items-center gap-2">
                    <Avatar name={cl.contacts?.name} size="sm" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-text-primary truncate">{cl.contacts?.name}</p>
                      <p className="text-xs text-text-tertiary truncate">{cl.contacts?.cargo}</p>
                    </div>
                    <Badge variant={cl.papel === 'Decisor' ? 'navy' : cl.champion ? 'sky' : 'default'}>
                      {cl.champion ? 'Champion' : cl.papel}
                    </Badge>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Oportunidades */}
          {(gaps.length > 0 || expansao.length > 0) && (
            <Card>
              <h3 className="text-sm font-semibold text-text-primary mb-3">Oportunidades de Expansão</h3>
              {gaps.length > 0 && (
                <div className="mb-2">
                  <p className="text-xs text-text-tertiary mb-1">Soluções pausadas/abandonadas</p>
                  <div className="flex flex-wrap gap-1.5">
                    {gaps.map(sol => (
                      <span key={sol.id} className="text-xs px-2 py-0.5 rounded-full border border-border-secondary text-text-secondary flex items-center gap-1">
                        {GAP_META[catalogMap[sol.id]?.status]?.icon} {sol.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {expansao.length > 0 && (
                <div>
                  <p className="text-xs text-text-tertiary mb-1">Potencial de expansão</p>
                  <div className="flex flex-wrap gap-1.5">
                    {expansao.slice(0, 8).map(sol => (
                      <span key={sol.id} className="text-xs px-2 py-0.5 rounded-full border border-border-secondary text-text-secondary">{sol.name}</span>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          )}
        </div>
      )}
    </div>
  )
}
