import { useNavigate } from 'react-router-dom'
import { C } from '@/lib/scoring'

// Personalised navy hero: greeting (3 lines) + 3 KPI cards per role.
// No glassmorphism / blur-orbs (UX critique) — flat navy, high contrast.

const ROLE_PILL = {
  admin: 'Admin', manager: 'Gestão', csm: 'CSM',
  sales: 'Comercial', finance: 'Financeiro', analyst: 'Atendimento',
}

function fmtMoney(v) {
  const n = Number(v) || 0
  if (n >= 1_000_000) return `R$ ${(n / 1_000_000).toFixed(1).replace('.', ',')}M`
  if (n >= 1_000) return `R$ ${(n / 1_000).toFixed(1).replace('.', ',')}k`
  return `R$ ${n.toLocaleString('pt-BR')}`
}

function fmtInt(v) {
  return v == null ? '—' : (Number(v) || 0).toLocaleString('pt-BR')
}

function buildCards({ effectiveRole, clientCount, profissionaisAtivos, healthMedia, financeSummary, tickets }) {
  if (effectiveRole === 'finance') {
    const f = financeSummary
    return [
      { label: 'MRR · mês', value: f ? fmtMoney(f.mrr_mes) : '—', sub: f ? `Acumulado no ano (est.) ${fmtMoney(f.mrr_ytd)}` : null },
      { label: 'Clientes em atraso', value: f ? fmtInt(f.clientes_atraso) : '—', sub: f ? `${fmtMoney(f.valor_atraso)} em atraso` : null, subColor: '#f2b8b8', to: '/empresas' },
      { label: 'Renovação em 30D', value: f ? fmtInt(f.renovacao_30d) : '—', sub: 'Próximos 30 dias' },
    ]
  }

  if (effectiveRole === 'analyst') {
    const t = tickets
    return [
      { label: 'Total de Tickets', value: t ? fmtInt(t.opened) : '—', sub: 'Mês de referência', to: '/atendimento' },
      { label: 'Tickets em Aberto', value: t ? fmtInt(t.open) : '—', sub: 'Freshdesk + WhatsApp', to: '/atendimento' },
      { label: 'Taxa de Resolução', value: t?.rate != null ? `${t.rate}%` : '—', sub: 'Mês de referência' },
    ]
  }

  // csm / sales → carteira; admin / manager → base. Same shape.
  const carteira = effectiveRole === 'csm' || effectiveRole === 'sales'
  return [
    { label: 'Clientes', value: fmtInt(clientCount), sub: carteira ? 'Na sua carteira' : 'Ativos na base', to: '/empresas' },
    { label: 'Profissionais Ativos', value: fmtInt(profissionaisAtivos), sub: 'Mês de referência' },
    { label: 'Health Score', value: healthMedia == null ? '—' : Math.round(healthMedia), sub: carteira ? 'Média da carteira' : 'Média da base' },
  ]
}

export function HeroBlock({
  effectiveRole, profile, greeting, dateStr,
  clientCount, profissionaisAtivos, healthMedia, financeSummary, tickets,
}) {
  const navigate = useNavigate()
  const cards = buildCards({ effectiveRole, clientCount, profissionaisAtivos, healthMedia, financeSummary, tickets })
  const first = (profile?.name || '').split(' ')[0]

  return (
    <section
      aria-label="Resumo do dia"
      style={{ background: C.navyDeep, color: '#fff', borderRadius: 20, padding: '28px 26px 24px', overflow: 'hidden' }}
    >
      <div style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
        {profile?.avatar_url
          ? <img src={profile.avatar_url} alt="" style={{ width: 108, height: 108, borderRadius: 20, objectFit: 'cover', border: '3px solid rgba(255,255,255,0.9)', flexShrink: 0 }} />
          : (
            <div aria-hidden="true" style={{ width: 108, height: 108, borderRadius: 20, background: C.lime, color: C.navyDeep, display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: '2rem', flexShrink: 0 }}>
              {(first[0] || '?').toUpperCase()}
            </div>
          )}
        <div style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 4 }}>
          <p style={{ margin: 0, fontSize: '1.75rem', fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.1, color: '#fff' }}>
            {greeting?.text || `Olá, ${first}.`}
          </p>
          <p style={{ margin: 0, fontSize: '0.875rem', color: C.navyTextSoft, lineHeight: 1.3 }}>
            {dateStr}
          </p>
          {greeting?.extra && (
            <p style={{ margin: 0, fontSize: '0.875rem', fontWeight: 700, color: C.sky, lineHeight: 1.3 }}>
              {greeting.extra}
            </p>
          )}
        </div>
        <span style={{
          alignSelf: 'flex-start', background: C.lime, color: C.navyDeep, fontSize: '0.6875rem',
          fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', padding: '4px 10px', borderRadius: 999,
        }}>
          {ROLE_PILL[effectiveRole] || effectiveRole}
        </span>
      </div>

      <ul style={{
        listStyle: 'none', margin: '22px 0 0', padding: 0,
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12,
      }}>
        {cards.map((card, i) => {
          const Tag = card.to ? 'button' : 'div'
          return (
            <li key={i}>
              <Tag
                type={card.to ? 'button' : undefined}
                onClick={card.to ? () => navigate(card.to) : undefined}
                style={{
                  width: '100%', textAlign: 'left', display: 'block',
                  background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.10)',
                  borderRadius: 16, padding: '16px 18px', color: '#fff',
                  cursor: card.to ? 'pointer' : 'default', font: 'inherit',
                }}
              >
                <div style={{ fontSize: '0.6875rem', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, color: 'rgba(255,255,255,0.72)' }}>
                  {card.label}
                </div>
                <div style={{ fontSize: '1.75rem', fontWeight: 800, marginTop: 8, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                  {card.value}
                </div>
                {card.sub && (
                  <div style={{ fontSize: '0.75rem', marginTop: 8, color: card.subColor || 'rgba(255,255,255,0.75)' }}>
                    {card.sub}
                  </div>
                )}
              </Tag>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
