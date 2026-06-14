import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useFeatureFlags } from '@/hooks/useFeatureFlags'
import { useClients } from '@/hooks/useClients'
import { useProfiles } from '@/hooks/useProfiles'
import { Icons } from '@/lib/icons'
import { PageHeader } from '@/components/ui/PageHeader'
import { ClientHealthDrawer } from '@/components/clients/ClientHealthDrawer'
import { useHealthConfig } from '@/hooks/useHealthConfig'

const C = {
  ink: '#0e223a', ink2: '#3b4a5e', ink3: '#6b7889', ink4: '#9aa5b5',
  line: 'rgba(15,34,58,0.09)',
  red: '#d64545',
  amber: '#d98b28',
  green: '#2f9e70',
  bg: '#f4f5f7', surface: '#ffffff',
  dimUso: '#59c2ed', dimSuporte: '#b46cd1', dimRel: '#d98b28',
  dimFin: '#2f9e70', dimProj: '#d3da47',
}

const DIM_ICONS = {
  health_uso: Icons.BarChart3,
  health_suporte: Icons.Target,
  health_relacionamento: Icons.Handshake,
  health_financeiro: Icons.Wallet,
  health_projeto: Icons.Rocket,
}

const DIM_COLORS = {
  health_uso: C.dimUso,
  health_suporte: C.dimSuporte,
  health_relacionamento: C.dimRel,
  health_financeiro: C.dimFin,
  health_projeto: C.dimProj,
}

const DIMS = [
  { key: 'health_uso',            label: 'Uso'  },
  { key: 'health_suporte',        label: 'Sup'  },
  { key: 'health_relacionamento', label: 'Rel'  },
  { key: 'health_financeiro',     label: 'Fin'  },
  { key: 'health_projeto',        label: 'Proj' },
]

function scoreBandColor(s) {
  if ((s ?? 0) < 50) return C.red
  if ((s ?? 0) < 75) return C.amber
  return C.green
}

function ScoreCard({ label, value, color, large }) {
  return (
    <div style={{
      background: C.surface,
      borderRadius: 10,
      padding: '20px 24px',
      border: `1px solid ${C.line}`,
    }}>
      <div style={{
        fontSize: large ? 40 : 32,
        fontWeight: 700,
        color,
        letterSpacing: '-0.02em',
        fontVariantNumeric: 'tabular-nums',
        lineHeight: 1,
        marginBottom: 6,
      }}>
        {value}
      </div>
      <div style={{ fontSize: 12, color: C.ink3, fontWeight: 500 }}>{label}</div>
    </div>
  )
}

