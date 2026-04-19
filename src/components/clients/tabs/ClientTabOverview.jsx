import { useNavigate } from 'react-router-dom'
import { Calendar, Phone, Mail, MessageCircle, CheckSquare, FileText } from "lucide-react"
import { ActivityIcons, ActivityIconBackgrounds, DefaultActivityIcon } from "../../../lib/icons";
import { Card } from '../../ui/Card'
import { Badge } from '../../ui/Badge'
import { Avatar } from '../../ui/Avatar'
import { useCatalog } from '../../../hooks/useCatalog'


const GAP_META = {
  pausado:    { icon: '⚠', label: 'Pausado' },
  abandonado: { icon: '⛔', label: 'Abandonado' },
}

function formatDate(d) {
  if (!d) return '—'
  return new Date(d + 'T00:00:00').toLocaleDateString('pt-BR')
}

export function ClientTabOverview({ client }) {
  const navigate = useNavigate()
  const { data: catalog = [] } = useCatalog()

  const recentActivities = [...(client.activities || [])].sort((a,b) => b.activity_date?.localeCompare(a.activity_date)).slice(0,4)
  const activeContacts = client.contact_links || []
  const activeMilestones = (client.milestones || []).filter(m => m.status !== 'done').slice(0,3)

  // Oportunidades de Expansão
  const allSolucoes = catalog.filter(c => c.type === 'solucao')
  const catalogMap = {}
  client.client_catalog?.forEach(cc => { catalogMap[cc.catalog_item_id] = cc })
  const contractedIds = new Set(Object.keys(catalogMap).map(Number))

  const gaps = allSolucoes.filter(sol => {
    const entry = catalogMap[sol.id]
    return entry && (entry.status === 'pausado' || entry.status === 'abandonado')
  })

  const expansao = allSolucoes.filter(sol => !contractedIds.has(sol.id))

  const showOportunidades = gaps.length > 0 || expansao.length > 0

  return (
    <div className="grid md:grid-cols-2 gap-4">
      {/* Atividades Recentes */}
      <Card>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-text-primary">Atividades Recentes</h3>
          <button onClick={() => navigate(`/empresas/${client.id}?tab=atividades`)} className="text-xs text-donc-sky hover:underline">Ver todas</button>
        </div>
        {recentActivities.length === 0 ? (
          <p className="text-sm text-text-tertiary">Nenhuma atividade.</p>
        ) : (
          <div className="space-y-2">
            {recentActivities.map(a => (
              <div key={a.id} className="flex items-start gap-2 py-1.5 border-b border-border-tertiary last:border-0">
              const Icon = ActivityIcons[a.type] || DefaultActivityIcon;
                <Icon className="w-5 h-5 text-text-secondary" strokeWidth={1.8} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text-primary truncate">{a.title || a.description}</p>
                  <p className="text-xs text-text-tertiary">{formatDate(a.activity_date)} · {a.responsible?.name}</p>
                </div>
                <Badge variant={a.status === 'concluida' ? 'green' : 'amber'}>{a.status === 'concluida' ? 'Concluída' : 'Pendente'}</Badge>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Power Map Contatos */}
      <Card>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-text-primary">Power Map</h3>
          <button onClick={() => navigate(`/empresas/${client.id}?tab=contatos`)} className="text-xs text-donc-sky hover:underline">Ver todos</button>
        </div>
        {activeContacts.length === 0 ? (
          <p className="text-sm text-text-tertiary">Nenhum contato vinculado.</p>
        ) : (
          <div className="space-y-2">
            {activeContacts.slice(0,4).map(link => (
              <div key={link.id} className="flex items-center gap-2.5">
                <Avatar name={link.contacts?.name} size="sm" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text-primary truncate">{link.contacts?.name}</p>
                  <p className="text-xs text-text-tertiary">{link.contacts?.cargo}</p>
                </div>
                <div className="flex items-center gap-1">
                  <Badge variant={link.papel === 'Decisor' ? 'navy' : link.papel === 'Influenciador' ? 'purple' : 'slate'}>{link.papel}</Badge>
                  {link.champion && <span className="text-yellow-500 text-xs">⭐</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Milestones Ativos */}
      <Card className="md:col-span-2">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-text-primary">Milestones Ativos</h3>
          <button onClick={() => navigate(`/empresas/${client.id}?tab=operacional`)} className="text-xs text-donc-sky hover:underline">Ver todos</button>
        </div>
        {activeMilestones.length === 0 ? (
          <p className="text-sm text-text-tertiary">Nenhum milestone ativo.</p>
        ) : (
          <div className="grid md:grid-cols-3 gap-3">
            {activeMilestones.map(m => {
              const total = m.milestone_tasks?.length || 0
              const done = m.milestone_tasks?.filter(t => t.done).length || 0
              const pct = total ? Math.round((done/total)*100) : m.progress
              return (
                <div key={m.id} className="border border-border-tertiary rounded-md p-3">
                  <p className="text-sm font-medium text-text-primary mb-1">{m.title}</p>
                  {m.due_date && <p className="text-xs text-text-tertiary mb-2">{formatDate(m.due_date)}</p>}
                  <div className="h-1.5 bg-bg-tertiary rounded-full overflow-hidden">
                    <div className="h-full bg-donc-sky rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                  <p className="text-xs text-text-tertiary mt-1">{done}/{total} tarefas · {pct}%</p>
                </div>
              )
            })}
          </div>
        )}
      </Card>

      {/* Oportunidades de Expansão */}
      {showOportunidades && (
        <Card className="md:col-span-2">
          <h3 className="text-sm font-semibold text-text-primary mb-3">Oportunidades de Expansão</h3>

          {gaps.length > 0 && (
            <div className="mb-4">
              <p className="text-xs text-text-tertiary mb-2">Gaps de adoção</p>
              <div className="flex flex-wrap gap-1.5">
                {gaps.map(sol => {
                  const status = catalogMap[sol.id]?.status
                  const meta = GAP_META[status] || { icon: '⚠', label: status }
                  return (
                    <span
                      key={sol.id}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium text-white"
                      style={{ backgroundColor: sol.color }}
                      title={meta.label}
                    >
                      <span>{meta.icon}</span>
                      {sol.name}
                      <span className="opacity-75 text-[10px]">· {meta.label}</span>
                    </span>
                  )
                })}
              </div>
            </div>
          )}

          {expansao.length > 0 && (
            <div>
              <p className="text-xs text-text-tertiary mb-2">Potencial de expansão</p>
              <div className="flex flex-wrap gap-1.5">
                {expansao.map(sol => (
                  <span
                    key={sol.id}
                    className="px-2.5 py-1 rounded-full text-xs font-medium text-text-tertiary border border-border-secondary"
                    title="Não contratado"
                  >
                    {sol.name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  )
}
