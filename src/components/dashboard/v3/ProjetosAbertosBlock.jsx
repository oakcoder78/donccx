import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { C } from '@/lib/scoring'
import { Panel, SeeAll } from './primitives'
import { ScopeLabel } from './ScopeLabel'
import { canDrillIn } from './gating'
import { Drawer } from '@/components/ui/Drawer'
import { ProjetosAbertosDrawer } from './ProjetosAbertosDrawer'

const STATUS = {
  on_time: { label: 'Em dia', color: C.green },
  delayed: { label: 'Atrasado', color: C.red },
  paused: { label: 'Parado', color: C.amber },
}
const RANK = { paused: 3, delayed: 2, on_time: 1 }

export function ProjetosAbertosBlock({ rows = [], effectiveRole, profileId, loading, error, onRetry }) {
  const navigate = useNavigate()
  const [drawerOpen, setDrawerOpen] = useState(false)

  const { total, top } = useMemo(() => {
    const t = rows.reduce((s, r) => s + (r.open_count || 1), 0)
    const sorted = [...rows].sort((a, b) => {
      const d = (RANK[b.display_status] || 0) - (RANK[a.display_status] || 0)
      return d !== 0 ? d : (a.progress || 0) - (b.progress || 0)
    })
    return { total: t, top: sorted.slice(0, 3) }
  }, [rows])

  return (
    <Panel as="section" aria-labelledby="v3-projetos-title">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 28 }}>
        <h2 id="v3-projetos-title" style={{ margin: 0, fontSize: '0.8125rem', fontWeight: 700, color: C.ink, letterSpacing: '-0.01em' }}>
          Projetos em aberto
        </h2>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: '0.6875rem', fontWeight: 700, color: C.ink2 }}>
            {total} · {rows.length} cliente{rows.length !== 1 ? 's' : ''}
          </span>
          <ScopeLabel scope="base" />
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
              const st = STATUS[r.display_status] || STATUS.on_time
              const pct = Math.max(0, Math.min(100, r.progress || 0))
              const clickable = canDrillIn(r, effectiveRole, profileId)
              const inner = (
                <>
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
                      {r.client_name}
                    </span>
                    <span style={{ display: 'block', fontSize: '0.75rem', color: C.ink2, marginTop: 2 }}>
                      {r.current_phase || 'Sem fase'} · <span style={{ color: st.color, fontWeight: 600 }}>{st.label}</span>
                    </span>
                  </span>
                </>
              )
              const boxStyle = { width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12, padding: 12, borderRadius: 14, background: C.bg, border: `0.5px solid ${C.line}` }
              return (
                <li key={r.client_id}>
                  {clickable ? (
                    <button type="button" onClick={() => navigate(`/empresas/${r.client_id}?tab=operacional&sub=projetos`)} style={{ ...boxStyle, font: 'inherit', cursor: 'pointer' }}>
                      {inner}
                    </button>
                  ) : (
                    <div style={boxStyle}>{inner}</div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <div style={{ marginTop: 12, paddingTop: 12, borderTop: `0.5px solid ${C.line}` }}>
        <SeeAll onClick={() => setDrawerOpen(true)}>ver todos</SeeAll>
      </div>

      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} ariaLabel="Projetos em aberto">
        <ProjetosAbertosDrawer rows={rows} effectiveRole={effectiveRole} profileId={profileId} onClose={() => setDrawerOpen(false)} />
      </Drawer>
    </Panel>
  )
}
