import { useState, useMemo, useCallback, useRef, useEffect, Fragment } from 'react'
import { Icons } from '@/lib/icons'
import { PageHeader } from '@/components/ui/PageHeader'
import { useCsRadar } from '@/hooks/useCsRadar'
import { useProfiles } from '@/hooks/useProfiles'
import { useAuth } from '@/contexts/AuthContext'

function firstOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

function lastOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0)
}

const PERIOD_OPTIONS = [
  { value: 'this-month', label: 'Este mês' },
  { value: 'last-month', label: 'Último mês' },
  { value: '30d',        label: 'Últimos 30 dias' },
  { value: '90d',        label: 'Últimos 90 dias' },
  { value: 'all',        label: 'Todo período' },
  { value: 'custom',     label: 'Personalizado' },
]

const ACTIVITY_TYPE_OPTIONS = [
  { value: 'reuniao',  label: 'Reunião' },
  { value: 'ligacao',  label: 'Ligação' },
  { value: 'email',    label: 'E-mail' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'tarefa',   label: 'Tarefa' },
  { value: 'nota',     label: 'Nota' },
]

const SEGMENT_OPTIONS = [
  { value: 'A', label: 'A' },
  { value: 'B', label: 'B' },
  { value: 'C', label: 'C' },
]

function computeDateRange(period, customFrom, customTo) {
  const now = new Date()
  if (period === 'this-month') return { dateFrom: firstOfMonth(now), dateTo: now }
  if (period === 'last-month') {
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    return { dateFrom: prev, dateTo: lastOfMonth(prev) }
  }
  if (period === '30d') {
    const from = new Date(now); from.setDate(from.getDate() - 30)
    return { dateFrom: from, dateTo: now }
  }
  if (period === '90d') {
    const from = new Date(now); from.setDate(from.getDate() - 90)
    return { dateFrom: from, dateTo: now }
  }
  if (period === 'all') return { dateFrom: null, dateTo: null }
  return { dateFrom: customFrom || null, dateTo: customTo || null }
}

