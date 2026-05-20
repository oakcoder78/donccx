import { useState, useMemo } from 'react'
import { Icons } from '@/lib/icons'
import { PageHeader } from '@/components/ui/PageHeader'
import { useCsRadar } from '@/hooks/useCsRadar'
import { Spinner } from '@/components/ui/Spinner'

const PERIOD_OPTIONS = [
  { label: 'Últimos 7 dias',  days: 7 },
  { label: 'Últimos 30 dias', days: 30 },
  { label: 'Últimos 90 dias', days: 90 },
]

function KpiCard({ icon: Icon, label, value, color }) {
  return (
    <div className="bg-bg-primary border border-border-tertiary rounded-xl px-5 py-4">
      <div className="flex items-center gap-2.5">
        <div className={`w-9 h-9 rounded-lg ${color.bg} flex items-center justify-center`}>
          <Icon className={`w-5 h-5 ${color.text}`} />
        </div>
        <div>
          <div className="text-2xl font-bold text-text-primary leading-tight tabular-nums">
            {value ?? '—'}
          </div>
          <div className="text-xs text-text-tertiary font-medium mt-0.5">{label}</div>
        </div>
      </div>
    </div>
  )
}

const KPI_COLORS = {
  total:  { bg: 'bg-donc-sky/10', text: 'text-donc-sky' },
  touch:  { bg: 'bg-donc-verde/10', text: 'text-donc-verde' },
  rmc:    { bg: 'bg-donc-purple/10', text: 'text-donc-purple' },
  proj:   { bg: 'bg-donc-amber/10', text: 'text-donc-amber' },
}

