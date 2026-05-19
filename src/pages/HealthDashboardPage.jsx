import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useFeatureFlags } from '@/hooks/useFeatureFlags'
import { useClients } from '@/hooks/useClients'
import { Icons } from '@/lib/icons'
import { PageHeader } from '@/components/ui/PageHeader'

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

const GRID = '32px 1fr 64px 48px 48px 48px 48px 48px 56px'

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
  const debounceRef = useRef(null)

  useEffect(() => {
    if (profile && !isEnabled('health', profile.role)) {
      navigate('/dashboard', { replace: true })
    }
  }, [profile])

  const isAdminOrManager = profile?.role === 'admin' || profile?.role === 'manager'
  const baseFilters = isAdminOrManager ? {} : { csm_id: profile?.id }

  const { data: clients = [], isLoading, error } = useClients(baseFilters, { enabled: !!profile })

  function handleSearchChange(e) {
    const val = e.target.value
    setSearch(val)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setDebouncedSearch(val), 300)
  }

  const filtered = useMemo(() => {
    const q = debouncedSearch.toLowerCase()
    if (!q) return clients
    return clients.filter(c => (c.fantasy_name || c.name || '').toLowerCase().includes(q))
  }, [clients, debouncedSearch])

  const sorted = useMemo(
    () => [...filtered].sort((a, b) => (a.health_total ?? 0) - (b.health_total ?? 0)),
    [filtered]
  )

  const avgScore = filtered.length
    ? Math.round(filtered.reduce((s, c) => s + (c.health_total || 0), 0) / filtered.length)
    : 0
  const saudaveis = filtered.filter(c => (c.health_total || 0) >= 75).length
  const atencao   = filtered.filter(c => { const s = c.health_total || 0; return s >= 50 && s < 75 }).length
  const alerta    = filtered.filter(c => (c.health_total || 0) < 50).length

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
    <div className="max-w-5xl mx-auto px-6 py-8">
      <PageHeader
        title="Health Score · Carteira"
        subtitle={isLoading ? '' : `${clients.length} cliente${clients.length !== 1 ? 's' : ''} ativo${clients.length !== 1 ? 's' : ''}`}
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

      {/* Search */}
      <div style={{ marginBottom: 16 }}>
        <input
          type="text"
          value={search}
          onChange={handleSearchChange}
          placeholder="Buscar empresa..."
          className="input-base"
          style={{ width: 280 }}
        />
      </div>

      {/* Table */}
      <div style={{ background: C.surface, borderRadius: 12, border: `1px solid ${C.line}`, overflow: 'hidden' }}>
        {/* Header */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: GRID,
          gap: 14,
          padding: '10px 8px',
          borderBottom: `1px solid ${C.line}`,
          background: C.bg,
          alignItems: 'center',
        }}>
          <div style={{ fontSize: 11, color: C.ink4 }}>#</div>
          <div style={{ fontSize: 11, color: C.ink4 }}>Empresa</div>
          <div style={{ fontSize: 11, color: C.ink4 }}>Total</div>
          {DIMS.map(d => (
            <div key={d.key} style={{ fontSize: 11, color: DIM_COLORS[d.key], fontWeight: 600 }}>{d.label}</div>
          ))}
          <div style={{ fontSize: 11, color: C.ink4 }}>Δ</div>
        </div>

        {/* Loading rows */}
        {isLoading && Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="animate-pulse" style={{
            display: 'grid', gridTemplateColumns: GRID, gap: 14,
            padding: '14px 8px', borderBottom: `0.5px solid ${C.line}`,
            alignItems: 'center',
          }}>
            <div style={{ height: 12, background: '#e8ecf0', borderRadius: 4 }} />
            <div style={{ height: 13, background: '#e8ecf0', borderRadius: 4, width: '65%' }} />
            <div style={{ height: 22, background: '#e8ecf0', borderRadius: 4 }} />
            {DIMS.map(d => <div key={d.key} style={{ height: 13, background: '#e8ecf0', borderRadius: 4 }} />)}
            <div style={{ height: 13, background: '#e8ecf0', borderRadius: 4 }} />
          </div>
        ))}

        {/* Empty */}
        {!isLoading && sorted.length === 0 && (
          <div style={{ padding: '48px 0', textAlign: 'center', color: C.ink3, fontSize: 14 }}>
            Nenhum cliente encontrado
          </div>
        )}

        {/* Rows */}
        {!isLoading && sorted.map((c, i) => (
          <div
            key={c.id}
            onClick={() => navigate(`/empresas/${c.id}?tab=health`)}
            style={{
              display: 'grid',
              gridTemplateColumns: GRID,
              gap: 14,
              padding: '12px 8px',
              borderBottom: `0.5px solid ${C.line}`,
              cursor: 'pointer',
              alignItems: 'center',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = '#f8f9fb')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <div style={{ fontSize: 12, color: C.ink3 }}>{i + 1}</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>
              {c.fantasy_name || c.name}
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, color: scoreBandColor(c.health_total), fontVariantNumeric: 'tabular-nums' }}>
              {c.health_total ?? '—'}
            </div>
            {DIMS.map(d => (
              <div key={d.key} style={{ fontSize: 13, color: DIM_COLORS[d.key], fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
                {c[d.key] ?? '—'}
              </div>
            ))}
            <div style={{
              fontSize: 12,
              fontWeight: 600,
              fontVariantNumeric: 'tabular-nums',
              color: c.health_trend > 0 ? C.green : c.health_trend < 0 ? C.red : C.ink4,
            }}>
              {c.health_trend == null || c.health_trend === 0
                ? '—'
                : c.health_trend > 0
                  ? `+${c.health_trend}`
                  : `${c.health_trend}`}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
