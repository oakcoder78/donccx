import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { C } from '@/lib/scoring'
import { Panel } from './primitives'
import { ScopeLabel } from './ScopeLabel'
import { BrazilMap } from '@/components/dashboard/BrazilMap'

export function EcossistemaMapBlock({ clients = [], loading, error, onRetry }) {
  const navigate = useNavigate()
  const goToUF = uf => navigate(`/empresas?estado=${uf}`)

  const topStates = useMemo(() => {
    const m = {}
    clients.forEach(c => {
      const st = c.address_state?.trim().toUpperCase()
      if (st) m[st] = (m[st] || 0) + 1
    })
    return Object.entries(m).map(([uf, count]) => ({ uf, count })).sort((a, b) => b.count - a.count).slice(0, 6)
  }, [clients])

  return (
    <Panel as="section" aria-labelledby="v3-mapa-title">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 28 }}>
        <span style={{ minWidth: 0 }}>
          <h2 id="v3-mapa-title" style={{ margin: 0, fontSize: '0.8125rem', fontWeight: 700, color: C.ink, letterSpacing: '-0.01em' }}>
            Mapa vivo do ecossistema
          </h2>
          <span style={{ fontSize: '0.75rem', color: C.ink2 }}>Clientes por estado</span>
        </span>
        <ScopeLabel scope="base" />
      </div>

      <div style={{ marginTop: 14, flex: 1 }}>
        {loading && <div className="animate-pulse" style={{ height: 260, borderRadius: 12, background: C.bg }} />}
        {!loading && error && (
          <button type="button" onClick={onRetry} style={{ background: 'none', border: 0, color: C.green, fontWeight: 600, cursor: 'pointer', textDecoration: 'underline', fontSize: '0.8125rem', padding: 0 }}>
            Erro ao carregar — tentar novamente
          </button>
        )}
        {!loading && !error && (
          <>
            <BrazilMap clients={clients} onSelectUF={goToUF} />
            {topStates.length > 0 && (
              <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.625rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.ink2 }}>
                  Top estados
                </span>
                {topStates.map(({ uf, count }, i) => (
                  <button
                    key={uf}
                    type="button"
                    onClick={() => goToUF(uf)}
                    style={{
                      font: 'inherit', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600,
                      padding: '3px 10px', borderRadius: 999,
                      background: i === 0 ? C.navy : C.surface,
                      color: i === 0 ? '#fff' : C.ink2,
                      border: i === 0 ? 'none' : `0.5px solid ${C.line}`,
                    }}
                  >
                    {uf} {count}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </Panel>
  )
}