export default function CsRadarPage() {
  const [periodDays, setPeriodDays] = useState(30)

  const filters = useMemo(() => {
    const now = new Date()
    const from = new Date(now)
    from.setDate(from.getDate() - periodDays)
    return { dateFrom: from, dateTo: now, responsibleId: null, clientIds: [], activityTypes: [], segmentIds: [] }
  }, [periodDays])

  const { data, isLoading, error } = useCsRadar(filters)

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <PageHeader title="CS Radar" description="Atividades, RMCs e avanço de projetos do time de CS" />

      {/* Filter bar */}
      <div className="flex items-center gap-3 mt-5 mb-6">
        <span className="text-sm text-text-tertiary font-medium">Período:</span>
        <div className="flex gap-1">
          {PERIOD_OPTIONS.map(opt => (
            <button
              key={opt.days}
              onClick={() => setPeriodDays(opt.days)}
              className={`px-3 py-1.5 text-sm rounded-md font-medium transition-colors ${
                periodDays === opt.days
                  ? 'bg-donc-sky text-white'
                  : 'bg-bg-secondary text-text-secondary hover:bg-bg-tertiary'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <Spinner size="lg" />
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="flex flex-col items-center justify-center py-20 text-text-tertiary">
          <Icons.XCircle className="w-12 h-12 mb-3 text-status-red" />
          <p className="text-sm">Erro ao carregar dados do CS Radar</p>
        </div>
      )}

      {/* Content */}
      {data && (
        <>
          {/* KPI Row */}
          <div className="grid grid-cols-4 gap-4 mb-6">
            <KpiCard
              icon={Icons.Activity}
              label="Atividades"
              value={data.kpis.totalActivities}
              color={KPI_COLORS.total}
            />
            <KpiCard
              icon={Icons.Users}
              label="Clientes com toque"
              value={`${data.kpis.clientsWithTouch} / ${data.kpis.rmcExpected}`}
              color={KPI_COLORS.touch}
            />
            <KpiCard
              icon={Icons.FileText}
              label="RMCs publicados / esperados"
              value={`${data.kpis.rmcPublished} / ${data.kpis.rmcExpected}`}
              color={KPI_COLORS.rmc}
            />
            <KpiCard
              icon={Icons.FolderKanban}
              label="Projetos com avanço"
              value={data.kpis.projectsWithProgress}
              color={KPI_COLORS.proj}
            />
          </div>

          {/* Middle row: by type + by responsible */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            {/* Activity type chart */}
            <div className="bg-bg-primary border border-border-tertiary rounded-xl p-5">
              <h3 className="text-sm font-semibold text-text-primary mb-4">Por tipo de atividade</h3>
              {data.byType.length === 0 ? (
                <p className="text-sm text-text-tertiary">Nenhuma atividade no período</p>
              ) : (
                <div className="space-y-2.5">
                  {data.byType.map(({ type, count }) => {
                    const maxCount = data.byType[0]?.count || 1
                    const pct = (count / maxCount) * 100
                    return (
                      <div key={type} className="flex items-center gap-3">
                        <span className="text-xs text-text-secondary w-20 truncate flex-shrink-0">{type}</span>
                        <div className="flex-1 h-5 bg-bg-secondary rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{ width: `${pct}%`, backgroundColor: '#59c2ed' }}
                          />
                        </div>
                        <span className="text-sm font-medium text-text-primary w-8 text-right tabular-nums">{count}</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* By responsible */}
            <div className="bg-bg-primary border border-border-tertiary rounded-xl p-5">
              <h3 className="text-sm font-semibold text-text-primary mb-4">Por responsável</h3>
              {data.byResponsible.length === 0 ? (
                <p className="text-sm text-text-tertiary">Nenhuma atividade no período</p>
              ) : (
                <div className="space-y-2.5">
                  {data.byResponsible.map(({ name, count }) => {
                    const maxCount = data.byResponsible[0]?.count || 1
                    const pct = (count / maxCount) * 100
                    return (
                      <div key={name} className="flex items-center gap-3">
                        <span className="text-xs text-text-secondary w-28 truncate flex-shrink-0">{name}</span>
                        <div className="flex-1 h-5 bg-bg-secondary rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{ width: `${pct}%`, backgroundColor: '#d3da47' }}
                          />
                        </div>
                        <span className="text-sm font-medium text-text-primary w-8 text-right tabular-nums">{count}</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Heatmap */}
          <div className="bg-bg-primary border border-border-tertiary rounded-xl p-5 mb-6">
            <h3 className="text-sm font-semibold text-text-primary mb-4">Heatmap de atividades</h3>
            {data.heatmap.length === 0 ? (
              <p className="text-sm text-text-tertiary">Nenhuma atividade no período</p>
            ) : (
              <HeatmapGrid data={data.heatmap} />
            )}
          </div>

          {/* Client table */}
          <div className="bg-bg-primary border border-border-tertiary rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-border-tertiary">
              <h3 className="text-sm font-semibold text-text-primary">Clientes</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border-tertiary text-text-tertiary text-xs uppercase tracking-wider">
                    <th className="text-left px-4 py-3 font-medium">Cliente</th>
                    <th className="text-left px-4 py-3 font-medium">HS</th>
                    <th className="text-left px-4 py-3 font-medium">Última atividade</th>
                    <th className="text-right px-4 py-3 font-medium">Qtd</th>
                    <th className="text-left px-4 py-3 font-medium">RMC</th>
                    <th className="text-left px-4 py-3 font-medium">Projeto</th>
                    <th className="text-center px-4 py-3 font-medium w-12">●</th>
                  </tr>
                </thead>
                <tbody>
                  {data.clients.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-10 text-text-tertiary text-sm">
                        Nenhum cliente encontrado
                      </td>
                    </tr>
                  ) : (
                    data.clients
                      .sort((a, b) => {
                        const order = { red: 0, yellow: 1, green: 2 }
                        return order[a.semaphore] - order[b.semaphore]
                      })
                      .map(c => (
                        <tr key={c.id} className="border-b border-border-tertiary last:border-b-0 hover:bg-bg-secondary transition-colors">
                          <td className="px-4 py-3">
                            <span className="font-medium text-text-primary">{c.fantasy_name}</span>
                          </td>
                          <td className="px-4 py-3">
                            <HealthBadge score={c.health_total} />
                          </td>
                          <td className="px-4 py-3 text-text-secondary">
                            {c.last_activity_date ? (
                              <span className="flex items-center gap-1.5">
                                {formatDate(c.last_activity_date)}
                                {c.last_activity_type && (
                                  <ActivityTypeIcon type={c.last_activity_type} />
                                )}
                              </span>
                            ) : '—'}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-text-primary font-medium">
                            {c.activity_count || '—'}
                          </td>
                          <td className="px-4 py-3 text-text-secondary">
                            {c.last_rmc_period || '—'}
                          </td>
                          <td className="px-4 py-3 text-text-secondary">
                            {c.active_project_title ? (
                              <div>
                                <span className="text-text-primary">{c.active_project_title}</span>
                                {c.active_milestone_title && (
                                  <span className="text-xs text-text-tertiary ml-1">
                                    · {c.active_milestone_title}
                                    {c.active_milestone_progress != null && ` (${c.active_milestone_progress}%)`}
                                  </span>
                                )}
                                {c.extra_projects > 0 && (
                                  <span className="text-xs text-donc-sky ml-1">+{c.extra_projects} outros</span>
                                )}
                              </div>
                            ) : '—'}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <SemaphoreDot color={c.semaphore} />
                          </td>
                        </tr>
                      ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

/* ─── helpers ─── */

function HealthBadge({ score }) {
  if (score == null) return <span className="text-text-tertiary">—</span>
  const color = score >= 75 ? 'text-donc-verde' : score >= 50 ? 'text-donc-amber' : 'text-donc-red'
  return <span className={`font-semibold ${color}`}>{score}</span>
}

const TYPE_ICONS = {
  reuniao: Icons.Users,
  ligacao: Icons.Phone,
  email: Icons.Mail,
  whatsapp: Icons.MessageCircle,
  tarefa: Icons.CheckSquare,
  nota: Icons.FileText,
}

function ActivityTypeIcon({ type }) {
  const Icon = TYPE_ICONS[type]
  if (!Icon) return null
  return <Icon className="w-3.5 h-3.5 text-text-tertiary inline-block" />
}

function SemaphoreDot({ color }) {
  const bg = color === 'red' ? 'bg-donc-red' : color === 'yellow' ? 'bg-donc-amber' : 'bg-donc-verde'
  return <span className={`inline-block w-3 h-3 rounded-full ${bg}`} title={color} />
}

function formatDate(dateStr) {
  if (!dateStr) return '—'
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}

function HeatmapGrid({ data }) {
  const maxCount = Math.max(...data.map(d => d.count), 1)
  const dayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

  const weeks = []
  let week = []
  for (const d of data) {
    const date = new Date(d.date + 'T00:00:00')
    const dayOfWeek = date.getDay()
    // fill empty days at start of first week
    if (weeks.length === 0 && week.length === 0) {
      for (let i = 0; i < dayOfWeek; i++) week.push(null)
    }
    week.push(d)
    if (dayOfWeek === 6) {
      weeks.push(week)
      week = []
    }
  }
  if (week.length > 0) weeks.push(week)

  function intensity(count) {
    if (!count) return 'bg-bg-secondary'
    const pct = count / maxCount
    if (pct > 0.75) return 'bg-donc-sky'
    if (pct > 0.5) return 'bg-donc-sky/70'
    if (pct > 0.25) return 'bg-donc-sky/40'
    return 'bg-donc-sky/20'
  }

  return (
    <div>
      <div className="flex gap-1.5 mb-1">
        {dayNames.map(d => (
          <div key={d} className="w-7 text-center text-[10px] text-text-tertiary">{d}</div>
        ))}
      </div>
      {weeks.map((week, wi) => (
        <div key={wi} className="flex gap-1.5 mb-1">
          {week.map((d, di) => (
            <div
              key={di}
              className={`w-7 h-7 rounded ${d ? intensity(d.count) : ''} flex items-center justify-center text-[10px] font-medium ${d ? 'text-text-primary' : 'text-text-tertiary/30'}`}
              title={d ? `${d.date}: ${d.count} atividades` : ''}
            >
              {d ? d.count : ''}
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
