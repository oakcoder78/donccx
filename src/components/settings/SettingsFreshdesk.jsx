import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Icons } from '@/lib/icons'
import { supabase } from '@/lib/supabaseClient'
import { fetchCompaniesFreshdesk, syncAllCompanies } from '@/lib/freshdeskSync'
import { fetchAndSaveFreshdeskConfig, getFreshdeskConfig } from '@/lib/freshdeskConfig'
import { useSyncStatus, useSyncHistory } from '@/hooks/useSyncStatus'
import { Button } from '../ui/Button'
import { PageSpinner } from '../ui/Spinner'
import { SettingsSectionHeader } from './SettingsSectionHeader'
import { Badge } from '../ui/Badge'
import toast from 'react-hot-toast'
import { friendlyError } from '@/lib/syncErrors'

// ── Normalização para matching ────────────────────────────────────────────────
function normalize(name) {
  if (!name) return ''
  return name
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(ltda|s\.?a\.?|eireli|me|epp|inc|corp|group|grupo)\b/gi, '')
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function formatDateTimeBR(dateString) {
  if (!dateString) return '-'
  const date = new Date(dateString)
  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const year = date.getFullYear()
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${day}/${month}/${year} às ${hours}:${minutes}`
}

function computeSuggestion(client, fdCompanies) {
  const cNames = [client.name, client.fantasy_name].filter(Boolean).map(normalize).filter(n => n.length > 2)
  const cSite  = client.site
    ? client.site.replace(/^https?:\/\//i, '').split('/')[0].replace(/^www\./i, '').toLowerCase()
    : null

  let best = null; let bestScore = 0; let bestEvidence = ''

  for (const fd of fdCompanies) {
    const fdName    = normalize(fd.name)
    const fdDomains = (fd.domains ?? []).map(d => d.toLowerCase())
    let score = 0; let evidence = ''

    if (cNames.some(n => n === fdName && n.length > 2)) { score = 100; evidence = 'Nome exato' }
    else if (cSite && fdDomains.some(d =>
      d === cSite || (cSite.length > 4 && cSite.includes(d)) || (d.length > 4 && d.includes(cSite))
    )) { score = 90; evidence = 'Domínio compatível' }
    else if (cNames.some(n => n.length > 4 && fdName.length > 4 && (fdName.includes(n) || n.includes(fdName)))) { score = 70; evidence = 'Nome parcialmente compatível' }

    if (score > bestScore) { bestScore = score; bestEvidence = evidence; best = { fdId: fd.id, fdName: fd.name, score, evidence } }
  }
  if (!best || bestScore < 70) return null
  const confidence = bestScore === 100 ? 'alta' : bestScore >= 90 ? 'média' : 'baixa'
  return { ...best, evidence: bestEvidence, confidence }
}

// ── Overview: primeira viewport + ação contextual ──────────────────────────────
function OverviewSection({ preflight, onTabChange }) {
  const mappedCount   = preflight?.mappedCount ?? 0
  const totalCount    = preflight?.totalCount ?? 0
  const pendingCount  = preflight?.pendingCount ?? 0
  const blockedCount  = preflight?.blockedCount ?? 0
  const lastExecution = preflight?.lastSyncStartedAt
  const lastTicketSync = preflight?.lastDataSync

  const state = (() => {
    if (!preflight) return { label: 'Carregando…', variant: 'slate', icon: Icons.Clock }
    if (preflight.notConfigured) return { label: 'Não configurado', variant: 'slate', icon: Icons.AlertCircle }
    if (blockedCount > 0) return { label: 'Atenção', variant: 'amber', icon: Icons.AlertTriangle }
    if (preflight.failed) return { label: 'Falha', variant: 'red', icon: Icons.XCircle }
    return { label: 'Conectado', variant: 'green', icon: Icons.CheckCircle }
  })()
  const StateIcon = state.icon

  const cta = (() => {
    if (!preflight) return null
    if (preflight.notConfigured) return { label: 'Verificar integração', tab: 'preflight', icon: Icons.Search }
    if (blockedCount > 0) return { label: 'Resolver pendências', tab: 'preflight', icon: Icons.AlertTriangle }
    if (pendingCount > 0) return { label: 'Revisar importações', tab: 'review', icon: Icons.ClipboardList }
    return { label: 'Iniciar importação', tab: 'import', icon: Icons.Download }
  })()

  return (
    <div className="bg-bg-primary border border-border-tertiary rounded-lg p-4 space-y-4" data-testid="freshdesk-overview">
      <div className="flex items-center gap-2 flex-wrap">
        <StateIcon size={16} className={state.variant === 'green' ? 'text-green-600' : state.variant === 'amber' ? 'text-amber-600' : state.variant === 'red' ? 'text-red-600' : 'text-text-tertiary'} />
        <Badge variant={state.variant}>{state.label}</Badge>
        {lastExecution && (
          <span className="text-xs text-text-tertiary">Última execução (cron): {formatDateTimeBR(lastExecution)}</span>
        )}
        {lastTicketSync && (
          <span className="text-xs text-text-tertiary">· Tickets: {formatDateTimeBR(lastTicketSync)}</span>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
        <div className="bg-bg-secondary rounded-lg p-3">
          <p className="text-xs text-text-tertiary">Clientes mapeados</p>
          <p className="text-lg font-semibold text-text-primary">{mappedCount}/{totalCount}</p>
        </div>
        <div className="bg-bg-secondary rounded-lg p-3">
          <p className="text-xs text-text-tertiary">Bloqueados</p>
          <p className={`text-lg font-semibold ${blockedCount > 0 ? 'text-amber-600' : 'text-text-primary'}`}>{blockedCount}</p>
        </div>
        <div className="bg-bg-secondary rounded-lg p-3">
          <p className="text-xs text-text-tertiary">Revisões pendentes</p>
          <p className={`text-lg font-semibold ${pendingCount > 0 ? 'text-amber-600' : 'text-text-primary'}`}>{pendingCount}</p>
        </div>
        <div className="bg-bg-secondary rounded-lg p-3">
          <p className="text-xs text-text-tertiary">Última sync tickets</p>
          <p className="text-xs font-medium text-text-primary mt-1">{lastTicketSync ? formatDateTimeBR(lastTicketSync) : '—'}</p>
          {lastExecution && <p className="text-[11px] text-text-tertiary mt-0.5">Cron: {formatDateTimeBR(lastExecution)}</p>}
        </div>
      </div>

      {cta && (
        <Button onClick={() => onTabChange(cta.tab)} variant="primary" size="md">
          <cta.icon size={14} />
          {cta.label}
        </Button>
      )}

      {blockedCount > 0 && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Existem bloqueios que impedem a importação. Veja o Pré-voo para detalhes.
        </p>
      )}
    </div>
  )
}

// ── Preflight: checklist persistente sem escrita ──────────────────────────────
function PreflightSection({ checks, loading, onTabChange }) {
  const tabForCheck = { connection: 'import', metadata: 'import', mapping: 'mapping', concurrency: 'import', pending: 'review' }
  if (loading) return <div className="bg-bg-primary border border-border-tertiary rounded-lg p-4"><PageSpinner /></div>
  if (!checks || checks.length === 0) return null

  return (
    <div className="bg-bg-primary border border-border-tertiary rounded-lg p-4 space-y-3" data-testid="freshdesk-preflight">
      <div className="flex items-center gap-2">
        <Icons.CheckSquare size={16} className="text-donc-navy" />
        <p className="text-sm font-medium text-text-primary">Pré-voo</p>
        <span className="text-xs text-text-tertiary">— verificações antes de importar (clique no blocker para resolver)</span>
      </div>
      <div className="space-y-2">
        {checks.map(check => {
          const Icon = check.status === 'pass' ? Icons.CheckCircle : check.status === 'warning' ? Icons.AlertTriangle : Icons.XCircle
          const color = check.status === 'pass' ? 'text-green-600' : check.status === 'warning' ? 'text-amber-600' : 'text-red-600'
          const bg = check.status === 'pass' ? 'bg-green-50 border-green-200' : check.status === 'warning' ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-200'
          const clickable = check.status !== 'pass' && !!tabForCheck[check.id] && !!onTabChange
          return (
            <div
              key={check.id}
              onClick={clickable ? () => onTabChange(tabForCheck[check.id]) : undefined}
              className={`flex items-start gap-2.5 rounded-lg border px-3 py-2.5 ${bg} ${clickable ? 'cursor-pointer hover:brightness-95 hover:shadow-sm' : ''}`}
              role={clickable ? 'button' : undefined}
              tabIndex={clickable ? 0 : undefined}
              onKeyDown={clickable ? e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onTabChange(tabForCheck[check.id]) } } : undefined}
            >
              <Icon size={16} className={`${color} mt-0.5 shrink-0`} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-text-primary">{check.label}</p>
                <p className="text-xs text-text-secondary mt-0.5">{check.detail}</p>
                {check.action && (
                  <p className="text-xs mt-1 flex items-center gap-1">
                    <span className="text-text-tertiary">Ação: {check.action}</span>
                    {clickable && <Icons.ChevronRight size={12} className="text-text-tertiary" />}
                  </p>
                )}
              </div>
              {check.count != null && (
                <span className="text-xs font-semibold text-text-primary shrink-0">{check.count}</span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── History: execuções + revisões por mês + decisões (4.7) ───────────────────
function HistorySection() {
  const { data: history = [], isLoading } = useSyncHistory({ limit: 8, enabled: true })
  const { data: lastRun } = useSyncStatus()

  const { data: revisions = [], isLoading: revLoading } = useQuery({
    queryKey: ['freshdesk_history_revisions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_support')
        .select('ref_month, metrics_status, contacts_status, revision, published_at, source, run_id')
        .order('ref_month', { ascending: false })
        .order('revision', { ascending: false })
        .limit(60)
      if (error) throw error
      // Aggregate by ref_month
      const map = new Map()
      for (const r of data ?? []) {
        if (!map.has(r.ref_month)) map.set(r.ref_month, { ref_month: r.ref_month, rows: [] })
        map.get(r.ref_month).rows.push(r)
      }
      return Array.from(map.values()).slice(0, 6).map(g => {
        const rows = g.rows
        const published = rows.filter(r => r.metrics_status === 'published' || r.contacts_status === 'published')
        const maxRev = Math.max(...rows.map(r => r.revision ?? 1))
        const lastPub = published.sort((a, b) => new Date(b.published_at) - new Date(a.published_at))[0]?.published_at ?? null
        return {
          ref_month: g.ref_month,
          total: rows.length,
          publishedCount: published.length,
          maxRevision: maxRev,
          lastPublishedAt: lastPub,
          source: rows[0]?.source ?? '—',
          runIds: [...new Set(rows.map(r => r.run_id?.slice(0, 8)).filter(Boolean))].slice(0, 3).join(', '),
        }
      })
    },
    staleTime: 30_000,
  })

  const { data: audits = [] } = useQuery({
    queryKey: ['freshdesk_history_audits'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('audit_logs')
        .select('action, user_name, created_at, entity_id, new_value')
        .like('action', 'freshdesk_%')
        .order('created_at', { ascending: false })
        .limit(8)
      if (error) throw error
      return data ?? []
    },
    staleTime: 30_000,
  })

  if (isLoading) return <div className="bg-bg-primary border border-border-tertiary rounded-lg p-4"><PageSpinner /></div>

  return (
    <div className="space-y-4" data-testid="freshdesk-history">
      {/* Execuções cron (sync_log) */}
      <div className="bg-bg-primary border border-border-tertiary rounded-lg p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Icons.Clock size={16} className="text-donc-navy" />
          <p className="text-sm font-medium text-text-primary">Execuções — cron mensal</p>
          <span className="text-xs text-text-tertiary">quem = service_role/cron · quando/escopo/processados/falhos</span>
        </div>
        {lastRun && (
          <div className="flex items-center gap-2 text-xs">
            <Badge variant={lastRun.status === 'success' ? 'green' : 'red'}>{lastRun.status === 'success' ? 'Sucesso' : 'Falha'}</Badge>
            <span className="text-text-tertiary">Última: {formatDateTimeBR(lastRun.started_at)}</span>
          </div>
        )}
        {history.length === 0 ? (
          <p className="text-sm text-text-tertiary">Nenhuma execução registrada.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-tertiary">
                  <th className="text-left text-xs font-semibold text-text-tertiary px-2 py-1.5">Início</th>
                  <th className="text-left text-xs font-semibold text-text-tertiary px-2 py-1.5">Status</th>
                  <th className="text-left text-xs font-semibold text-text-tertiary px-2 py-1.5">Escopo / Resumo</th>
                </tr>
              </thead>
              <tbody>
                {history.map(row => (
                  <tr key={row.id} className="border-t border-border-tertiary">
                    <td className="px-2 py-1.5 text-xs">{formatDateTimeBR(row.started_at)}</td>
                    <td className="px-2 py-1.5"><Badge variant={row.status === 'success' ? 'green' : row.status === 'running' ? 'amber' : 'red'}>{row.status}</Badge></td>
                    <td className="px-2 py-1.5 text-xs text-text-secondary">
                      {row.summary ? `${row.summary?.freshdesk?.synced ?? '?'} empresas · donc ${row.summary?.donc?.synced ?? '—'} · health ${row.summary?.health?.recalculated ?? '—'}` : row.error_message ? friendlyError(row.error_message) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Revisões por mês (4.7: qual mês/revisão publicada) */}
      <div className="bg-bg-primary border border-border-tertiary rounded-lg p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Icons.FileText size={16} className="text-donc-navy" />
          <p className="text-sm font-medium text-text-primary">Revisões por mês</p>
          <span className="text-xs text-text-tertiary">— qual revisão está publicada · source · run</span>
        </div>
        {revLoading ? (
          <PageSpinner />
        ) : revisions.length === 0 ? (
          <p className="text-sm text-text-tertiary">Nenhuma revisão importada.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-tertiary">
                  <th className="text-left text-xs font-semibold text-text-tertiary px-2 py-1.5">Mês</th>
                  <th className="text-left text-xs font-semibold text-text-tertiary px-2 py-1.5">Revisão max</th>
                  <th className="text-left text-xs font-semibold text-text-tertiary px-2 py-1.5">Publicados</th>
                  <th className="text-left text-xs font-semibold text-text-tertiary px-2 py-1.5">Última publicação</th>
                  <th className="text-left text-xs font-semibold text-text-tertiary px-2 py-1.5">Source / run</th>
                </tr>
              </thead>
              <tbody>
                {revisions.map(r => (
                  <tr key={r.ref_month} className="border-t border-border-tertiary">
                    <td className="px-2 py-1.5 text-xs font-medium">{r.ref_month}</td>
                    <td className="px-2 py-1.5 text-xs"><Badge variant={r.maxRevision > 1 ? 'amber' : 'slate'}>Rev. {r.maxRevision}</Badge></td>
                    <td className="px-2 py-1.5 text-xs">{r.publishedCount}/{r.total}</td>
                    <td className="px-2 py-1.5 text-xs">{r.lastPublishedAt ? formatDateTimeBR(r.lastPublishedAt) : '—'}</td>
                    <td className="px-2 py-1.5 text-xs text-text-secondary">{r.source} · {r.runIds || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Decisões (audit_logs) — quem/quais decisões */}
      <div className="bg-bg-primary border border-border-tertiary rounded-lg p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Icons.ClipboardList size={16} className="text-donc-navy" />
          <p className="text-sm font-medium text-text-primary">Decisões recentes</p>
          <span className="text-xs text-text-tertiary">quem · qual decisão · quando</span>
        </div>
        {audits.length === 0 ? (
          <p className="text-sm text-text-tertiary">Nenhuma decisão auditada.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-tertiary">
                  <th className="text-left text-xs font-semibold text-text-tertiary px-2 py-1.5">Quando</th>
                  <th className="text-left text-xs font-semibold text-text-tertiary px-2 py-1.5">Quem</th>
                  <th className="text-left text-xs font-semibold text-text-tertiary px-2 py-1.5">Ação</th>
                  <th className="text-left text-xs font-semibold text-text-tertiary px-2 py-1.5">Alvo</th>
                </tr>
              </thead>
              <tbody>
                {audits.map((a, i) => (
                  <tr key={i} className="border-t border-border-tertiary">
                    <td className="px-2 py-1.5 text-xs">{formatDateTimeBR(a.created_at)}</td>
                    <td className="px-2 py-1.5 text-xs truncate max-w-[140px]">{a.user_name ?? '—'}</td>
                    <td className="px-2 py-1.5 text-xs"><Badge variant="slate">{a.action.replace('freshdesk_', '')}</Badge></td>
                    <td className="px-2 py-1.5 text-xs text-text-secondary">#{a.entity_id}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-text-tertiary">
          Trilha completa em <span className="font-medium">audit_logs</span> com `old_value`/`new_value` e `published_at` por `client_support.revision`.
        </p>
      </div>
    </div>
  )
}

// ── Hook: preflight checks (read-only) ──────────────────────────────────────
function usePreflight() {
  const { data: freshdeskConfig, isLoading: configLoading } = useQuery({
    queryKey: ['freshdesk_preflight_config'],
    queryFn: async () => {
      const { data, error } = await supabase.from('freshdesk_config').select('key, updated_at')
      if (error) throw error
      return data ?? []
    },
    staleTime: 60_000,
  })

  const { data: clients, isLoading: clientsLoading } = useQuery({
    queryKey: ['freshdesk_preflight_clients'],
    queryFn: async () => {
      const { data, error } = await supabase.from('clients').select('id, name, freshdesk_company_id, freshdesk_company_ids')
      if (error) throw error
      return data ?? []
    },
    staleTime: 60_000,
  })

  const { data: pending, isLoading: pendingLoading } = useQuery({
    queryKey: ['freshdesk_preflight_pending'],
    queryFn: async () => {
      const { count, error } = await supabase.from('client_support').select('id', { count: 'exact', head: true }).or('metrics_status.eq.pending,contacts_status.eq.pending')
      if (error) throw error
      return count ?? 0
    },
    staleTime: 30_000,
  })

  const { data: lastRun } = useSyncStatus()

  const { data: configData } = useQuery({
    queryKey: ['freshdesk_config_last_sync'],
    queryFn: async () => {
      const g = await getFreshdeskConfig('groups')
      const a = await getFreshdeskConfig('agents')
      const f = await getFreshdeskConfig('ticket_fields')
      const ls = await getFreshdeskConfig('last_sync')
      const ldsRes = await supabase.from('freshdesk_config').select('data').eq('key', 'last_data_sync').maybeSingle()
      return { groups: g, agents: a, ticket_fields: f, last_sync: ls, last_data_sync: ldsRes.data?.data ?? null }
    },
    staleTime: 60_000,
  })

  const loading = configLoading || clientsLoading || pendingLoading

  const mappedCount = clients ? clients.filter(c => c.freshdesk_company_id || (c.freshdesk_company_ids?.length) ).length : 0
  const totalCount = clients?.length ?? 0
  const unmappedCount = totalCount - mappedCount
  const blockedCount = clients ? clients.filter(c => c.freshdesk_company_ids?.length > 1).length : 0
  const hasGroups = !!configData?.groups
  const hasAgents = !!configData?.agents
  const notConfigured = !hasGroups && !hasAgents && !configData?.last_sync
  const failed = lastRun?.status === 'failed'
  const isRunning = lastRun?.status === 'running'

  const checks = [
    {
      id: 'connection',
      label: 'Conexão Freshdesk',
      status: notConfigured ? 'blocker' : failed ? 'blocker' : 'pass',
      detail: notConfigured ? 'Metadados não carregados. Clique em Atualizar Configurações na aba Importação.' : failed ? `Última execução falhou: ${friendlyError(lastRun?.error_message ?? '')}` : 'Conexão validada via metadados em cache.',
      count: null,
      action: notConfigured || failed ? 'Verifique FRESHDESK_DOMAIN/API_KEY e atualize a configuração.' : null,
    },
    {
      id: 'metadata',
      label: 'Metadados (grupos, agentes, campos)',
      status: hasGroups && hasAgents ? 'pass' : 'warning',
      detail: hasGroups && hasAgents ? 'Grupos e agentes carregados.' : 'Grupos ou agentes ausentes. A sincronização pode classificar N1/N2/N3 incorretamente.',
      count: null,
      action: !hasGroups || !hasAgents ? 'Atualize as configurações do Freshdesk.' : null,
    },
    {
      id: 'mapping',
      label: 'Mapeamento de empresas',
      status: unmappedCount === 0 ? 'pass' : blockedCount > 0 ? 'blocker' : 'warning',
      detail: blockedCount > 0 ? `${blockedCount} cliente(s) com múltiplos IDs Freshdesk — requer classificação.` : unmappedCount > 0 ? `${unmappedCount} cliente(s) sem vínculo Freshdesk.` : `${mappedCount}/${totalCount} clientes mapeados.`,
      count: unmappedCount,
      action: blockedCount > 0 ? 'Classifique duplicidade vs separação intencional na aba Mapeamento.' : unmappedCount > 0 ? 'Mapeie clientes na aba Mapeamento.' : null,
    },
    {
      id: 'concurrency',
      label: 'Execução concorrente',
      status: isRunning ? 'blocker' : 'pass',
      detail: isRunning ? 'Uma sincronização está em execução no momento.' : 'Nenhuma execução concorrente detectada.',
      count: null,
      action: isRunning ? 'Aguarde a conclusão antes de iniciar nova importação.' : null,
    },
    {
      id: 'pending',
      label: 'Revisões pendentes',
      status: (pending ?? 0) === 0 ? 'pass' : 'warning',
      detail: (pending ?? 0) === 0 ? 'Nenhuma revisão pendente.' : `${pending} revisão(ões) aguardando aprovação.`,
      count: pending,
      action: (pending ?? 0) > 0 ? 'Revise em Revisão antes de nova importação do mesmo período.' : null,
    },
  ]

  return {
    data: {
      mappedCount,
      totalCount,
      unmappedCount,
      blockedCount,
      pendingCount: pending ?? 0,
      lastConfigSync: configData?.last_sync?.synced_at ?? null,
      lastDataSync: configData?.last_data_sync?.synced_at ?? null,
      lastSyncStartedAt: lastRun?.started_at ?? configData?.last_data_sync?.synced_at ?? null,
      lastSyncLabel: lastRun?.started_at ? 'Última execução' : 'Última sync',
      notConfigured,
      failed,
    },
    checks,
    loading,
  }
}

// ── Seção Mapeamento ──────────────────────────────────────────────────────────
function MappingSection() {
  const SearchIcon = Icons.Search
  const [clients, setClients]         = useState([])
  const [edits, setEdits]             = useState({})         // { clientId: string }
  const [suggestions, setSuggestions] = useState({})         // { clientId: { fdId, fdName } }
  const [loading, setLoading]         = useState(true)
  const [fetching, setFetching]       = useState(false)
  const [saving, setSaving]           = useState({})
  const [dismissed, setDismissed]     = useState({})         // { clientId: 'rejected' | 'deferred' }

  useEffect(() => {
    supabase
      .from('clients')
      .select('id, name, fantasy_name, site, freshdesk_company_id, freshdesk_company_ids')
      .order('name')
      .then(({ data }) => { setClients(data ?? []); setLoading(false) })
  }, [])

  async function handleFetchSuggestions() {
    setFetching(true)
    try {
      const fdCompanies = await fetchCompaniesFreshdesk()
      const map = {}
      for (const c of clients) {
        if (c.freshdesk_company_id) continue
        const s = computeSuggestion(c, fdCompanies)
        if (s) map[c.id] = s
      }
      setSuggestions(map)
      const found = Object.keys(map).length
      toast.success(found
        ? `${found} sugestão${found !== 1 ? 'ões' : ''} encontrada${found !== 1 ? 's' : ''}`
        : 'Nenhuma sugestão automática encontrada')
    } catch (e) {
      toast.error(friendlyError(e.message) || 'Erro ao buscar empresas do Freshdesk')
    } finally {
      setFetching(false)
    }
  }

  function applySuggestion(clientId, fdId) {
    setEdits(p => ({ ...p, [clientId]: String(fdId) }))
  }

  function rejectSuggestion(clientId) {
    setSuggestions(p => { const n = { ...p }; delete n[clientId]; return n })
    setDismissed(p => ({ ...p, [clientId]: 'rejected' }))
    toast('Sugestão rejeitada', { icon: '—' })
  }

  function deferSuggestion(clientId) {
    setDismissed(p => ({ ...p, [clientId]: 'deferred' }))
    toast('Sugestão adiada — permanece pendente', { icon: '⏳' })
  }

  async function resolveBlocked(clientId, keepId) {
    const client = clients.find(c => c.id === clientId)
    const before = { freshdesk_company_id: client?.freshdesk_company_id, freshdesk_company_ids: client?.freshdesk_company_ids }
    setSaving(p => ({ ...p, [clientId]: true }))
    const { error } = await supabase
      .from('clients')
      .update({ freshdesk_company_id: keepId, freshdesk_company_ids: [keepId] })
      .eq('id', clientId)
    if (error) {
      toast.error(friendlyError(error.message))
    } else {
      setClients(p => p.map(c => c.id === clientId ? { ...c, freshdesk_company_id: keepId, freshdesk_company_ids: [keepId] } : c))
      toast.success(`Mapeamento corrigido para ${keepId}`)
      try {
        const { data: { user } } = await supabase.auth.getUser()
        await supabase.from('audit_logs').insert({
          user_id: user?.id ?? null,
          user_name: user?.email ?? null,
          action: 'freshdesk_blocked_resolved',
          entity_type: 'client',
          entity_id: String(clientId),
          old_value: before,
          new_value: { freshdesk_company_id: keepId, freshdesk_company_ids: [keepId], kept_id: keepId },
        })
      } catch { /* best-effort */ }
    }
    setSaving(p => { const n = { ...p }; delete n[clientId]; return n })
  }

  async function saveClientMapping(clientId) {
    const raw = edits[clientId]
    const value = raw === '' ? null : Number(raw)
    if (raw !== '' && raw !== undefined && isNaN(value)) {
      toast.error('ID inválido — deve ser número')
      return
    }
    // Bloqueio: múltiplos IDs como estado — não permitir salvar sem classificação
    const client = clients.find(c => c.id === clientId)
    if (client?.freshdesk_company_ids?.length > 1) {
      toast.error('Cliente bloqueado — use os botões "Manter" para classificar o ID correto.')
      return
    }
    const before = client?.freshdesk_company_id ?? null
    setSaving(p => ({ ...p, [clientId]: true }))
    const { error } = await supabase
      .from('clients')
      .update({ freshdesk_company_id: value })
      .eq('id', clientId)
    if (error) {
      toast.error(friendlyError(error.message))
    } else {
      setClients(p => p.map(c => c.id === clientId ? { ...c, freshdesk_company_id: value } : c))
      setEdits(p => { const n = { ...p }; delete n[clientId]; return n })
      setSuggestions(p => { const n = { ...p }; delete n[clientId]; return n })
      setDismissed(p => { const n = { ...p }; delete n[clientId]; return n })
      toast.success('Mapeamento salvo')
      // Auditoria — best-effort, não bloqueia o fluxo
      try {
        const { data: { user } } = await supabase.auth.getUser()
        await supabase.from('audit_logs').insert({
          user_id: user?.id ?? null,
          user_name: user?.email ?? null,
          action: 'freshdesk_mapping_saved',
          entity_type: 'client',
          entity_id: String(clientId),
          old_value: before,
          new_value: { after: value, evidence: suggestions[clientId]?.evidence ?? null },
        })
      } catch { /* audit é best-effort */ }
    }
    setSaving(p => { const n = { ...p }; delete n[clientId]; return n })
  }

  if (loading) return <PageSpinner />

  return (
    <div className="space-y-3">
      <p className="text-sm text-text-tertiary">
        {clients.filter(c => c.freshdesk_company_id).length} de {clients.length} clientes mapeados
        {clients.some(c => c.freshdesk_company_ids?.length > 1) && (
          <span className="ml-2 text-amber-600">· {clients.filter(c => c.freshdesk_company_ids?.length > 1).length} bloqueado(s) por múltiplos IDs</span>
        )}
      </p>

      <div className="bg-bg-primary border border-border-tertiary rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-tertiary bg-donc-navy text-white">
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-white uppercase tracking-wider">Cliente</th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-white uppercase tracking-wider">Empresas Freshdesk</th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-white uppercase tracking-wider">Evidência</th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-white uppercase tracking-wider">Confiança</th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold text-white uppercase tracking-wider">Estado</th>
                <th className="px-3 py-2.5 text-right text-xs font-semibold text-white uppercase tracking-wider">Ações</th>
              </tr>
            </thead>
            <tbody>
              {clients.map(c => {
                const currentId = c.freshdesk_company_id
                const multiIds = c.freshdesk_company_ids
                const isBlocked = multiIds?.length > 1
                const editVal   = edits[c.id]
                const isDirty   = editVal !== undefined
                const sug       = suggestions[c.id]
                const dismissedState = dismissed[c.id]
                const displayVal = isDirty ? editVal : (currentId ?? '')
                const estado = isBlocked ? 'bloqueado' : currentId ? 'mapeado' : sug ? 'sugestão' : 'pendente'

                return (
                  <tr key={c.id} className={`border-t border-border-tertiary hover:bg-bg-secondary ${isBlocked ? 'bg-amber-50/50' : ''}`}>
                    <td className="px-3 py-2.5">
                      <span className="font-medium text-text-primary">{c.name}</span>
                      {isBlocked && <Badge variant="amber" className="ml-2">bloqueado</Badge>}
                      {!isBlocked && currentId && <span className="ml-2 text-xs text-donc-verde">✓</span>}
                    </td>
                    <td className="px-3 py-2.5">
                      {isBlocked ? (
                        <div className="flex flex-col gap-1">
                          <span className="text-xs text-amber-700">{multiIds.join(', ')} · requer classificação</span>
                          <div className="flex gap-1 flex-wrap">
                            {multiIds.map(id => (
                              <button
                                key={id}
                                onClick={() => resolveBlocked(c.id, id)}
                                disabled={saving[c.id]}
                                className="text-xs px-2 py-1 rounded bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-40"
                                title={`Manter apenas ${id}`}
                              >
                                Manter {id}
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <input
                          type="number"
                          value={displayVal}
                          onChange={e => setEdits(p => ({ ...p, [c.id]: e.target.value }))}
                          placeholder="ID numérico"
                          className="input-base w-32 text-sm"
                        />
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-xs">
                      {sug && !dismissedState ? (
                        <span className="text-text-secondary">{sug.evidence}</span>
                      ) : dismissedState === 'rejected' ? (
                        <span className="text-text-tertiary/50">rejeitada</span>
                      ) : dismissedState === 'deferred' ? (
                        <span className="text-text-tertiary/50">adiada</span>
                      ) : currentId ? '—' : (
                        <span className="text-text-tertiary/50">nenhuma</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      {sug && !dismissedState ? (
                        <Badge variant={sug.confidence === 'alta' ? 'green' : sug.confidence === 'média' ? 'amber' : 'slate'}>{sug.confidence}</Badge>
                      ) : (
                        <span className="text-text-tertiary/50 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge variant={estado === 'mapeado' ? 'green' : estado === 'bloqueado' ? 'red' : estado === 'sugestão' ? 'amber' : 'slate'}>{estado}</Badge>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {sug && !dismissedState && !isBlocked && (
                          <>
                            <button onClick={() => applySuggestion(c.id, sug.fdId)} className="text-xs px-2 py-1 rounded bg-donc-navy text-white hover:bg-donc-navy/90" title={`Aplicar ${sug.fdName} (ID ${sug.fdId})`}>
                              Confirmar
                            </button>
                            <button onClick={() => rejectSuggestion(c.id)} className="text-xs px-2 py-1 rounded border border-border-tertiary text-text-secondary hover:bg-bg-tertiary" title="Rejeitar sugestão">
                              Rejeitar
                            </button>
                            <button onClick={() => deferSuggestion(c.id)} className="text-xs px-2 py-1 rounded border border-border-tertiary text-text-secondary hover:bg-bg-tertiary" title="Adiar — mantém pendente">
                              Adiar
                            </button>
                          </>
                        )}
                        {isDirty && (
                          <button
                            onClick={() => saveClientMapping(c.id)}
                            disabled={saving[c.id] || isBlocked}
                            className="p-1.5 text-donc-navy hover:text-donc-navy/80 rounded disabled:opacity-40 ml-1"
                            title={saving[c.id] ? 'Salvando...' : isBlocked ? 'Bloqueado — classifique antes' : 'Salvar'}
                          >
                            {saving[c.id] ? <span className="text-xs">…</span> : <Icons.Save size={14} />}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="p-4 border-t border-border-tertiary flex items-center gap-3 flex-wrap">
          <Button onClick={handleFetchSuggestions} disabled={fetching}>
            {fetching ? 'Buscando…' : <span className="flex items-center gap-1.5"><SearchIcon className="w-3.5 h-3.5" /> Buscar sugestões do Freshdesk</span>}
          </Button>
          <span className="text-xs text-text-tertiary">Sugestões exigem confirmação humana antes de salvar.</span>
        </div>
      </div>
    </div>
  )
}

// ── Seção Sincronização ───────────────────────────────────────────────────────
function SyncSection() {
  const SyncIcon = Icons.RefreshCw
  const RefreshCwIcon = Icons.RefreshCw
  const now          = new Date()
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const [month, setMonth]         = useState(defaultMonth)
  const [syncing, setSyncing]     = useState(false)
  const [lastResult, setLastResult] = useState(null)
  const [updatingConfig, setUpdatingConfig] = useState(false)
  const [lastDataSync, setLastDataSync] = useState(null)
  const [lastConfigSync, setLastConfigSync] = useState(null)
  const [configSummary, setConfigSummary] = useState(null)

  async function loadConfigSummary() {
    try {
      const [groups, agents, fields] = await Promise.all([
        getFreshdeskConfig('groups'),
        getFreshdeskConfig('agents'),
        getFreshdeskConfig('ticket_fields'),
      ])
      if (groups || agents || fields) {
        setConfigSummary({
          groups: Array.isArray(groups) ? groups.length : null,
          agents: Array.isArray(agents) ? agents.length : null,
          fields: Array.isArray(fields) ? fields.length : null,
        })
      }
    } catch { /* ignore */ }
  }

  useEffect(() => {
    async function loadLastDataSync() {
      try {
        const { data } = await supabase
          .from('freshdesk_config')
          .select('data')
          .eq('key', 'last_data_sync')
          .maybeSingle()
        if (data?.data?.synced_at) {
          setLastDataSync(data.data.synced_at)
        }
      } catch (e) {
        console.error(e)
      }
    }
    loadLastDataSync()
  }, [])

  useEffect(() => {
    async function loadLastConfigSync() {
      try {
        const data = await getFreshdeskConfig('last_sync')
        if (data?.synced_at) {
          setLastConfigSync(data.synced_at)
        }
      } catch (e) {
        console.error(e)
      }
    }
    loadLastConfigSync()
    loadConfigSummary()
  }, [])

  async function handleUpdateConfig() {
    setUpdatingConfig(true)
    try {
      await fetchAndSaveFreshdeskConfig()
      const [groups, agents, fields] = await Promise.all([
        getFreshdeskConfig('groups'),
        getFreshdeskConfig('agents'),
        getFreshdeskConfig('ticket_fields'),
      ])
      const gLen = Array.isArray(groups) ? groups.length : 0
      const aLen = Array.isArray(agents) ? agents.length : 0
      const fLen = Array.isArray(fields) ? fields.length : 0
      setConfigSummary({ groups: gLen, agents: aLen, fields: fLen })
      const [freshGroups] = await Promise.all([getFreshdeskConfig('last_sync')])
      if (freshGroups?.synced_at) setLastConfigSync(freshGroups.synced_at)
      else setLastConfigSync(new Date().toISOString())
      toast.success(`Configurações atualizadas — ${gLen} grupos, ${aLen} agentes, ${fLen} campos`)
    } catch (e) {
      toast.error(friendlyError(e.message) || 'Erro ao atualizar configurações do Freshdesk')
    } finally {
      setUpdatingConfig(false)
    }
  }

  async function handleSync() {
    setSyncing(true)
    setLastResult(null)
    try {
      const result = await syncAllCompanies(month)
      setLastResult(result)
      try {
        const timestamp = new Date().toISOString()
        const { error } = await supabase
          .from('freshdesk_config')
          .upsert({
            key: 'last_data_sync',
            data: { synced_at: timestamp },
            updated_at: timestamp
          }, {
            onConflict: 'key'
          })
        if (error) {
          console.error('Error saving last_data_sync:', error)
        } else {
          setLastDataSync(timestamp)
        }
      } catch (err) {
        console.error('Unexpected error saving last_data_sync:', err)
      }
      if (result.errors.length === 0) {
        toast.success(`${result.synced} empresa${result.synced !== 1 ? 's' : ''} sincronizada${result.synced !== 1 ? 's' : ''}`)
      } else {
        toast(`${result.synced} sincronizadas, ${result.errors.length} com erro`, { icon: '⚠️' })
      }
    } catch (e) {
      toast.error(friendlyError(e.message) || 'Erro na sincronização')
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="w-full space-y-4">
      {/* Card 1: Sincronização de Dados */}
      <div className="bg-bg-primary border border-border-tertiary rounded-lg p-4 space-y-4">
        <div className="flex items-center gap-2">
          <SyncIcon className="w-4 h-4 text-donc-navy" />
          <p className="text-sm font-medium text-text-primary">Sincronização de Dados</p>
        </div>
        <p className="text-sm text-text-secondary">
          Busca tickets e contatos do Freshdesk para todas as empresas mapeadas e salva como pendentes para revisão.
        </p>
        <div>
          <label className="label-sm">Mês de referência</label>
          <input
            type="month"
            value={month}
            onChange={e => setMonth(e.target.value)}
            className="input-base"
          />
        </div>
        {lastDataSync && (
          <div>
            <p className="text-xs text-text-tertiary">Última sincronização</p>
            <p className="text-xs text-text-secondary">{formatDateTimeBR(lastDataSync)}</p>
          </div>
        )}
        <Button onClick={handleSync} disabled={syncing || !month}>
          {syncing ? 'Sincronizando…' : <span className="flex items-center gap-1.5"><SyncIcon className="w-3.5 h-3.5" /> Sincronizar todos</span>}
        </Button>
        {lastResult && (
          <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 flex items-center gap-2">
            <Icons.CheckCircle className="w-5 h-5 text-green-600 shrink-0" />
            <p className="text-sm text-green-800">
              {lastResult.synced} empresa{lastResult.synced !== 1 ? 's' : ''} sincronizada{lastResult.synced !== 1 ? 's' : ''} com sucesso
            </p>
          </div>
        )}
        {lastResult && lastResult.errors.length > 0 && (
          <div className="text-sm space-y-1">
            <p className="text-donc-red font-medium">❌ Erros:</p>
            <ul className="space-y-0.5 text-text-tertiary">
              {lastResult.errors.map((e, i) => (
                <li key={i}>{e.name}: {friendlyError(e.error)}</li>
              ))}
            </ul>
            <Button onClick={handleSync} disabled={syncing} variant="ghost" size="sm">
              Tentar novamente
            </Button>
          </div>
        )}
      </div>

      {/* Card 2: Configurações do Freshdesk */}
      <div className="bg-bg-primary border border-border-tertiary rounded-lg p-4 space-y-4">
        <div className="flex items-center gap-2">
          <SyncIcon className="w-4 h-4 text-donc-navy" />
          <p className="text-sm font-medium text-text-primary">Configurações do Freshdesk</p>
        </div>
        <p className="text-sm text-text-secondary">
          Sincroniza grupos, agentes e campos de ticket do Freshdesk para uso interno.
        </p>
        {lastConfigSync && (
          <div>
            <p className="text-xs text-text-tertiary">Última atualização</p>
            <p className="text-xs text-text-secondary">{formatDateTimeBR(lastConfigSync)}</p>
          </div>
        )}
        <Button
          onClick={handleUpdateConfig}
          disabled={updatingConfig}
        >
          {updatingConfig ? '⏳ Atualizando…' : <span className="flex items-center gap-1.5"><RefreshCwIcon className="w-3.5 h-3.5" /> Atualizar Configurações</span>}
        </Button>
        {configSummary && (
          <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-xs space-y-1">
            <p className="font-medium text-green-800">
              {configSummary.groups ?? '—'} grupos · {configSummary.agents ?? '—'} agentes · {configSummary.fields ?? '—'} campos
            </p>
            <p className="text-green-700">
              {configSummary.groups != null && configSummary.agents != null ? 'Valide em Pré-voo → Metadados' : 'Nada para sincronizar — dados já atualizados'}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Componente principal: Freshdesk Operations Center ────────────────────────
export function SettingsFreshdesk() {
  const FreshdeskIcon = Icons.Headphones
  const [activeTab, setActiveTab] = useState('overview')
  const { data: preflight, checks, loading: preflightLoading } = usePreflight()

  const TABS = [
    { id: 'overview',  label: 'Visão Geral',  icon: Icons.LayoutList },
    { id: 'preflight', label: 'Pré-voo',      icon: Icons.CheckSquare },
    { id: 'mapping',   label: 'Mapeamento',   icon: Icons.Link },
    { id: 'import',    label: 'Importação',   icon: Icons.Download },
    { id: 'review',    label: 'Revisão',      icon: Icons.ClipboardList },
    { id: 'history',   label: 'Histórico',    icon: Icons.Clock },
  ]

  return (
    <div className="max-w-6xl space-y-4">
      <SettingsSectionHeader
        icon={FreshdeskIcon}
        title="Freshdesk Operations Center"
        subtitle="Centro operacional Freshdesk — verifique a integração, valide mapeamentos, importe o período, revise, publique e acompanhe o histórico."
      />

      {/* Tab navigation — a11y: tablist/tab */}
      <div className="border-b border-border-tertiary overflow-x-auto" role="tablist" aria-label="Seções do Operations Center">
        <div className="flex gap-1 min-w-max">
          {TABS.map(tab => {
            const isActive = activeTab === tab.id
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                role="tab"
                aria-selected={isActive}
                aria-controls={`panel-${tab.id}`}
                id={`tab-${tab.id}`}
                onClick={() => setActiveTab(tab.id)}
                onKeyDown={e => {
                  if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                    e.preventDefault()
                    const idx = TABS.findIndex(t => t.id === activeTab)
                    const next = e.key === 'ArrowRight' ? (idx + 1) % TABS.length : (idx - 1 + TABS.length) % TABS.length
                    setActiveTab(TABS[next].id)
                  }
                }}
                className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap
                  ${isActive ? 'border-donc-navy text-donc-navy' : 'border-transparent text-text-tertiary hover:text-text-primary hover:border-border-tertiary'}`}
              >
                <Icon size={14} />
                {tab.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Panels */}
      <div id="panel-overview" role="tabpanel" aria-labelledby="tab-overview" hidden={activeTab !== 'overview'}>
        <div className="space-y-4">
          <OverviewSection preflight={preflight} onTabChange={setActiveTab} />
        </div>
      </div>

      <div id="panel-preflight" role="tabpanel" aria-labelledby="tab-preflight" hidden={activeTab !== 'preflight'}>
        <div className="space-y-4">
          <PreflightSection checks={checks} loading={preflightLoading} onTabChange={setActiveTab} />
        </div>
      </div>

      <div id="panel-mapping" role="tabpanel" aria-labelledby="tab-mapping" hidden={activeTab !== 'mapping'}>
        <div className="bg-bg-primary border border-border-tertiary rounded-lg p-4 space-y-4">
          <div className="flex items-center gap-2">
            <Icons.Link size={16} className="text-donc-navy" />
            <p className="text-sm font-medium text-text-primary">Mapeamento de Empresas</p>
          </div>
          <p className="text-sm text-text-secondary">Relaciona empresas do doncCX Hub com empresas do Freshdesk. IDs de empresas Freshdesk — não um único campo.</p>
          <MappingSection />
        </div>
      </div>

      <div id="panel-import" role="tabpanel" aria-labelledby="tab-import" hidden={activeTab !== 'import'}>
        <SyncSection />
      </div>

      <div id="panel-review" role="tabpanel" aria-labelledby="tab-review" hidden={activeTab !== 'review'}>
        <ReviewSection />
      </div>

      <div id="panel-history" role="tabpanel" aria-labelledby="tab-history" hidden={activeTab !== 'history'}>
        <HistorySection />
      </div>
    </div>
  )
}

