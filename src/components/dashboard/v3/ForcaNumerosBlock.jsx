import { C, fmtMonthLong } from '@/lib/scoring'
import { Panel } from './primitives'
import { ScopeLabel } from './ScopeLabel'

function fmtInt(v) {
  return v == null ? '—' : Number(v).toLocaleString('pt-BR')
}

export function ForcaNumerosBlock({ ytd, loading, error, onRetry }) {
  const year = new Date().getFullYear()
  const picoMes = ytd?.profissionais_pico_mes ? fmtMonthLong(ytd.profissionais_pico_mes) : null

  const cards = [
    { label: 'Clientes', value: fmtInt(ytd?.clientes), sub: ytd ? `${fmtInt(ytd.clientes_novos_ano)} novos em ${year}` : null },
    { label: 'OS criadas', value: fmtInt(ytd?.os_criadas_ano), sub: 'Acumulado do ano' },
    { label: 'Profissionais ativos', value: fmtInt(ytd?.profissionais_pico), sub: picoMes ? `Pico em ${picoMes}` : 'Pico do ano' },
    { label: 'Média health score', value: ytd?.health_media != null ? Math.round(ytd.health_media) : '—', sub: 'Base ativa', dark: true },
  ]

  return (
    <Panel as="section" aria-labelledby="v3-forca-title">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 28 }}>
        <span style={{ minWidth: 0 }}>
          <h2 id="v3-forca-title" style={{ margin: 0, fontSize: '0.8125rem', fontWeight: 700, color: C.ink, letterSpacing: '-0.01em' }}>
            Nossa força em Números
          </h2>
          <span style={{ fontSize: '0.75rem', color: C.ink2 }}>Acumulado {year}</span>
        </span>
        <ScopeLabel scope="base" />
      </div>

      <div style={{ marginTop: 14, flex: 1 }}>
        {loading && <div className="animate-pulse" style={{ height: 110, borderRadius: 12, background: C.bg }} />}
        {!loading && error && (
          <button type="button" onClick={onRetry} style={{ background: 'none', border: 0, color: C.green, fontWeight: 600, cursor: 'pointer', textDecoration: 'underline', fontSize: '0.8125rem', padding: 0 }}>
            Erro ao carregar — tentar novamente
          </button>
        )}
        {!loading && !error && (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10 }}>
            {cards.map((c, i) => (
              <li
                key={i}
                style={{
                  borderRadius: 14, padding: '14px 16px',
                  background: c.dark ? C.navyDeep : C.bg,
                  color: c.dark ? '#fff' : C.ink,
                  border: c.dark ? 'none' : `0.5px solid ${C.line}`,
                }}
              >
                <div style={{ fontSize: '0.625rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: c.dark ? C.lime : C.ink2 }}>
                  {c.label}
                </div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, marginTop: 6, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                  {c.value}
                </div>
                {c.sub && <div style={{ fontSize: '0.6875rem', marginTop: 6, color: c.dark ? 'rgba(255,255,255,0.6)' : C.ink2 }}>{c.sub}</div>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Panel>
  )
}
