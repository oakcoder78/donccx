import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { C } from '@/lib/scoring'
import { Panel, SeeAll } from './primitives'
import { ScopeLabel } from './ScopeLabel'

const STATUS = {
  on_time: { label: 'Em dia', color: C.green },
  delayed: { label: 'Atrasado', color: C.red },
  paused: { label: 'Parado', color: C.amber },
}

export function ProjetosAbertosBlock({ rows = [], loading, error, onRetry, canSeeCockpit }) {
  const navigate = useNavigate()

  const { total, clientCount, top } = useMemo(() => {
    const t = rows.reduce((s, r) => s + (r.projects?.length || 1), 0)
    const sorted = [...rows].sort((a, b) => {
      const rank = { paused: 3, delayed: 2, on_time: 1 }
      const d = (rank[b.displayStatus] || 0) - (rank[a.displayStatus] || 0)
      if (d !== 0) return d
      return (a.progress || 0) - (b.progress || 0)
    })
    return { total: t, clientCount: rows.length, top: sorted.slice(0, 3) }
  }, [rows])

  return (
    <Panel as="section" aria-labelledby="v3-projetos-title">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 28 }}>
        <h2 id="v3-projetos-title" style={{ margin: 0, fontSize: '0.8125rem', fontWeight: 700, color: C.ink, letterSpacing: '-0.01em' }}>
          Projetos em aberto
        </h2>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: '0.6875rem', fontWeight: 700, color: C.ink2 }}>
            {total} · {clientCount} cliente{clientCount !== 1 ? 's' : ''}
          </span>
          <ScopeLabel scope="carteira" />
        </span>
      </div>

      <div style={{ marginTop: 14, flex: 1 }}>
        {loading && <div className="animate-pulse" style={{ height: 160, borderRadius: 12, background: C.bg }} />}
        {!loading && error && (
          <button type="button" onClick={onRetry} style={{ background: 'none', border: 0, color: C.green, fontWeight: 600, cursor: 'pointer', textDecoration: 'underline', fontSize: '0.8125rem', padding: 0 }}>
            Erro ao carregar — tentar novamente
          </button>
        )}
        {!loading && !error && rows.length === 0 && (
          <p style={{ margin: 0, color: C.ink2, fontSize: '0.8125rem' }}>Nenhum projeto em andamento.</p>
        )}
        {!loading && !error && top.length > 0 && (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {top.map(r => {
              const st = STATUS[r.displayStatus] || STATUS.on_time
              const pct = Math.max(0, Math.min(100, r.progress || 0))
              return (
                <li key={r.clientId}>
                  <button
                    type="button"
                    onClick={() => navigate(`/empresas/${r.clientId}?tab=onboarding`)}
                    style={{ width: '100%', textAlign: 'left', font: 'inherit', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, padding: 12, borderRadius: 14, background: C.bg, border: `0.5px solid ${C.line}` }}
                  >
                    <span
                      role="img"
                      aria-label={`${pct}% concluído`}
                      style={{ position: 'relative', width: 38, height: 38, flexShrink: 0, display: 'grid', placeItems: 'center', borderRadius: '50%', background: `conic-gradient(${st.color} ${pct * 3.6}deg, ${C.line} 0deg)` }}
                    >
                      <span style={{ position: 'absolute', inset: 4, background: C.bg, borderRadius: '50%' }} />
                      <span style={{ position: 'relative', fontSize: '0.6875rem', fontWeight: 700, color: st.color }}>{pct}%</span>
                    </span>
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <span style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: C.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {r.clientName}
                      </span>
                      <span style={{ display: 'block', fontSize: '0.75rem', color: C.ink2, marginTop: 2 }}>
                        {r.currentPhase || 'Sem fase'} · <span style={{ color: st.color, fontWeight: 600 }}>{st.label}</span>
                      </span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <div style={{ marginTop: 12, paddingTop: 12, borderTop: `0.5px solid ${C.line}` }}>
        <SeeAll onClick={() => navigate(canSeeCockpit ? '/projetos-cockpit' : '/cockpits')}>ver todos</SeeAll>
      </div>
    </Panel>
  )
}
