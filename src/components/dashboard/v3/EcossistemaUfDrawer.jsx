import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { C, fmtDate, scoreBandColor } from '@/lib/scoring'
import { canDrillIn } from './gating'

function clienteDesde(c) {
  // Prefer contract_start, fallback to created_at
  const raw = c.contract_start || (c.created_at ? c.created_at.slice(0, 10) : null)
  if (!raw) return '—'
  return fmtDate(raw)
}

export function EcossistemaUfDrawer({ uf, clients = [], effectiveRole, profileId, onClose }) {
  const navigate = useNavigate()

  const ufClients = useMemo(() => {
    if (!uf) return []
    return clients
      .filter(c => c.address_state?.trim().toUpperCase() === uf)
      .sort((a, b) => {
        const na = (a.fantasy_name || a.name || '').toLowerCase()
        const nb = (b.fantasy_name || b.name || '').toLowerCase()
        return na.localeCompare(nb)
      })
  }, [clients, uf])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* Header */}
      <div style={{ padding: '18px 20px 14px', borderBottom: `0.5px solid ${C.line}`, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <h3 style={{ margin: 0, fontSize: '0.9375rem', fontWeight: 700, color: C.ink }}>
            {uf} — {ufClients.length} cliente{ufClients.length !== 1 ? 's' : ''}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            style={{ background: C.bg, border: `0.5px solid ${C.line}`, borderRadius: 8, width: 28, height: 28, display: 'grid', placeItems: 'center', cursor: 'pointer', color: C.ink2, fontSize: 16, lineHeight: 1 }}
          >
            ×
          </button>
        </div>
        <p style={{ margin: '6px 0 0', fontSize: '0.75rem', color: C.ink2 }}>Clientes com sede em {uf} · toda a base</p>
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {ufClients.length === 0 && (
          <p style={{ margin: 0, color: C.ink2, fontSize: '0.8125rem', textAlign: 'center', padding: '24px 0' }}>Nenhum cliente neste estado.</p>
        )}
        {ufClients.map(c => {
          const name = c.fantasy_name || c.name
          const city = c.address_city || '—'
          const score = c.health_total ?? 0
          const color = scoreBandColor(score)
          const clickable = canDrillIn(c, effectiveRole, profileId)
          const inner = (
            <>
              <span style={{ minWidth: 0, flex: 1 }}>
                <span style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: C.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</span>
                <span style={{ display: 'block', fontSize: '0.75rem', color: C.ink2, marginTop: 2 }}>
                  {city} · cliente desde {clienteDesde(c)}
                </span>
              </span>
              <span style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 32, height: 22, borderRadius: 999, padding: '0 7px', fontSize: '0.6875rem', fontWeight: 700, color: '#fff', background: color }}>
                {score}
              </span>
              {clickable && <span style={{ color: C.ink3, fontSize: 16, flexShrink: 0 }}>›</span>}
            </>
          )
          const boxStyle = {
            width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10,
            padding: 12, borderRadius: 14, background: C.bg, border: `0.5px solid ${C.line}`,
          }
          return (
            <div key={c.id}>
              {clickable ? (
                <button type="button" onClick={() => navigate(`/empresas/${c.id}`)} style={{ ...boxStyle, font: 'inherit', cursor: 'pointer' }}>
                  {inner}
                </button>
              ) : (
                <div style={boxStyle}>{inner}</div>
              )}
            </div>
          )
        })}
      </div>

      {/* Footer */}
      <div style={{ padding: '12px 20px', borderTop: `0.5px solid ${C.line}`, flexShrink: 0 }}>
        <button
          type="button"
          onClick={() => navigate(`/empresas?estado=${uf}`)}
          style={{ background: 'none', border: 0, padding: 0, fontSize: '0.8125rem', fontWeight: 600, color: C.navy, cursor: 'pointer' }}
        >
          Ver todos de {uf} em Empresas →
        </button>
      </div>
    </div>
  )
}