function MultiSelect({ label, options, selected, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const displayText = selected.length === 0
    ? label
    : selected.length === 1
      ? options.find(o => o.value === selected[0])?.label || selected[0]
      : `${selected.length} selecionados`

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md border border-border-secondary bg-bg-primary text-text-primary outline-none hover:border-border-secondary/80 focus:border-donc-sky whitespace-nowrap"
      >
        <span className="truncate max-w-[120px]">{displayText}</span>
        <Icons.ChevronDown className={`w-3.5 h-3.5 text-text-tertiary transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 bg-bg-primary border border-border-tertiary rounded-lg shadow-lg z-30 py-1 min-w-[180px] max-h-[260px] overflow-y-auto">
          {options.map(opt => (
            <label
              key={opt.value}
              className="flex items-center gap-2 px-3 py-1.5 hover:bg-bg-secondary cursor-pointer text-sm text-text-primary"
            >
              <input
                type="checkbox"
                checked={selected.includes(opt.value)}
                onChange={() => {
                  const next = selected.includes(opt.value)
                    ? selected.filter(v => v !== opt.value)
                    : [...selected, opt.value]
                  onChange(next)
                }}
                className="accent-donc-sky"
              />
              {opt.label}
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

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

const TYPE_COLORS = {
  reuniao:  '#173557',
  ligacao:  '#59c2ed',
  email:    '#d3da47',
  whatsapp: 'rgba(23,53,87,0.6)',
  tarefa:   'rgba(89,194,237,0.6)',
  nota:     '#94a3b8',
}

export default function CsRadarPage() {
  const { profile } = useAuth()
  const [period, setPeriod] = useState('30d')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [responsibleId, setResponsibleId] = useState('')
  const [clientIds, setClientIds] = useState([])
  const [activityTypes, setActivityTypes] = useState([])
  const [segmentIds, setSegmentIds] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [selectedDate, setSelectedDate] = useState(null)
  const [openSet, setOpenSet] = useState(new Set())

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm), 300)
    return () => clearTimeout(timer)
  }, [searchTerm])

  const { data: profiles = [] } = useProfiles()
  const csmList = useMemo(
    () => profiles.filter(p => p.role === 'csm').sort((a, b) => (a.name || '').localeCompare(b.name || '')),
    [profiles]
  )

  const activeFilterCount = [responsibleId, clientIds.length, activityTypes.length, segmentIds.length].filter(Boolean).length

  const handlePeriodChange = useCallback((e) => {
    setPeriod(e.target.value)
    if (e.target.value !== 'custom') {
      setCustomFrom('')
      setCustomTo('')
    }
  }, [])

  const clearFilters = useCallback(() => {
    setResponsibleId('')
    setClientIds([])
    setActivityTypes([])
    setSegmentIds([])
    setSearchTerm('')
  }, [])

  function toggleRow(clientId) {
    setOpenSet(prev => {
      const next = new Set(prev)
      next.has(clientId) ? next.delete(clientId) : next.add(clientId)
      return next
    })
  }

  const filters = useMemo(() => {
    const range = computeDateRange(period, customFrom ? new Date(customFrom + 'T00:00:00') : null, customTo ? new Date(customTo + 'T00:00:00') : null)
    return {
      ...range,
      responsibleId: responsibleId || null,
      clientIds,
      activityTypes,
      segmentIds,
    }
  }, [period, customFrom, customTo, responsibleId, clientIds, activityTypes, segmentIds])

  const { data, isLoading, error, refetch } = useCsRadar(filters)

  const filteredClients = useMemo(() => {
    if (!data?.clients) return []
    const term = debouncedSearch.toLowerCase().trim()
    if (!term) return data.clients
    return data.clients.filter(c =>
      c.fantasy_name?.toLowerCase().includes(term)
    )
  }, [data?.clients, debouncedSearch])

  const clientOptions = useMemo(
    () => (data?.clients || []).map(c => ({ value: String(c.id), label: c.fantasy_name })),
    [data?.clients]
  )

  const isAdminOrManager = profile?.role === 'admin' || profile?.role === 'manager'

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <PageHeader title="CS Radar" description="Atividades, RMCs e avanço de projetos do time de CS" />

      {/* Filter bar */}
      <div className="flex items-center gap-2 mt-5 mb-6 flex-wrap">
        <span className="text-sm text-text-tertiary font-medium mr-1">Período:</span>
        <select
          value={period}
          onChange={handlePeriodChange}
          className="px-3 py-1.5 text-sm rounded-md border border-border-secondary bg-bg-primary text-text-primary outline-none focus:border-donc-sky"
        >
          {PERIOD_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>

        {period === 'custom' && (
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={customFrom}
              onChange={e => setCustomFrom(e.target.value)}
              className="px-2 py-1.5 text-sm rounded-md border border-border-secondary bg-bg-primary text-text-primary outline-none focus:border-donc-sky"
            />
            <span className="text-text-tertiary text-sm">até</span>
            <input
              type="date"
              value={customTo}
              onChange={e => setCustomTo(e.target.value)}
              className="px-2 py-1.5 text-sm rounded-md border border-border-secondary bg-bg-primary text-text-primary outline-none focus:border-donc-sky"
            />
          </div>
        )}

        {isAdminOrManager && (
          <select
            value={responsibleId}
            onChange={e => setResponsibleId(e.target.value)}
            className="px-3 py-1.5 text-sm rounded-md border border-border-secondary bg-bg-primary text-text-primary outline-none focus:border-donc-sky"
          >
            <option value="">Responsável</option>
            {csmList.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        )}

        <MultiSelect
          label="Cliente"
          options={clientOptions}
          selected={clientIds}
          onChange={setClientIds}
        />

        <MultiSelect
          label="Tipo"
          options={ACTIVITY_TYPE_OPTIONS}
          selected={activityTypes}
          onChange={setActivityTypes}
        />

        <MultiSelect
          label="Segmento"
          options={SEGMENT_OPTIONS}
          selected={segmentIds}
          onChange={setSegmentIds}
        />

        <div className="relative flex-1 min-w-[160px] max-w-[240px]">
          <Icons.Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary pointer-events-none" />
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Buscar cliente…"
            className="w-full pl-9 pr-3 py-1.5 text-sm rounded-md border border-border-secondary bg-bg-primary text-text-primary focus:outline-none focus:ring-2 focus:ring-donc-sky/40 focus:border-donc-sky placeholder:text-text-tertiary"
          />
        </div>

        {activeFilterCount > 0 && (
          <button
            onClick={clearFilters}
            className="px-3 py-1.5 text-sm text-text-tertiary hover:text-text-secondary transition-colors flex items-center gap-1"
          >
            <Icons.X className="w-3.5 h-3.5" />
            Limpar
          </button>
        )}
      </div>

      {/* Loading skeleton */}
      {isLoading && (
        <div className="animate-pulse space-y-6">
          <div className="grid grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-bg-primary border border-border-tertiary rounded-xl px-5 py-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-lg bg-bg-secondary" />
                  <div className="space-y-2 flex-1">
                    <div className="h-6 w-12 bg-bg-secondary rounded" />
                    <div className="h-3 w-20 bg-bg-secondary rounded" />
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-bg-primary border border-border-tertiary rounded-xl p-5">
              <div className="h-4 w-32 bg-bg-secondary rounded mb-4" />
              <div className="space-y-3">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="h-3 w-20 bg-bg-secondary rounded" />
                    <div className="flex-1 h-5 bg-bg-secondary rounded-full" />
                    <div className="h-4 w-8 bg-bg-secondary rounded" />
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-bg-primary border border-border-tertiary rounded-xl p-5">
              <div className="h-4 w-32 bg-bg-secondary rounded mb-4" />
              <div className="space-y-3">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="h-3 w-28 bg-bg-secondary rounded" />
                    <div className="flex-1 h-5 bg-bg-secondary rounded-full" />
                    <div className="h-4 w-8 bg-bg-secondary rounded" />
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="bg-bg-primary border border-border-tertiary rounded-xl p-5">
            <div className="h-4 w-36 bg-bg-secondary rounded mb-4" />
            <div className="flex gap-1 mb-1">
              {[...Array(7)].map((_, i) => (
                <div key={i} className="h-3 w-8 bg-bg-secondary rounded" />
              ))}
            </div>
            {[...Array(6)].map((_, i) => (
              <div key={i} className="flex gap-1 mb-1">
                {[...Array(7)].map((_, j) => (
                  <div key={j} className="w-8 h-8 rounded-[4px] bg-bg-secondary" />
                ))}
              </div>
            ))}
          </div>
          <div className="bg-bg-primary border border-border-tertiary rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-border-tertiary">
              <div className="h-4 w-20 bg-bg-secondary rounded" />
            </div>
            <div className="p-4 space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center gap-4">
                  <div className="h-4 w-32 bg-bg-secondary rounded" />
                  <div className="h-4 w-10 bg-bg-secondary rounded" />
                  <div className="h-4 w-24 bg-bg-secondary rounded" />
                  <div className="h-4 w-10 bg-bg-secondary rounded" />
                  <div className="h-4 w-16 bg-bg-secondary rounded" />
                  <div className="h-4 w-36 bg-bg-secondary rounded flex-1" />
                  <div className="h-4 w-4 bg-bg-secondary rounded-full" />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="flex flex-col items-center justify-center py-20 text-text-tertiary">
          <Icons.XCircle className="w-12 h-12 mb-3 text-status-red" />
          <p className="text-sm">Erro ao carregar dados do CS Radar</p>
          <button onClick={() => refetch()} className="mt-3 text-sm text-donc-sky hover:underline">
            Tentar novamente
          </button>
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
                            style={{ width: `${pct}%`, backgroundColor: TYPE_COLORS[type] || '#59c2ed' }}
                          />
                        </div>
                        <span className="text-sm font-medium text-text-primary w-8 text-right tabular-nums">{count}</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {isAdminOrManager ? (
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
            ) : null}
          </div>

          {/* Heatmap */}
          <div className="bg-bg-primary border border-border-tertiary rounded-xl p-5 mb-6">
            <h3 className="text-sm font-semibold text-text-primary mb-4">Heatmap de atividades</h3>
            {data.heatmap.length === 0 ? (
              <p className="text-sm text-text-tertiary">Nenhuma atividade no período</p>
            ) : (
              <div className="flex flex-col lg:flex-row gap-6">
                <div className="flex-shrink-0">
                  <HeatmapGrid
                    data={data.heatmap}
                    selectedDate={selectedDate}
                    onCellClick={date => setSelectedDate(selectedDate === date ? null : date)}
                  />
                </div>
                {selectedDate && data.dayActivities[selectedDate] && (
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-xs font-medium text-text-tertiary uppercase tracking-wide">
                        Atividades em {formatDate(selectedDate)} ({data.dayActivities[selectedDate].length})
                      </div>
                      <button
                        onClick={() => setSelectedDate(null)}
                        className="text-text-tertiary hover:text-text-primary transition-colors"
                      >
                        <Icons.X size={14} />
                      </button>
                    </div>
                    <div className="space-y-1 max-h-[184px] overflow-y-auto">
                      {data.dayActivities[selectedDate].map(a => (
                        <div key={a.id} className="flex items-center gap-2 text-sm">
                          <span
                            className="w-2 h-2 rounded-full flex-shrink-0"
                            style={{ backgroundColor: TYPE_COLORS[a.type] || '#94a3b8' }}
                          />
                          <span className="text-text-primary truncate">{a.client_name}</span>
                          <span className="text-text-tertiary">·</span>
                          <span className="text-text-tertiary text-xs capitalize truncate">{a.title || a.type}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Client table */}
          <div className="bg-bg-primary border border-border-tertiary rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-donc-navy text-white text-xs uppercase tracking-wider">
                    <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-white">Cliente</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-white">HS</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-white">Qtd</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-white">Última atividade</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-white">Descrição</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-white">RMC</th>
                    <th className="text-center px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-white">Projeto Ativo</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredClients.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-10 text-text-tertiary text-sm px-4">
                        {debouncedSearch
                          ? `Nenhum cliente encontrado para "${debouncedSearch}"`
                          : 'Nenhum cliente encontrado'}
                      </td>
                    </tr>
                  ) : (
                    filteredClients
                        .flatMap(c => {
                        const isOpen = openSet.has(c.id)
                        const items = []
                        items.push(
                          <tr key={c.id} className="border-b border-border-tertiary last:border-b-0 hover:bg-bg-secondary transition-colors cursor-pointer" onClick={() => toggleRow(c.id)}>
                            <td className="px-4 py-2.5">
                              <div className="flex items-center gap-2">
                                <ChevronIcon open={isOpen} />
                                <span className="font-medium text-text-primary">{c.fantasy_name}</span>
                              </div>
                            </td>
                            <td className="px-4 py-2.5">
                              <HealthBadge score={c.health_total} />
                            </td>
                            <td className="px-4 py-2.5 text-right tabular-nums text-text-primary font-medium">
                              {c.activity_count || '—'}
                            </td>
                            <td className="px-4 py-2.5 text-text-secondary whitespace-nowrap">
                              {c.last_activity_date ? formatDate(c.last_activity_date) : '—'}
                            </td>
                            <td className="px-4 py-2.5 text-text-secondary max-w-[200px] truncate" title={c.last_activity_title || ''}>
                              {c.last_activity_title || '—'}
                            </td>
                            <td className="px-4 py-2.5 text-text-secondary">
                              {c.last_rmc_period || '—'}
                            </td>
                            <td className="px-4 py-2.5 text-center font-medium">
                              <span className={c.active_project_title ? 'text-donc-verde' : 'text-text-tertiary'}>
                                {c.active_project_title ? 'Sim' : 'Não'}
                              </span>
                            </td>
                          </tr>
                        )
                        if (isOpen) {
                          items.push(
                            <tr key={`exp-${c.id}`} className="border-b border-border-tertiary">
                              <td colSpan={7} className="px-4 py-3 bg-bg-secondary">
                                <ClientActivitiesList
                                  activities={data.clientActivities[c.id] || []}
                                />
                              </td>
                            </tr>
                          )
                        }
                        return items
                      })
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

const TYPE_LABELS = {
  reuniao: 'Reunião',
  ligacao: 'Ligação',
  email: 'E-mail',
  whatsapp: 'WhatsApp',
  tarefa: 'Tarefa',
  nota: 'Nota',
}

function ChevronIcon({ open }) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none"
      className="transition-transform duration-200 flex-shrink-0 text-text-tertiary"
      style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
    >
      <path d="M2.5 4.5l3.5 3.5 3.5-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function ClientActivitiesList({ activities }) {
  return (
    <div>
      {activities.length === 0 ? (
        <div className="text-sm text-text-tertiary py-2">Nenhuma atividade no período.</div>
      ) : (
        <div className="overflow-x-auto w-full">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-donc-navy text-white">
                <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-white">Tipo</th>
                <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-white">Atividade</th>
                <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-white">Data</th>
                <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-white">Responsável</th>
              </tr>
            </thead>
            <tbody>
              {activities.map(a => (
                <tr key={a.id} className="border-b border-border-tertiary last:border-b-0 hover:bg-bg-secondary transition-colors">
                  <td className="px-4 py-2 text-text-secondary">
                    <span className="flex items-center gap-1.5">
                      <ActivityTypeIcon type={a.type} />
                      <span>{TYPE_LABELS[a.type] || a.type}</span>
                    </span>
                  </td>
                  <td className="px-4 py-2 text-text-primary">{a.title}</td>
                  <td className="px-4 py-2 text-text-secondary whitespace-nowrap">{formatDate(a.activity_date)}</td>
                  <td className="px-4 py-2 text-text-secondary">{a.responsible_name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function HeatmapGrid({ data, selectedDate, onCellClick }) {
  if (!data.length) return null

  const dayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
  const countMap = {}
  let maxCount = 0
  let firstDate = null
  let lastDate = null
  for (const d of data) {
    countMap[d.date] = d.count
    if (d.count > maxCount) maxCount = d.count
    if (!firstDate || d.date < firstDate) firstDate = d.date
    if (!lastDate || d.date > lastDate) lastDate = d.date
  }

  const start = new Date(firstDate + 'T00:00:00')
  const end = new Date(lastDate + 'T00:00:00')
  const weeks = []
  let week = []

  const startDow = start.getDay()
  for (let i = 0; i < startDow; i++) week.push(null)

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().split('T')[0]
    week.push({ date: dateStr, count: countMap[dateStr] || 0 })
    if (d.getDay() === 6) {
      weeks.push(week)
      week = []
    }
  }
  if (week.length) weeks.push(week)

  function cellClass(count, date) {
    if (!count) return 'bg-bg-secondary'
    const pct = count / maxCount
    const base = pct > 0.75 ? 'bg-donc-sky' : pct > 0.5 ? 'bg-donc-sky/70' : pct > 0.25 ? 'bg-donc-sky/40' : 'bg-donc-sky/20'
    if (date === selectedDate) return `${base} ring-2 ring-donc-navy`
    return base
  }

  return (
    <div>
      <div className="flex gap-1 mb-1">
        {dayNames.map(d => (
          <div key={d} className="w-8 text-center text-[11px] text-text-tertiary font-medium">{d}</div>
        ))}
      </div>
      {weeks.map((week, wi) => (
        <div key={wi} className="flex gap-1 mb-1">
          {week.map((cell, ci) => (
            <button
              key={ci}
              disabled={!cell}
              onClick={() => cell && onCellClick?.(cell.date)}
              className={`w-8 h-8 rounded-[4px] ${cell ? cellClass(cell.count, cell.date) : ''} ${cell ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}`}
              title={cell ? `${cell.date} · ${cell.count} ${cell.count === 1 ? 'atividade' : 'atividades'}` : ''}
            />
          ))}
        </div>
      ))}
    </div>
  )
}
