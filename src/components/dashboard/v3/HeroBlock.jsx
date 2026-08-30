import { useNavigate } from 'react-router-dom'
import { C, fmtMonthShortYear } from '@/lib/scoring'

// Personalised navy hero: greeting (3 lines, SDD §1.6) + 3 KPI cards per role.
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
  return (Number(v) || 0).toLocaleString('pt-BR')
}

function deltaText(pct) {
  if (pct == null) return null
  const up = pct >= 0
  return { text: `${up ? '+' : ''}${pct}% vs média 90 dias`, color: up ? C.lime : '#f2b8b8' }
}

function buildCards({ effectiveRole, scopedClientCount, op90d, financeSummary, tickets }) {
  const os = op90d?.os
  const prof = op90d?.profissionais
  const opsCards = [
    {
      label: 'Clientes',
      value: fmtInt(scopedClientCount),
      sub: (effectiveRole === 'csm' || effectiveRole === 'sales') ? 'Na sua carteira' : 'Ativos na base',
      to: '/empresas',
    },
    {
      label: 'Ordens de Serviço',
      value: os ? fmtInt(os.mes_atual) : '—',
      delta: deltaText(os?.delta_pct),
    },
    {
      label: 'Profissionais Ativos',
      value: prof ? fmtInt(prof.mes_atual) : '—',
      delta: deltaText(prof?.delta_pct),
    },
  ]

  if (effectiveRole === 'finance') {
    const f = financeSummary
    return [
      {
        label: 'MRR · mês',
        value: f ? fmtMoney(f.mrr_mes) : '—',
        sub: f ? `Acumulado no ano (est.) ${fmtMoney(f.mrr_ytd)}` : null,
      },
      {
        label: 'Clientes em atraso',
        value: f ? fmtInt(f.clientes_atraso) : '—',
        sub: f ? `${fmtMoney(f.valor_atraso)} em atraso` : null,
        subColor: '#f2b8b8',
        to: '/empresas',
      },
      {
        label: 'Renovação em 30D',
        value: f ? fmtInt(f.renovacao_30d) : '—',
        sub: 'Próximos 30 dias',
      },
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

  // csm / sales / manager / admin
  return opsCards
}

export function HeroBlock({
  effectiveRole, profile, greeting, dateStr, dataRefMonth,
  scopedClientCount, op90d, financeSummary, tickets,
}) {
  const navigate = useNavigate()
  const cards = buildCards({ effectiveRole, scopedClientCount, op90d, financeSummary, tickets })
  const first = (profile?.name || '').split(' ')[0]

  return (
    <section
      aria-label="Resumo do dia"
      style={{ background: C.navyDeep, color: '#fff', borderRadius: 20, padding: '28px 26px 24px', overflow: 'hidden' }}
    >
      <div style={{ display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
        {profile?.avatar_url
          ? <img src={profile.avatar_url} alt="" style={{ width: 72, height: 72, borderRadius: 16, objectFit: 'cover', border: '3px solid rgba(255,255,255,0.9)', flexShrink: 0 }} />
          : (
            <div aria-hidden="true" style={{ width: 72, height: 72, borderRadius: 16, background: C.lime, color: C.navyDeep, display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: '1.5rem', flexShrink: 0 }}>
              {(first[0] || '?').toUpperCase()}
            </div>
          )}
        <div style={{ minWidth: 0, flex: 1 }}>
          <p style={{ margin: 0, fontSize: '1.75rem', fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.1, color: '#fff' }}>
            {greeting?.text || `Olá, ${first}.`}
          </p>
          <p style={{ margin: '6px 0 0', fontSize: '0.875rem', color: C.navyTextSoft, lineHeight: 1.3 }}>
            {dateStr}{greeting?.extra ? ` · ${greeting.extra}` : ''}
          </p>
          {dataRefMonth && (
            <p style={{ margin: '2px 0 0', fontSize: '0.875rem', color: C.navyTextMuted, lineHeight: 1.3 }}>
              Dados referente a {fmtMonthShortYear(dataRefMonth)}
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
                {card.delta && (
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, marginTop: 8, color: card.delta.color }}>
                    {card.delta.text}
                  </div>
                )}
                {card.sub && !card.delta && (
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