export default function HealthDashboardPage() {
  const navigate = useNavigate()

  const { profile } = useAuth()
  const { isEnabled } = useFeatureFlags()
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [bandFilter, setBandFilter] = useState('all')
  const [dimFilter, setDimFilter] = useState('')
  const [csmFilter, setCsmFilter] = useState('')
  const [drawerClientId, setDrawerClientId] = useState(null)
  const [showInfoModal, setShowInfoModal] = useState(false)
  const debounceRef = useRef(null)
  const drawerOpen = !!drawerClientId

  useEffect(() => {
    if (profile && !isEnabled('health', profile.role)) {
      navigate('/dashboard', { replace: true })
    }
  }, [profile])

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') setDrawerClientId(null) }
    if (drawerOpen) window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [drawerOpen])

  const isAdminOrManager = profile?.role === 'admin' || profile?.role === 'manager'
  const baseFilters = isAdminOrManager
    ? { lifecycle_stage: 'cliente' }
    : { csm_id: profile?.id, lifecycle_stage: 'cliente' }

  const { data: clients = [], isLoading, error } = useClients(baseFilters, { enabled: !!profile })
  const { data: profiles = [] } = useProfiles()
  const csmList = useMemo(
    () => profiles.filter(p => p.role === 'csm').sort((a, b) => (a.name || '').localeCompare(b.name || '')),
    [profiles]
  )

  function handleSearchChange(e) {
    const val = e.target.value
    setSearch(val)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setDebouncedSearch(val), 300)
  }

  const filtered = useMemo(() => {
    let result = clients
    const q = debouncedSearch.toLowerCase()
    if (q) result = result.filter(c => (c.fantasy_name || c.name || '').toLowerCase().includes(q))
    return result
  }, [clients, debouncedSearch])

  const bandFiltered = useMemo(() => {
    let result = filtered
    if (bandFilter === 'saudavel') result = result.filter(c => (c.health_total ?? 0) >= 75)
    else if (bandFilter === 'atencao') result = result.filter(c => { const s = c.health_total ?? 0; return s >= 50 && s < 75 })
    else if (bandFilter === 'alerta') result = result.filter(c => (c.health_total ?? 0) < 50)
    if (dimFilter) result = result.filter(c => (c[dimFilter] ?? 0) < 10)
    if (csmFilter) result = result.filter(c => c.csm_id === csmFilter)
    return result
  }, [filtered, bandFilter, dimFilter, csmFilter])

  const sorted = useMemo(
    () => [...bandFiltered].sort((a, b) => (a.health_total ?? 0) - (b.health_total ?? 0)),
    [bandFiltered]
  )

  const drawerClient = useMemo(
    () => sorted.find(c => c.id === drawerClientId) || null,
    [sorted, drawerClientId]
  )

  const avgScore = bandFiltered.length
    ? Math.round(bandFiltered.reduce((s, c) => s + (c.health_total || 0), 0) / bandFiltered.length)
    : 0
  const saudaveis = filtered.filter(c => (c.health_total || 0) >= 75).length
  const atencao   = filtered.filter(c => { const s = c.health_total || 0; return s >= 50 && s < 75 }).length
  const alerta    = filtered.filter(c => (c.health_total || 0) < 50).length

  const chipStyle = (active) => ({
    fontSize: 12,
    fontWeight: 500,
    padding: '5px 12px',
    borderRadius: 20,
    border: active ? 'none' : `1px solid ${C.line}`,
    background: active ? '#173557' : 'transparent',
    color: active ? '#fff' : C.ink3,
    cursor: 'pointer',
    fontFamily: 'inherit',
  })

  const { data: healthConfig } = useHealthConfig()
  const thresholds = healthConfig?.config ?? { threshold_healthy: 75, threshold_attention: 50 }
  const rules = healthConfig?.rules ?? []
  const weights = healthConfig?.weights ?? []

  const stageGroupLabels = {
    onboarding: 'Onboarding',
    producao: 'Produção',
    producao_sem_projeto: 'Produção sem projeto',
  }

  const dimLabels = {
    uso: 'Uso', suporte: 'Suporte', relacionamento: 'Relacionamento',
    financeiro: 'Financeiro', projeto: 'Projeto', temperatura: 'Temperatura',
  }

  const dimOrder = ['uso', 'suporte', 'relacionamento', 'financeiro', 'projeto', 'temperatura']

  const groupedWeights = {}
  for (const w of weights) {
    if (!groupedWeights[w.stage_group]) groupedWeights[w.stage_group] = {}
    groupedWeights[w.stage_group][w.dimension] = w.weight
  }

  const groupedRules = {}
  for (const r of rules) {
    if (!groupedRules[r.dimension]) groupedRules[r.dimension] = []
    groupedRules[r.dimension].push(r)
  }

  if (error) return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <PageHeader title="Health Score · Carteira" />
      <div style={{ textAlign: 'center', padding: '60px 0', color: C.ink3 }}>
        <p style={{ marginBottom: 12, fontSize: 14 }}>Erro ao carregar dados</p>
        <button
          onClick={() => window.location.reload()}
          style={{ fontSize: 13, color: C.green, cursor: 'pointer', background: 'none', border: 'none', textDecoration: 'underline' }}
        >
          Tentar novamente
        </button>
      </div>
    </div>
  )

  return (
    <div style={{
      paddingRight: drawerOpen ? 380 : 0,
      transition: 'padding-right 0.3s ease',
    }}>
    <div className="max-w-5xl mx-auto px-6 py-8">
      <PageHeader
        title="Health Score · Carteira"
        subtitle={isLoading ? '' : `${clients.length} cliente${clients.length !== 1 ? 's' : ''} ativo${clients.length !== 1 ? 's' : ''}`}
        action={
          <button
            onClick={() => setShowInfoModal(true)}
            className="flex items-center gap-1.5 text-xs text-text-tertiary hover:text-text-primary transition-colors px-3 py-1.5 rounded-md border border-border-secondary bg-bg-primary"
          >
            <Icons.HelpCircle size={14} />
            Como funciona
          </button>
        }
      />

      {/* Scorecard */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="animate-pulse" style={{ background: C.surface, borderRadius: 10, padding: '20px 24px', height: 90, border: `1px solid ${C.line}` }}>
              <div style={{ height: 32, width: '55%', background: '#e8ecf0', borderRadius: 6, marginBottom: 10 }} />
              <div style={{ height: 12, width: '40%', background: '#e8ecf0', borderRadius: 4 }} />
            </div>
          ))
        ) : (
          <>
            <ScoreCard label="Média Geral" value={avgScore} color={scoreBandColor(avgScore)} large />
            <ScoreCard label="Saudáveis" value={saudaveis} color={C.green} />
            <ScoreCard label="Atenção" value={atencao} color={C.amber} />
            <ScoreCard label="Alerta" value={alerta} color={C.red} />
          </>
        )}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative w-full max-w-sm">
          <Icons.Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={handleSearchChange}
            placeholder="Buscar empresa..."
            className="w-full pl-9 pr-3 py-2 border border-border-secondary rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-donc-sky/40 focus:border-donc-sky bg-bg-primary text-text-primary placeholder:text-text-tertiary"
          />
        </div>
        {isAdminOrManager && (
          <select
            value={csmFilter}
            onChange={e => setCsmFilter(e.target.value)}
            className="input-base h-9"
            style={{ minWidth: 140 }}
          >
            <option value="">Todos CSMs</option>
            {csmList.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        )}
        <select
          value={dimFilter}
          onChange={e => setDimFilter(e.target.value)}
          className="input-base h-9"
          style={{ minWidth: 140 }}
        >
          <option value="">Dimensão crítica</option>
          {DIMS.map(d => (
            <option key={d.key} value={d.key}>{d.label} {'<'} 10</option>
          ))}
        </select>
      </div>

      {/* Band chips */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {[
          { key: 'all', label: `Todos (${filtered.length})` },
          { key: 'saudavel', label: `Saudáveis (${saudaveis})` },
          { key: 'atencao', label: `Atenção (${atencao})` },
          { key: 'alerta', label: `Alerta (${alerta})` },
        ].map(chip => (
          <button key={chip.key} onClick={() => setBandFilter(chip.key)} style={chipStyle(bandFilter === chip.key)}>
            {chip.label}
          </button>
        ))}
        {(bandFilter !== 'all' || dimFilter || csmFilter) && (
          <button
            onClick={() => { setBandFilter('all'); setDimFilter(''); setCsmFilter('') }}
            style={{ fontSize: 11, color: C.ink3, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', fontFamily: 'inherit' }}
          >
            Limpar filtros
          </button>
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-tertiary mb-3">
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-donc-verde" />
          Saudável (≥{thresholds.threshold_healthy})
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-donc-amber" />
          Atenção (≥{thresholds.threshold_attention})
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-donc-red" />
          Alerta (&lt;{thresholds.threshold_attention})
        </span>
        <span className="text-border-tertiary hidden sm:inline">|</span>
        {DIMS.map(d => (
          <span key={d.key} className="hidden sm:inline-flex items-center gap-1">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: DIM_COLORS[d.key] }} />
            {d.label}
          </span>
        ))}
        <span className="text-border-tertiary hidden sm:inline">|</span>
        <span className="hidden sm:inline">Δ vs. mês anterior</span>
      </div>

      {/* Table */}
      <div className="bg-bg-primary border border-border-tertiary rounded-lg overflow-hidden">
        <div className="overflow-x-auto w-full">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-donc-navy text-white text-xs uppercase tracking-wider">
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-white w-8">#</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-white">Empresa</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-white w-16" title="Score composto 0-100. 5 dimensões (0-20 cada) + temperatura CSM. Pesos variam por grupo de estágio.">Total</th>
                {DIMS.map(d => {
                  const tips = {
                    health_uso: 'Uso da plataforma: OS ativas, usuários ativos, mudanças no catálogo',
                    health_suporte: 'Suporte: tickets abertos, SLA, taxa de resolução',
                    health_relacionamento: 'Relacionamento: decisor, champion, frequência de engajamento',
                    health_financeiro: 'Financeiro: dias em atraso no contrato',
                    health_projeto: 'Projeto: status de onboarding, milestones, atividades vencidas',
                  }
                  return (
                    <th key={d.key} className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-white w-12" title={tips[d.key]}>{d.label}</th>
                  )
                })}
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-white w-14" title="Variação do score total em relação ao mês anterior">Δ</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="animate-pulse">
                  <td className="px-4 py-2.5"><div className="h-3 bg-bg-secondary rounded" /></td>
                  <td className="px-4 py-2.5"><div className="h-3 bg-bg-secondary rounded w-2/3" /></td>
                  <td className="px-4 py-2.5"><div className="h-5 bg-bg-secondary rounded" /></td>
                  {DIMS.map(d => <td key={d.key} className="px-4 py-2.5"><div className="h-3 bg-bg-secondary rounded" /></td>)}
                  <td className="px-4 py-2.5"><div className="h-3 bg-bg-secondary rounded" /></td>
                </tr>
              ))}
              {!isLoading && sorted.length === 0 && (
                <tr>
                  <td colSpan={9} className="text-center py-12 text-text-tertiary text-sm px-4">Nenhum cliente encontrado</td>
                </tr>
              )}
              {!isLoading && sorted.map((c, i) => (
                <tr
                  key={c.id}
                  onClick={() => setDrawerClientId(c.id)}
                  className="border-b border-border-tertiary transition-colors hover:bg-bg-secondary cursor-pointer"
                >
                  <td className="px-4 py-2.5 text-text-tertiary text-xs">{i + 1}</td>
                  <td className="px-4 py-2.5 text-text-primary font-medium">{c.fantasy_name || c.name}</td>
                  <td className="px-4 py-2.5" style={{ fontSize: 22, fontWeight: 700, color: scoreBandColor(c.health_total), fontVariantNumeric: 'tabular-nums' }}>
                    {c.health_total ?? '—'}
                  </td>
                  {DIMS.map(d => (
                    <td key={d.key} className="px-4 py-2.5" style={{ color: DIM_COLORS[d.key], fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
                      {c[d.key] ?? '—'}
                    </td>
                  ))}
                  <td className="px-4 py-2.5" style={{
                    fontWeight: 600,
                    fontVariantNumeric: 'tabular-nums',
                    color: c.health_trend > 0 ? C.green : c.health_trend < 0 ? C.red : C.ink4,
                  }}>
                    {c.health_trend == null || c.health_trend === 0
                      ? '—'
                      : c.health_trend > 0
                        ? `+${c.health_trend}`
                        : `${c.health_trend}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>

      {/* OVERLAY */}
      <div onClick={() => setDrawerClientId(null)} style={{
        position: 'fixed', inset: 0, background: 'rgba(14,34,58,0.18)',
        opacity: drawerOpen ? 1 : 0, pointerEvents: drawerOpen ? 'auto' : 'none',
        transition: 'opacity 0.25s ease', zIndex: 40,
      }} />

      {/* DRAWER */}
      <aside style={{
        position: 'fixed', top: 0, right: 0, height: '100vh', width: 380,
        background: C.surface, borderLeft: `0.5px solid ${C.line}`,
        zIndex: 50, display: 'flex', flexDirection: 'column',
        transform: drawerOpen ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.3s cubic-bezier(.3,.7,.3,1)',
        boxShadow: '-1px 0 0 rgba(15,34,58,0.04), -24px 0 48px -24px rgba(15,34,58,0.16)',
        fontFamily: "'Montserrat', system-ui, sans-serif",
      }}>
        {drawerOpen && drawerClient && (
          <ClientHealthDrawer
            client={drawerClient}
            onClose={() => setDrawerClientId(null)}
          />
        )}
      </aside>

      {/* Info modal */}
      {showInfoModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 px-4"
          onClick={() => setShowInfoModal(false)}
        >
          <div
            className="bg-bg-primary border border-border-tertiary rounded-xl shadow-xl max-w-2xl w-full max-h-[80vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-border-tertiary flex-shrink-0">
              <h2 className="text-base font-semibold text-text-primary">Como funciona o Health Score</h2>
              <button onClick={() => setShowInfoModal(false)} className="text-text-tertiary hover:text-text-primary transition-colors">
                <Icons.X size={18} />
              </button>
            </div>
            <div className="px-6 py-5 space-y-6 overflow-y-auto text-sm text-text-secondary">
              {/* O que é */}
              <div>
                <h3 className="text-sm font-semibold text-text-primary mb-2">O que é</h3>
                <p>
                  O Health Score é uma nota de 0 a 100 que reflete a saúde do relacionamento com cada cliente.
                  É composto por <strong className="text-text-primary">5 dimensões</strong> (Uso, Suporte, Relacionamento,
                  Financeiro, Projeto) mais a <strong className="text-text-primary">Temperatura CSM</strong>.
                  Cada dimensão vale 0-20 e é ponderada por peso conforme o grupo de estágio do cliente.
                </p>
              </div>

              {/* Bandas */}
              <div>
                <h3 className="text-sm font-semibold text-text-primary mb-2">Classificação</h3>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-donc-verde flex-shrink-0" />
                    <span><strong className="text-text-primary">Saudável</strong> — score ≥ {thresholds.threshold_healthy}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-donc-amber flex-shrink-0" />
                    <span><strong className="text-text-primary">Atenção</strong> — score entre {thresholds.threshold_attention} e {thresholds.threshold_healthy - 1}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-donc-red flex-shrink-0" />
                    <span><strong className="text-text-primary">Alerta</strong> — score &lt; {thresholds.threshold_attention}</span>
                  </div>
                </div>
              </div>

              {/* Pesos por estágio */}
              {groupedWeights && Object.keys(groupedWeights).length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-text-primary mb-2">Pesos por grupo de estágio</h3>
                  <p className="mb-3">Cada grupo de estágio possui pesos diferentes para cada dimensão. A soma totaliza 100.</p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border-tertiary text-text-tertiary">
                          <th className="text-left px-2 py-1.5 font-medium">Grupo</th>
                          {dimOrder.map(d => (
                            <th key={d} className="text-center px-2 py-1.5 font-medium">{dimLabels[d]}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(groupedWeights).map(([group, dims]) => (
                          <tr key={group} className="border-b border-border-tertiary last:border-b-0">
                            <td className="px-2 py-1.5 text-text-primary font-medium whitespace-nowrap">{stageGroupLabels[group] || group}</td>
                            {dimOrder.map(d => (
                              <td key={d} className="text-center px-2 py-1.5 tabular-nums">{dims[d] ?? '—'}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Regras por dimensão */}
              {dimOrder.filter(d => d !== 'temperatura').map(dim => {
                const dimRules = groupedRules[dim] || []
                if (!dimRules.length) return null
                const colorKey = 'health_' + dim
                return (
                  <div key={dim}>
                    <h3 className="text-sm font-semibold text-text-primary mb-2 flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: DIM_COLORS[colorKey] || '#94a3b8' }} />
                      {dimLabels[dim]}
                    </h3>
                    <div className="space-y-1">
                      {dimRules.map(r => (
                        <div key={r.id} className="flex items-center justify-between text-xs">
                          <span className="text-text-secondary">{r.label}</span>
                          <span className={`tabular-nums font-medium ml-4 ${r.points > 0 ? 'text-donc-verde' : r.points < 0 ? 'text-donc-red' : 'text-text-tertiary'}`}>
                            {r.points > 0 ? `+${r.points}` : r.points}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}

              {/* Temperatura */}
              <div>
                <h3 className="text-sm font-semibold text-text-primary mb-2">Temperatura CSM</h3>
                <p>
                  Avaliação subjetiva do CSM sobre o cliente, de 0 a 10 (convertido para 0-20).
                  Expira em 30 dias se não for reavaliada pelo CSM responsável.
                </p>
              </div>

              {/* Trend */}
              <div>
                <h3 className="text-sm font-semibold text-text-primary mb-2">Trend (Δ)</h3>
                <p>
                  Diferença entre o score total do mês atual e o mês anterior.
                  Valores positivos indicam melhora, negativos indicam piora.
                  A trend é calculada automaticamente na sincronização mensal.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