// ── Review section (Phase 1: link to pending page, Phase 3: inline review) ──
function ReviewSection() {
  const navigate = useNavigate()
  const { data: pendingCount, isLoading } = useQuery({
    queryKey: ['freshdesk_review_pending_count'],
    queryFn: async () => {
      // Phase 3: source of truth is metrics_status/contacts_status, not pending
      const { count } = await supabase.from('client_support').select('id', { count: 'exact', head: true }).or('metrics_status.eq.pending,contacts_status.eq.pending')
      return count ?? 0
    },
    staleTime: 30_000,
  })

  const hasPending = (pendingCount ?? 0) > 0

  return (
    <div className="bg-bg-primary border border-border-tertiary rounded-lg p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Icons.ClipboardList size={16} className={hasPending ? 'text-amber-600' : 'text-green-600'} />
        <p className="text-sm font-medium text-text-primary">Revisão</p>
        {isLoading ? (
          <Badge variant="slate">carregando…</Badge>
        ) : hasPending ? (
          <Badge variant="amber">{pendingCount} pendente(s)</Badge>
        ) : (
          <Badge variant="green">nenhuma pendência</Badge>
        )}
      </div>
      {isLoading ? (
        <p className="text-sm text-text-tertiary">Verificando pendências…</p>
      ) : hasPending ? (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          <p className="text-sm font-medium text-amber-800">⚠️ {pendingCount} revisão(ões) aguardando</p>
          <p className="text-xs text-amber-700 mt-0.5">Revise os dados importados antes de confirmar a atualização dos indicadores.</p>
        </div>
      ) : (
        <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2">
          <p className="text-sm font-medium text-green-800">✅ Nenhuma revisão pendente</p>
          <p className="text-xs text-green-700 mt-0.5">Todos os dados importados foram revisados.</p>
        </div>
      )}
      <p className="text-xs text-text-tertiary">
        Contagem considera clientes sob sua responsabilidade (RLS). Para visão completa (service_role): <code>node scripts/freshdesk-canary.js 2026-07</code>
      </p>
      <Button onClick={() => navigate('/config/freshdesk/pendentes')} disabled={!hasPending && !isLoading} variant={hasPending ? 'primary' : 'secondary'}>
        {hasPending ? 'Revisar importações pendentes' : 'Ver revisões'}
      </Button>
    </div>
  )
}
