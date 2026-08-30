import { useNavigate } from 'react-router-dom'
import { C, fmtMonthShort } from '@/lib/scoring'
import { Icons } from '@/lib/icons'
import { useOpClientHistory } from '@/hooks/useOperationalDeltas'
import { DeltaBadge } from './primitives'

// Extracted from DashboardPage.jsx op-* / op-*-list drawer modes (SDD §5.2).
// mode: 'op-os' | 'op-users' | 'op-health'  → single client, 3-month mini charts
//       'op-os-list' | 'op-users-list' | 'op-health-list'  → all clients variation

const KIND = {
  'op-os': { key: 'os', title: 'OS criadas', unit: 'OS' },
  'op-users': { key: 'users', title: 'Profissionais ativos', unit: 'profissionais' },
  'op-health': { key: 'health', title: 'Health score', unit: 'pts' },
}

function Header({ eyebrow, title, subtitle, onClose }) {
  return (
    <div style={{ padding: '22px 24px 18px', borderBottom: `0.5px solid ${C.line}` }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ fontSize: '0.625rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.ink2 }}>{eyebrow}</div>
          <h2 style={{ margin: '4px 0 0', fontSize: '1.1875rem', fontWeight: 700, letterSpacing: '-0.02em', color: C.ink }}>{title}</h2>
          {subtitle && <div style={{ fontSize: '0.75rem', color: C.ink2, fontWeight: 500, marginTop: 6 }}>{subtitle}</div>}
        </div>
        <button type="button" onClick={onClose} aria-label="Fechar" style={{ border: 0, background: 'transparent', color: C.ink2, width: 32, height: 32, borderRadius: 8, cursor: 'pointer', display: 'grid', placeItems: 'center', marginTop: -6 }}>
          <Icons.X size={16} aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}

function MiniChart({ title, values, months, active }) {
  const max = Math.max(...values, 1)
  const cur = values[values.length - 1] ?? 0
  const prev = values[values.length - 2] ?? 0
  const pct = prev ? Math.round(((cur - prev) / prev) * 100) : null
  return (
    <div style={{ border: `0.5px solid ${active ? C.lineStrong : C.line}`, borderRadius: 12, padding: 14, marginBottom: 10, background: active ? C.surface : C.bg }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: active ? C.navy : C.ink2 }}>{title}</span>
        <span style={{ fontSize: '0.75rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: C.ink }}>
          {cur.toLocaleString('pt-BR')}
          {pct != null && <> · <DeltaBadge pct={pct} /></>}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 56, marginBottom: 6 }}>
        {values.map((v, i) => (
          <div key={i} style={{ flex: 1, background: i === values.length - 1 ? C.navy : C.sky, borderRadius: '4px 4px 2px 2px', height: `${Math.max(6, (v / max) * 100)}%` }} />
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, fontSize: '0.625rem', color: C.ink2, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
        {months.map((m, i) => <span key={i} style={{ flex: 1, textAlign: 'center' }}>{m}</span>)}
      </div>
    </div>
  )
}

function ClientHistory({ mode, data, onClose }) {
  const navigate = useNavigate()
  const { data: hist = [], isLoading } = useOpClientHistory(data?.clientId)
  const activeKind = KIND[mode]?.key
  const months = hist.map(r => fmtMonthShort(r.ref_month))

  const charts = [
    { key: 'os', title: 'OS criadas', values: hist.map(r => r.donc_snapshot?.totalOs ?? r.os_created ?? 0) },
    { key: 'users', title: 'Profissionais ativos', values: hist.map(r => r.donc_snapshot?.profissionais?.ativos ?? r.active_users ?? 0) },
    { key: 'health', title: 'Health score', values: hist.map(r => r.health_snapshot ?? 0) },
  ]

  return (
    <>
      <Header eyebrow="Operacional · DONC API" title={data?.clientName || 'Cliente'} subtitle="Histórico 3 meses" onClose={onClose} />
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px 12px' }}>
        {isLoading && <div className="animate-pulse" style={{ height: 200, borderRadius: 12, background: C.bg }} />}
        {!isLoading && hist.length === 0 && <p style={{ color: C.ink2, fontSize: '0.8125rem' }}>Sem histórico operacional.</p>}
        {!isLoading && hist.length > 0 && charts.map(c => (
          <MiniChart key={c.key} title={c.title} values={c.values} months={months} active={c.key === activeKind} />
        ))}
      </div>
      <div style={{ padding: '16px 24px 22px', borderTop: `0.5px solid ${C.line}` }}>
        <button type="button" onClick={() => { onClose(); navigate(`/empresas/${data.clientId}`) }} style={{ width: '100%', background: C.navy, color: '#fff', border: 0, padding: '12px 16px', borderRadius: 10, fontSize: '0.8125rem', fontWeight: 700, cursor: 'pointer' }}>
          Abrir cliente completo →
        </button>
      </div>
    </>
  )
}

function AllClientsList({ mode, rows = [], prevMonthShort, prevMonth2Short, effectiveRole, profileId, onClose }) {
  const navigate = useNavigate()
  const meta = KIND[mode.replace('-list', '')] || KIND['op-os']
  const isHealth = mode.startsWith('op-health')
  const canOpen = r =>
    effectiveRole === 'admin' || effectiveRole === 'manager' ||
    (!!profileId && (r.csm_id === profileId || r.comercial_id === profileId))

  return (
    <>
      <Header
        eyebrow="Operacional · variação mensal"
        title={meta.title}
        subtitle={`${rows.length} cliente${rows.length !== 1 ? 's' : ''} · ${prevMonthShort} vs ${prevMonth2Short}`}
        onClose={onClose}
      />
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 24px' }}>
        {rows.length === 0 && <p style={{ color: C.ink2, fontSize: '0.8125rem' }}>Sem variação registrada.</p>}
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {rows.map(r => {
            const clickable = canOpen(r)
            const inner = (
              <>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: C.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</span>
                  <span style={{ display: 'block', fontSize: '0.75rem', color: C.ink2 }}>
                    {isHealth
                      ? `${prevMonthShort} ${r.cur} · ${prevMonth2Short} ${r.prev ?? '—'}`
                      : `${prevMonthShort} ${Number(r.curVal).toLocaleString('pt-BR')} · ${prevMonth2Short} ${Number(r.prevVal).toLocaleString('pt-BR')}`}
                  </span>
                </span>
                {isHealth
                  ? (r.delta === 0
                      ? <span style={{ fontSize: '0.75rem', color: C.ink2 }}>—</span>
                      : <DeltaBadge absolute={r.delta} unit="pts" />)
                  : (r.state === 'new'
                      ? <DeltaBadge neutralLabel="Início de uso" />
                      : <DeltaBadge absolute={r.state === 'up' ? r.absDelta : -r.absDelta} unit={r.unit} />)}
              </>
            )
            const style = { width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '10px 0', borderBottom: `0.5px solid ${C.line}` }
            return (
              <li key={r.clientId}>
                {clickable
                  ? <button type="button" onClick={() => { onClose(); navigate(`/empresas/${r.clientId}`) }} style={{ ...style, font: 'inherit', cursor: 'pointer' }}>{inner}</button>
                  : <div style={style}>{inner}</div>}
              </li>
            )
          })}
        </ul>
      </div>
    </>
  )
}

export function OperationalHistoryDrawer(props) {
  if (props.mode?.endsWith('-list')) return <AllClientsList {...props} />
  return <ClientHistory {...props} />
}
