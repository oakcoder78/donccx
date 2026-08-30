import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { C, HEALTH_ICONS } from '@/lib/scoring'
import { Icons } from '@/lib/icons'
import { Panel, SeeAll } from './primitives'
import { ScopeLabel } from './ScopeLabel'
import { Drawer } from '@/components/ui/Drawer'
import { ClientHealthDrawer } from '@/components/clients/ClientHealthDrawer'

const DIMS = [
  { key: 'health_uso', label: 'Uso', color: C.dimUso },
  { key: 'health_suporte', label: 'Suporte', color: C.dimSuporte },
  { key: 'health_relacionamento', label: 'Relacionamento', color: C.dimRel },
  { key: 'health_financeiro', label: 'Financeiro', color: C.dimFin },
  { key: 'health_projeto', label: 'Projeto', color: C.dimProj },
]

// dim scores are 0–20
function band(score) {
  const s = score ?? 0
  if (s < 6) return 'risco'
  if (s < 12) return 'atencao'
  return 'ok'
}

export function SaudeDimensaoBlock({ clients = [], loading, error, onRetry }) {
  const navigate = useNavigate()
  const [drawerClient, setDrawerClient] = useState(null)

  const rows = useMemo(() => {
    return DIMS.map(d => {
      const counts = { ok: 0, atencao: 0, risco: 0 }
      const atRisk = []
      clients.forEach(c => {
        const b = band(c[d.key])
        counts[b] += 1
        if (b === 'risco') atRisk.push(c)
      })
      return { ...d, counts, atRisk, bad: counts.risco * 2 + counts.atencao }
    }).sort((a, b) => b.bad - a.bad)
  }, [clients])

  const avg = clients.length
    ? Math.round(clients.reduce((s, c) => s + (c.health_total || 0), 0) / clients.length)
    : 0

  const total = clients.length

  return (
    <Panel as="section" aria-labelledby="v3-saude-title">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 28 }}>
        <h2 id="v3-saude-title" style={{ margin: 0, fontSize: '0.8125rem', fontWeight: 700, color: C.ink, letterSpacing: '-0.01em' }}>
          Saúde por dimensão
        </h2>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: '0.6875rem', fontWeight: 700, color: C.ink2 }}>
            {total} · média {avg}
          </span>
          <ScopeLabel scope="carteira" />
        </span>
      </div>

      <div style={{ marginTop: 14, flex: 1 }}>
        {loading && <div className="animate-pulse" style={{ height: 200, borderRadius: 12, background: C.bg }} />}
        {!loading && error && (
          <button type="button" onClick={onRetry} style={{ background: 'none', border: 0, color: C.green, fontWeight: 600, cursor: 'pointer', textDecoration: 'underline', fontSize: '0.8125rem', padding: 0 }}>
            Erro ao carregar — tentar novamente
          </button>
        )}
        {!loading && !error && total === 0 && (
          <p style={{ margin: 0, color: C.ink2, fontSize: '0.8125rem' }}>Sua carteira ainda não tem empresas.</p>
        )}
        {!loading && !error && total > 0 && (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
            {rows.map(d => {
              const Icon = Icons[HEALTH_ICONS[d.key]] || Icons.Activity
              const okPct = (d.counts.ok / total) * 100
              const atPct = (d.counts.atencao / total) * 100
              const rkPct = (d.counts.risco / total) * 100
              return (
                <li key={d.key}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.8125rem', fontWeight: 600, color: C.ink }}>
                      <Icon size={14} aria-hidden="true" style={{ color: d.color }} />
                      {d.label}
                    </span>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: d.counts.risco ? C.red : d.counts.atencao ? C.amber : C.green }}>
                      {d.counts.risco > 0
                        ? `${d.counts.risco}/${total} em risco`
                        : d.counts.atencao > 0
                          ? `${d.counts.atencao}/${total} em atenção`
                          : `${total}/${total} ok`}
                    </span>
                  </div>
                  <div
                    role="img"
                    aria-label={`${d.label}: ${d.counts.ok} ok, ${d.counts.atencao} em atenção, ${d.counts.risco} em risco`}
                    style={{ display: 'flex', height: 10, borderRadius: 999, overflow: 'hidden', background: C.bg }}
                  >
                    <span style={{ width: `${okPct}%`, background: C.green }} />
                    <span style={{ width: `${atPct}%`, background: C.amber }} />
                    <span style={{ width: `${rkPct}%`, background: C.red }} />
                  </div>
                  {d.atRisk.length > 0 && (
                    <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {d.atRisk.slice(0, 4).map(c => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => setDrawerClient(c)}
                          style={{ font: 'inherit', cursor: 'pointer', fontSize: '0.6875rem', fontWeight: 600, color: C.red, background: C.redSoft, border: 0, borderRadius: 999, padding: '2px 8px' }}
                        >
                          {c.fantasy_name || c.name}
                        </button>
                      ))}
                      {d.atRisk.length > 4 && (
                        <span style={{ fontSize: '0.6875rem', color: C.ink2, alignSelf: 'center' }}>+{d.atRisk.length - 4}</span>
                      )}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <div style={{ marginTop: 12, paddingTop: 12, borderTop: `0.5px solid ${C.line}` }}>
        <SeeAll onClick={() => navigate('/health')}>abrir Health Score</SeeAll>
      </div>

      <Drawer open={!!drawerClient} onClose={() => setDrawerClient(null)} ariaLabel="Detalhe de saúde do cliente">
        {drawerClient && <ClientHealthDrawer client={drawerClient} onClose={() => setDrawerClient(null)} />}
      </Drawer>
    </Panel>
  )
}
