import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { C } from '@/lib/scoring'
import { canDrillIn } from './gating'

const STATUS = {
  on_time: { label: 'Em dia', color: C.green },
  delayed: { label: 'Atrasado', color: C.red },
  paused: { label: 'Parado', color: C.amber },
}
const RANK = { paused: 3, delayed: 2, on_time: 1 }

export function ProjetosAbertosDrawer({ rows = [], effectiveRole, profileId, onClose }) {
  const navigate = useNavigate()
  const [q, setQ] = useState('')

  const sorted = useMemo(() => {
    const filtered = q.trim()
      ? rows.filter(r => r.client_name?.toLowerCase().includes(q.trim().toLowerCase()))
      : rows
    return [...filtered].sort((a, b) => {
      const d = (RANK[b.display_status] || 0) - (RANK[a.display_status] || 0)
      return d !== 0 ? d : (a.progress || 0) - (b.progress || 0)
    })
  }, [rows, q])

  const total = rows.reduce((s, r) => s + (r.open_count || 1), 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* Header */}
      <div style={{ padding: '18px 20px 14px', borderBottom: `0.5px solid ${C.line}`, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <h3 style={{ margin: 0, fontSize: '0.9375rem', fontWeight: 700, color: C.ink }}>Projetos em aberto</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            style={{ background: C.bg, border: `0.5px solid ${C.line}`, borderRadius: 8, width: 28, height: 28, display: 'grid', placeItems: 'center', cursor: 'pointer', color: C.ink2, fontSize: 16, lineHeight: 1 }}
          >
            ×
          </button>
        </div>
        <p style={{ margin: '6px 0 0', fontSize: '0.75rem', color: C.ink2 }}>
          {total} projeto{total !== 1 ? 's' : ''} · {rows.length} cliente{rows.length !== 1 ? 's' : ''} · toda a base
        </p>
        {rows.length > 6 && (
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Buscar cliente..."
            style={{ marginTop: 10, width: '100%', padding: '7px 10px', borderRadius: 8, border: `0.5px solid ${C.line}`, background: C.bg, fontSize: '0.8125rem', outline: 'none', color: C.ink }}
          />
        )}
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {sorted.length === 0 && (
          <p style={{ margin: 0, color: C.ink2, fontSize: '0.8125rem', textAlign: 'center', padding: '24px 0' }}>
            {q.trim() ? 'Nenhum cliente encontrado.' : 'Nenhum projeto em andamento.'}
          </p>
        )}
        {sorted.map(r => {
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
                <span style={{ position: 'absolute', inset: 4, background: '#fff', borderRadius: '50%' }} />
                <span style={{ position: 'relative', fontSize: '0.6875rem', fontWeight: 700, color: st.color }}>{pct}%</span>
              </span>
              <span style={{ minWidth: 0, flex: 1 }}>
                <span style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: C.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {r.client_name}
                </span>
                <span style={{ display: 'block', fontSize: '0.75rem', color: C.ink2, marginTop: 2 }}>
                  {r.current_phase || 'Sem fase'} · <span style={{ color: st.color, fontWeight: 600 }}>{st.label}</span>
                  {r.open_count > 1 && <span style={{ color: C.ink3 }}> · {r.open_count} projetos</span>}
                </span>
              </span>
              {clickable && <span style={{ color: C.ink3, fontSize: 16, flexShrink: 0 }}>›</span>}
            </>
          )
          const boxStyle = {
            width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12,
            padding: 12, borderRadius: 14, background: C.bg, border: `0.5px solid ${C.line}`,
          }
          return (
            <div key={r.client_id}>
              {clickable ? (
                <button
                  type="button"
                  onClick={() => navigate(`/empresas/${r.client_id}?tab=operacional&sub=projetos`)}
                  style={{ ...boxStyle, font: 'inherit', cursor: 'pointer' }}
                >
                  {inner}
                </button>
              ) : (
                <div style={boxStyle}>{inner}</div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
