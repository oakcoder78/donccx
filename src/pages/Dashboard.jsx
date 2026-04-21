import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useClients } from '../hooks/useClients'
import { useAuth } from '../contexts/AuthContext'
import { useProfiles } from '../hooks/useProfiles'
import { useHealthConfig } from '../hooks/useHealthConfig'
import { useRecalculateHealth } from '../hooks/useHealthScore'
import { useActivities } from '../hooks/useActivities'
import { PageSpinner } from '../components/ui/Spinner'
import { calcGravidade } from '../lib/gravidade'

// ─── Design tokens ────────────────────────────────────────────────────────────

const C = {
  navy:      '#173557',
  navyInk:   '#0e223a',
  sky:       '#59c2ed',
  skySoft:   '#e8f6fd',
  lime:      '#d3da47',
  limeSoft:  '#f6f8d9',
  bg:        '#f4f5f7',
  surface:   '#ffffff',
  ink:       '#0e223a',
  ink2:      '#3b4a5e',
  ink3:      '#6b7889',
  ink4:      '#9aa5b5',
  line:      'rgba(15,34,58,0.09)',
  lineS:     'rgba(15,34,58,0.16)',
  red:       '#d64545',
  redSoft:   '#fbe9e9',
  amber:     '#d98b28',
  amberSoft: '#fbf0de',
  green:     '#2f9e70',
  greenSoft: '#e3f2ea',
}

const DIMS = [
  { key: 'health_uso',            label: 'Uso' },
  { key: 'health_suporte',        label: 'Suporte' },
  { key: 'health_relacionamento', label: 'Relacionamento' },
  { key: 'health_financeiro',     label: 'Financeiro' },
  { key: 'health_projeto',        label: 'Projeto' },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Bom dia'
  if (h < 18) return 'Boa tarde'
  return 'Boa noite'
}

function initials(name = '') {
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase() || '??'
}

function tempLabel(client) {
  const age = client.temperature_updated_at
    ? (Date.now() - new Date(client.temperature_updated_at).getTime()) / 864e5
    : Infinity
  if (age > 30) return 'Não avaliada'
  const MAP = { 5: 'Quente', 2: 'Morna', 0: 'Neutra', '-3': 'Fria', '-7': 'Crítica' }
  return MAP[String(client.csm_temperature ?? 0)] ?? 'Neutra'
}

function scoreBand(health) {
  if (health >= 75) return { bg: C.greenSoft, text: C.green }
  if (health >= 50) return { bg: C.amberSoft, text: C.amber }
  return { bg: C.redSoft, text: C.red }
}

function getSignals(client) {
  const signals = []
  const delay  = client.delay_days ?? 0
  const health = client.health_total ?? 0
  const temp   = client.csm_temperature ?? 0
  const age    = client.temperature_updated_at
    ? (Date.now() - new Date(client.temperature_updated_at).getTime()) / 864e5
    : Infinity

  if (delay > 0)
    signals.push({ kind: 'urgent', title: `Atividade com atraso ${delay}d`, sub: 'Verificar e reagendar', action: '→ concluir ou reagendar' })

  if (age > 30)
    signals.push({ kind: 'warn', title: 'Temperatura vencida', sub: `Sem avaliação há ${Math.min(Math.round(age), 999)} dias`, action: '→ avaliar agora' })
  else if (temp === -7)
    signals.push({ kind: 'urgent', title: 'Temperatura crítica', sub: 'Risco alto de churn', action: '→ contato imediato' })
  else if (temp === -3)
    signals.push({ kind: 'warn', title: 'Temperatura fria', sub: 'Risco de churn', action: '→ agendar ligação' })

  if (health < 50)
    signals.push({ kind: 'urgent', title: 'Health score crítico', sub: `${health} pts — abaixo de 50`, action: '→ recalcular e planejar' })
  else if (health < 75)
    signals.push({ kind: 'warn', title: 'Health score abaixo do esperado', sub: `${health} pts — meta: 75+`, action: '→ verificar dimensões' })

  return signals
}

function clientStatus(signals) {
  if (signals.some(s => s.kind === 'urgent')) return 'urgent'
  if (signals.length) return 'warn'
  return 'healthy'
}

// ─── SVG icons ────────────────────────────────────────────────────────────────

function Icon({ d, size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  )
}

const ICONS = {
  bolt:  'M13 2L3 14h9l-1 8 10-12h-9z',
  clock: 'M12 3a9 9 0 100 18A9 9 0 0012 3zm0 4v5l3 2',
  therm: 'M14 14.76V3a2 2 0 00-4 0v11.76a4 4 0 104 0z',
  plus:  'M12 5v14M5 12h14',
  check: 'M4 12l5 5L20 6',
  cal:   'M3 4h18v18H3zM16 2v4M8 2v4M3 10h18',
  chev:  'M9 6l6 6-6 6',
  close: 'M6 6l12 12M18 6L6 18',
  trend: 'M3 17l6-6 4 4 8-8M14 7h7v7',
  phone: 'M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.12.9.31 1.78.57 2.63a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.45-1.14a2 2 0 012.11-.45c.85.26 1.73.45 2.63.57A2 2 0 0122 16.92z',
}

// ─── MetricCard ───────────────────────────────────────────────────────────────

function MetricCard({ label, value, color, sub }) {
  return (
    <div style={{
      background: C.surface, border: `0.5px solid ${C.line}`, borderRadius: 16,
      padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 10, minHeight: 108,
    }}>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', color: C.ink3, textTransform: 'uppercase' }}>
        {label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em', color: color || C.ink }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 12, color: C.ink3, fontWeight: 500 }}>{sub}</div>}
    </div>
  )
}

// ─── AttentionCard ────────────────────────────────────────────────────────────

function AttentionCard({ client, signals, isActive, onClick }) {
  const health  = client.health_total ?? 0
  const band    = scoreBand(health)
  const status  = clientStatus(signals)
  const accentColor = status === 'urgent' ? C.red : status === 'warn' ? C.amber : C.sky
  const [hover, setHover] = useState(false)

  return (
    <div
      onClick={() => onClick(client)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: C.surface,
        border: isActive ? `0.5px solid ${C.navy}` : hover ? `0.5px solid ${C.lineS}` : `0.5px solid ${C.line}`,
        borderRadius: 16,
        padding: '18px 20px 16px 22px',
        cursor: 'pointer',
        position: 'relative',
        display: 'grid',
        gridTemplateColumns: '1fr auto',
        gap: '8px 18px',
        transition: 'border-color 0.15s',
      }}
    >
      {/* left accent bar */}
      <div style={{
        position: 'absolute', left: 0, top: 14, bottom: 14,
        width: 3, borderRadius: 2, background: accentColor,
      }} />

      {/* top-left: name + trend */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', gridColumn: '1/2' }}>
        <span style={{ fontWeight: 700, fontSize: 15, color: C.ink, letterSpacing: '-0.01em' }}>
          {client.fantasy_name || client.name}
        </span>
        <span style={{ fontSize: 11, color: C.ink3, fontWeight: 500 }}>
          Temperatura {tempLabel(client)}
        </span>
        {client.stage?.name && (
          <span style={{ fontSize: 11, color: C.ink3, background: '#f1f3f5', padding: '2px 8px', borderRadius: 6, fontWeight: 500 }}>
            {client.stage.name}
          </span>
        )}
      </div>

      {/* top-right: score pill */}
      <div style={{ gridColumn: '2/3', gridRow: '1/3', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, minWidth: 72 }}>
        <span style={{
          fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em',
          padding: '6px 14px', borderRadius: 999, lineHeight: 1,
          background: band.bg, color: band.text,
        }}>
          {health}
        </span>
        <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', color: C.ink4, textTransform: 'uppercase' }}>
          Score
        </span>
      </div>

      {/* bottom-left: tags */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, gridColumn: '1/2', marginTop: 4 }}>
        {signals.slice(0, 3).map((s, i) => (
          <span key={i} style={{
            fontSize: 11, fontWeight: 600, padding: '4px 9px', borderRadius: 6,
            display: 'inline-flex', alignItems: 'center', gap: 5,
            color: s.kind === 'urgent' ? C.red : s.kind === 'warn' ? C.amber : C.ink3,
            background: s.kind === 'urgent' ? C.redSoft : s.kind === 'warn' ? C.amberSoft : '#f1f3f5',
          }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor', display: 'inline-block' }} />
            {s.title}
          </span>
        ))}
        {client.abc_class && (
          <span style={{
            fontSize: 11, fontWeight: 600, padding: '4px 9px', borderRadius: 6,
            color: C.ink3, background: '#f1f3f5',
          }}>
            Classe {client.abc_class}
          </span>
        )}
      </div>
    </div>
  )
}

// ─── HealthyCard ──────────────────────────────────────────────────────────────

function HealthyCard({ client, onClick }) {
  const health = client.health_total ?? 0
  const [hover, setHover] = useState(false)

  return (
    <div
      onClick={() => onClick(client)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: C.surface,
        border: hover ? `0.5px solid ${C.lineS}` : `0.5px solid ${C.line}`,
        borderRadius: 12, padding: '12px 14px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        cursor: 'pointer', transition: 'border-color 0.15s',
      }}
    >
      <div>
        <div style={{ fontWeight: 600, fontSize: 13, color: C.ink }}>
          {client.fantasy_name || client.name}
        </div>
        {client.stage?.name && (
          <div style={{ fontSize: 11, color: C.ink3, fontWeight: 500, marginTop: 2 }}>
            {client.stage.name}
          </div>
        )}
      </div>
      <span style={{
        fontSize: 14, fontWeight: 700, color: C.green,
        background: C.greenSoft, padding: '3px 10px', borderRadius: 999,
      }}>
        {health}
      </span>
    </div>
  )
}

// ─── RightSidebar ─────────────────────────────────────────────────────────────

function ActivityRow({ act }) {
  const date = act.activity_date ? new Date(act.activity_date) : null
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1)

  let when = ''
  let urgency = 'future'
  if (date) {
    const d = new Date(date); d.setHours(0, 0, 0, 0)
    if (d < today) { when = 'Atrasada'; urgency = 'late' }
    else if (d.getTime() === today.getTime()) { when = 'Hoje'; urgency = 'today' }
    else if (d.getTime() === tomorrow.getTime()) { when = 'Amanhã'; urgency = 'today' }
    else { when = date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }); urgency = 'future' }
  }

  const whenColor = urgency === 'late' ? C.red : urgency === 'today' ? C.amber : C.ink4

  return (
    <div style={{ display: 'flex', gap: 10, padding: '10px 0', borderBottom: `0.5px solid ${C.line}` }}>
      <div style={{ flexShrink: 0, width: 56, fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: whenColor, paddingTop: 2 }}>
        {when}
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: C.ink, lineHeight: 1.35 }}>
          {act.description || act.title || 'Atividade'}
        </div>
        <div style={{ fontSize: 11, color: C.ink3, marginTop: 2, fontWeight: 500 }}>
          {act.client?.fantasy_name || act.client?.name || '—'}
        </div>
      </div>
    </div>
  )
}

function RightSidebar({ clients, activities }) {
  const pendingActs = useMemo(() => {
    if (!activities?.length) return []
    return activities
      .filter(a => a.status !== 'done' && a.status !== 'completed' && a.status !== 'cancelado')
      .sort((a, b) => {
        const da = a.activity_date ? new Date(a.activity_date) : new Date('9999')
        const db = b.activity_date ? new Date(b.activity_date) : new Date('9999')
        return da - db
      })
      .slice(0, 4)
  }, [activities])

  const tempsToEval = useMemo(() =>
    clients.filter(c => {
      const age = c.temperature_updated_at
        ? (Date.now() - new Date(c.temperature_updated_at).getTime()) / 864e5
        : Infinity
      return age > 30 || c.csm_temperature === -7 || c.csm_temperature === -3
    }).slice(0, 5),
    [clients]
  )

  const dimStats = useMemo(() =>
    DIMS.map(d => ({
      label: d.label,
      good: clients.filter(c => (c[d.key] ?? 0) >= 10).length,
      total: clients.length,
    })),
    [clients]
  )

  const Panel = ({ title, chip, children }) => (
    <div style={{ background: C.surface, border: `0.5px solid ${C.line}`, borderRadius: 16, padding: '18px 18px 16px' }}>
      <div style={{ fontSize: 13, fontWeight: 700, margin: '0 0 12px', color: C.ink, letterSpacing: '-0.005em', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        {title}
        {chip != null && (
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', background: '#f1f3f5', color: C.ink3, padding: '3px 7px', borderRadius: 6, textTransform: 'uppercase' }}>
            {chip}
          </span>
        )}
      </div>
      {children}
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Activities */}
      <Panel title="Próximas atividades" chip={pendingActs.length || null}>
        {pendingActs.length === 0 ? (
          <div style={{ fontSize: 12, color: C.ink4, textAlign: 'center', padding: '12px 0' }}>Nenhuma atividade pendente</div>
        ) : (
          <div>
            {pendingActs.map((a, i) => (
              <div key={a.id} style={i === pendingActs.length - 1 ? { borderBottom: 'none' } : {}}>
                <ActivityRow act={a} />
              </div>
            ))}
          </div>
        )}
      </Panel>

      {/* Temperatures to evaluate */}
      {tempsToEval.length > 0 && (
        <Panel title="Temperaturas a avaliar" chip={tempsToEval.length}>
          <div>
            {tempsToEval.map((c, i) => {
              const age = c.temperature_updated_at
                ? (Date.now() - new Date(c.temperature_updated_at).getTime()) / 864e5
                : Infinity
              const expired = age > 30
              const isCritical = c.csm_temperature === -7
              const iconBg = isCritical ? C.redSoft : expired ? '#f1f3f5' : C.skySoft
              const iconColor = isCritical ? C.red : expired ? C.ink3 : '#2b7aa4'
              const statusText = expired ? 'Vencida' : isCritical ? 'Crítica' : 'Fria · Atualizar'
              const statusColor = expired ? C.amber : isCritical ? C.red : C.ink3

              return (
                <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: i < tempsToEval.length - 1 ? `0.5px solid ${C.line}` : 'none' }}>
                  <div style={{ width: 22, height: 22, borderRadius: 6, display: 'grid', placeItems: 'center', background: iconBg, color: iconColor, flexShrink: 0 }}>
                    <Icon d={ICONS.therm} size={12} />
                  </div>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: C.ink, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.fantasy_name || c.name}
                  </div>
                  <div style={{ fontSize: 10.5, fontWeight: 600, color: statusColor, textTransform: 'uppercase', letterSpacing: '0.04em', flexShrink: 0 }}>
                    {statusText}
                  </div>
                </div>
              )
            })}
          </div>
        </Panel>
      )}

      {/* Dimensions summary */}
      {clients.length > 0 && (
        <Panel title="Saúde por dimensão" chip={clients.length}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
            {dimStats.map(d => {
              const pct = d.total ? (d.good / d.total) * 100 : 0
              const fillColor = pct >= 80 ? C.green : pct >= 55 ? C.sky : C.amber
              return (
                <div key={d.label} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: 12 }}>
                    <span style={{ fontWeight: 600, color: C.ink }}>{d.label}</span>
                    <span style={{ fontWeight: 700, color: C.ink2, fontSize: 11.5 }}>{d.good} / {d.total}</span>
                  </div>
                  <div style={{ height: 6, background: '#f1f3f5', borderRadius: 999, overflow: 'hidden' }}>
                    <div style={{ height: '100%', borderRadius: 999, background: fillColor, width: `${pct}%`, transition: 'width 0.4s' }} />
                  </div>
                </div>
              )
            })}
          </div>
        </Panel>
      )}
    </div>
  )
}

// ─── ClientDrawer ─────────────────────────────────────────────────────────────

function ClientDrawer({ client, signals, rules, onClose }) {
  const navigate    = useNavigate()
  const recalculate = useRecalculateHealth()
  const health      = client.health_total ?? 0
  const band        = scoreBand(health)
  const status      = clientStatus(signals)

  useEffect(() => {
    const handler = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const pillLabel = status === 'urgent' ? 'Urgente' : status === 'warn' ? 'Atenção' : 'Saudável'
  const pillColors = {
    urgent:  { bg: C.redSoft,   text: C.red },
    warn:    { bg: C.amberSoft, text: C.amber },
    healthy: { bg: C.skySoft,   text: '#2b7aa4' },
  }
  const pc = pillColors[status]

  const signalIcon = (kind) => (
    <Icon d={kind === 'urgent' ? ICONS.bolt : kind === 'warn' ? ICONS.clock : ICONS.therm} />
  )

  const qaList = useMemo(() => {
    const actions = [
      { ico: { bg: '#eef2f7', text: C.navy }, label: 'Recalcular Health Score', key: 'recalc' },
      { ico: { bg: C.amberSoft, text: C.amber }, label: 'Atualizar temperatura', key: 'temp' },
    ]
    if (signals.some(s => s.title.includes('atraso')))
      actions.push({ ico: { bg: C.redSoft, text: C.red }, label: 'Concluir atividade atrasada', key: 'late' })
    if (signals.some(s => s.title.includes('Temperatura vencida')))
      actions.push({ ico: { bg: C.amberSoft, text: C.amber }, label: 'Avaliar temperatura agora', key: 'tempnow' })
    return actions.slice(0, 4)
  }, [signals])

  function handleQA(key) {
    if (key === 'recalc') { recalculate.mutate({ client, rules }); return }
    if (key === 'temp' || key === 'tempnow') { onClose(); navigate(`/empresas/${client.id}?tab=health`); return }
    if (key === 'late') { onClose(); navigate(`/empresas/${client.id}?tab=atividades`); return }
  }

  return (
    <>
      {/* Overlay */}
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(14,34,58,0.18)', zIndex: 40, backdropFilter: 'blur(1px)' }}
      />

      {/* Drawer panel */}
      <div style={{
        position: 'fixed', top: 0, right: 0, height: '100vh', width: 360,
        background: C.surface, borderLeft: `0.5px solid ${C.line}`,
        zIndex: 50, display: 'flex', flexDirection: 'column',
        boxShadow: '-24px 0 48px -24px rgba(15,34,58,0.14)',
      }}>

        {/* Head */}
        <div style={{ padding: '22px 24px 18px', borderBottom: `0.5px solid ${C.line}` }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '3px 8px', borderRadius: 6, background: pc.bg, color: pc.text }}>
                {pillLabel}
              </span>
              <div style={{ marginTop: 8, fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em', color: C.ink }}>
                {client.fantasy_name || client.name}
              </div>
            </div>
            <button
              onClick={onClose}
              style={{ border: 0, background: 'transparent', color: C.ink3, width: 32, height: 32, borderRadius: 8, cursor: 'pointer', display: 'grid', placeItems: 'center', marginTop: -6 }}
              onMouseEnter={e => { e.currentTarget.style.background = '#f1f3f5'; e.currentTarget.style.color = C.ink }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = C.ink3 }}
            >
              <Icon d={ICONS.close} size={16} />
            </button>
          </div>

          {/* Stats row */}
          <div style={{ display: 'flex', marginTop: 16, border: `0.5px solid ${C.line}`, borderRadius: 12, overflow: 'hidden' }}>
            {[
              { k: 'Score', v: health, color: band.text },
              { k: 'Temperatura', v: tempLabel(client), color: C.ink },
              { k: 'Sinais', v: signals.length, color: signals.length > 0 ? C.amber : C.ink },
            ].map((s, i, arr) => (
              <div key={s.k} style={{ flex: 1, padding: '10px 12px', borderRight: i < arr.length - 1 ? `0.5px solid ${C.line}` : 'none', display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 9.5, fontWeight: 700, color: C.ink4, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{s.k}</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: s.color, letterSpacing: '-0.01em' }}>{s.v}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px 12px', display: 'flex', flexDirection: 'column', gap: 22 }}>

          {/* Signals */}
          {signals.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.ink3, marginBottom: 12 }}>
                Sinais ativos · {signals.length}
              </div>
              {signals.map((s, i) => {
                const ic = s.kind === 'urgent' ? { bg: C.redSoft, text: C.red } : s.kind === 'warn' ? { bg: C.amberSoft, text: C.amber } : { bg: '#f1f3f5', text: C.ink3 }
                return (
                  <div key={i} style={{ display: 'flex', gap: 12, padding: 12, border: `0.5px solid ${C.line}`, borderRadius: 12, marginBottom: i < signals.length - 1 ? 8 : 0 }}>
                    <div style={{ width: 28, height: 28, flexShrink: 0, borderRadius: 8, display: 'grid', placeItems: 'center', background: ic.bg, color: ic.text }}>
                      {signalIcon(s.kind)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: C.ink, lineHeight: 1.35 }}>{s.title}</div>
                      <div style={{ fontSize: 11.5, color: C.ink3, marginTop: 2, fontWeight: 500 }}>{s.sub}</div>
                      <span style={{ fontSize: 11.5, color: C.navy, fontWeight: 600, marginTop: 8, display: 'inline-block', cursor: 'pointer' }}>{s.action}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Health dimensions */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.ink3, marginBottom: 12 }}>
              Saúde por dimensão
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
              {DIMS.map(d => {
                const val = client[d.key] ?? 0
                const pct = (val / 20) * 100
                const fillColor = val >= 15 ? C.green : val >= 10 ? C.sky : val >= 7 ? C.amber : C.red
                return (
                  <div key={d.key} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: 12 }}>
                      <span style={{ fontWeight: 600, color: C.ink }}>{d.label}</span>
                      <span style={{ fontWeight: 700, color: C.ink2, fontSize: 11.5 }}>{val} / 20</span>
                    </div>
                    <div style={{ height: 6, background: '#f1f3f5', borderRadius: 999, overflow: 'hidden' }}>
                      <div style={{ height: '100%', borderRadius: 999, background: fillColor, width: `${pct}%`, transition: 'width 0.4s' }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Quick actions */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.ink3, marginBottom: 12 }}>
              Ações rápidas
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {qaList.map(a => (
                <button
                  key={a.key}
                  onClick={() => handleQA(a.key)}
                  disabled={a.key === 'recalc' && recalculate.isPending}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: 12,
                    border: `0.5px solid ${C.line}`, borderRadius: 12,
                    background: 'transparent', cursor: (a.key === 'recalc' && recalculate.isPending) ? 'not-allowed' : 'pointer',
                    textAlign: 'left', opacity: (a.key === 'recalc' && recalculate.isPending) ? 0.6 : 1,
                    fontFamily: 'inherit',
                  }}
                  onMouseEnter={e => { if (!(a.key === 'recalc' && recalculate.isPending)) { e.currentTarget.style.borderColor = C.lineS; e.currentTarget.style.background = '#fafbfc' } }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = C.line; e.currentTarget.style.background = 'transparent' }}
                >
                  <div style={{ width: 26, height: 26, flexShrink: 0, borderRadius: 7, display: 'grid', placeItems: 'center', background: a.ico.bg, color: a.ico.text }}>
                    <Icon d={a.key === 'recalc' ? ICONS.trend : a.key === 'late' ? ICONS.check : ICONS.therm} />
                  </div>
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: C.ink }}>
                    {a.key === 'recalc' && recalculate.isPending ? 'Calculando...' : a.label}
                  </span>
                  <span style={{ color: C.ink4 }}><Icon d={ICONS.chev} /></span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '16px 24px 22px', borderTop: `0.5px solid ${C.line}`, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button
            onClick={() => { onClose(); navigate(`/empresas/${client.id}`) }}
            style={{
              background: C.navy, color: '#fff', border: 0, padding: '12px 16px', borderRadius: 10,
              fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, letterSpacing: '-0.005em', fontFamily: 'inherit',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = C.navyInk }}
            onMouseLeave={e => { e.currentTarget.style.background = C.navy }}
          >
            Abrir cliente completo →
          </button>
          <button
            onClick={onClose}
            style={{ background: 'transparent', border: 0, cursor: 'pointer', color: C.ink3, fontSize: 11.5, fontWeight: 500, textAlign: 'center', fontFamily: 'inherit' }}
            onMouseEnter={e => { e.currentTarget.style.color = C.ink; e.currentTarget.style.textDecoration = 'underline' }}
            onMouseLeave={e => { e.currentTarget.style.color = C.ink3; e.currentTarget.style.textDecoration = 'none' }}
          >
            Dispensar alertas deste cliente
          </button>
        </div>
      </div>
    </>
  )
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { profile }          = useAuth()
  const navigate             = useNavigate()
  const isAdminOrManager     = profile?.role === 'admin' || profile?.role === 'manager'

  const [selectedClient, setSelectedClient] = useState(null)
  const [selectedCsm,    setSelectedCsm]    = useState('')
  const [search,         setSearch]         = useState('')

  const { data: profiles = [] } = useProfiles()
  const { data: healthData }    = useHealthConfig()
  const rules                   = healthData?.rules || []

  const csmFilter = isAdminOrManager
    ? (selectedCsm ? { csm_id: selectedCsm } : {})
    : { csm_id: profile?.id }

  const { data: clients = [], isLoading } = useClients(csmFilter, { enabled: !!profile })

  const activityFilter = useMemo(() =>
    isAdminOrManager ? {} : { responsible_id: profile?.id },
    [isAdminOrManager, profile?.id]
  )
  const { data: activities = [] } = useActivities(activityFilter, { enabled: !!profile })

  // Sync selected client after recalculation
  useEffect(() => {
    if (!selectedClient) return
    const updated = clients.find(c => c.id === selectedClient.id)
    if (updated && updated !== selectedClient) setSelectedClient(updated)
  }, [clients]) // eslint-disable-line react-hooks/exhaustive-deps

  const clientsWithSignals = useMemo(() =>
    clients.map(c => ({ client: c, signals: getSignals(c) })),
    [clients]
  )

  const searched = useMemo(() => {
    if (!search) return clientsWithSignals
    const q = search.toLowerCase()
    return clientsWithSignals.filter(({ client: c }) =>
      (c.fantasy_name || c.name || '').toLowerCase().includes(q)
    )
  }, [clientsWithSignals, search])

  const attentionList = useMemo(() =>
    searched
      .filter(({ signals }) => signals.length > 0)
      .sort((a, b) => calcGravidade(b.client) - calcGravidade(a.client)),
    [searched]
  )

  const healthyList = useMemo(() =>
    searched
      .filter(({ signals }) => signals.length === 0)
      .sort((a, b) => (b.client.health_total ?? 0) - (a.client.health_total ?? 0)),
    [searched]
  )

  // Metrics
  const emRisco   = clients.filter(c => (c.health_total ?? 0) < 50).length
  const emAtencao = clients.filter(c => getSignals(c).length > 0).length
  const tempsExp  = clients.filter(c => {
    const age = c.temperature_updated_at
      ? (Date.now() - new Date(c.temperature_updated_at).getTime()) / 864e5
      : Infinity
    return age > 30
  }).length
  const pendingActivities = activities.filter(a => a.status !== 'done' && a.status !== 'completed' && a.status !== 'cancelado')
  const overdueActs = pendingActivities.filter(a => {
    if (!a.activity_date) return false
    const d = new Date(a.activity_date); d.setHours(0, 0, 0, 0)
    const today = new Date(); today.setHours(0, 0, 0, 0)
    return d < today
  })

  const csmList = profiles
    .filter(p => (p.role === 'csm' || p.role === 'manager') && p.status === 'active')
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''))

  const dateStr = (() => {
    const s = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    return s.charAt(0).toUpperCase() + s.slice(1)
  })()

  const selectedSignals = useMemo(() => {
    if (!selectedClient) return []
    return getSignals(selectedClient)
  }, [selectedClient])

  if (isLoading && !clients.length) return <PageSpinner />

  return (
    <div style={{ background: C.bg, minHeight: '100vh' }}>
      <div style={{
        padding: '36px 48px 64px',
        maxWidth: 1640, margin: '0 auto',
        paddingRight: selectedClient ? `${360 + 48}px` : 48,
        transition: 'padding-right 0.3s ease',
      }}>

        {/* ── HEADER ── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32, gap: 24, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            {/* Avatar */}
            <div style={{ width: 48, height: 48, borderRadius: '50%', flexShrink: 0, background: C.navy, color: '#fff', fontWeight: 700, fontSize: 15, display: 'grid', placeItems: 'center', letterSpacing: '0.02em', border: `0.5px solid ${C.lineS}`, overflow: 'hidden' }}>
              {profile?.avatar_url
                ? <img src={profile.avatar_url} alt={profile.name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                : initials(profile?.name)
              }
            </div>
            <div>
              <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.02em', margin: '0 0 2px', color: C.ink }}>
                {greeting()}, <span style={{ color: C.navy }}>{profile?.name?.split(' ')[0]}</span>.
              </div>
              <div style={{ fontSize: 13, color: C.ink3, fontWeight: 500, textTransform: 'capitalize' }}>{dateStr}</div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 12, color: C.ink3, textAlign: 'right' }}>
              Carteira ativa<br />
              <span style={{ color: C.navy, fontWeight: 700 }}>{clients.length} clientes</span>
              {emAtencao > 0 && <> · <span style={{ color: C.amber, fontWeight: 700 }}>{emAtencao} pedem atenção</span></>}
            </div>
            {isAdminOrManager && (
              <select
                value={selectedCsm}
                onChange={e => setSelectedCsm(e.target.value)}
                style={{
                  padding: '7px 12px', borderRadius: 8,
                  border: `0.5px solid ${C.lineS}`, background: C.surface,
                  color: C.ink, fontSize: 13, cursor: 'pointer', outline: 'none',
                  fontFamily: 'inherit',
                }}
              >
                <option value="">Todos os CSMs</option>
                {csmList.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            )}
          </div>
        </div>

        {/* ── METRICS ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 18, marginBottom: 32 }}>
          <MetricCard
            label="Total de clientes"
            value={clients.length}
            sub={`${healthyList.length} saudáveis · ${attentionList.length} com sinal`}
          />
          <MetricCard
            label="Requer atenção"
            value={emAtencao}
            color={emAtencao > 0 ? C.amber : C.ink}
            sub="clientes com sinal ativo"
          />
          <MetricCard
            label="Em risco crítico"
            value={emRisco}
            color={emRisco > 0 ? C.red : C.ink}
            sub={`health score abaixo de 50`}
          />
          <MetricCard
            label="Temperaturas vencidas"
            value={tempsExp}
            color={tempsExp > 0 ? C.amber : C.ink}
            sub="sem avaliação há 30d+"
          />
        </div>

        {/* ── SEARCH ── */}
        {clients.length > 6 && (
          <div style={{ marginBottom: 24, display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ position: 'relative', maxWidth: 320 }}>
              <span style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: C.ink4, fontSize: 14, pointerEvents: 'none' }}>🔍</span>
              <input
                type="text"
                placeholder="Buscar empresa..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{
                  width: '100%', padding: '8px 14px 8px 32px', borderRadius: 8,
                  border: `0.5px solid ${C.lineS}`, fontSize: 13, color: C.ink,
                  outline: 'none', background: C.surface, fontFamily: 'inherit',
                  boxSizing: 'border-box',
                }}
              />
            </div>
            {search && <span style={{ fontSize: 12, color: C.ink3 }}>{searched.length} resultado{searched.length !== 1 ? 's' : ''}</span>}
          </div>
        )}

        {/* ── CONTENT GRID ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 28, alignItems: 'start' }}>

          {/* Left column */}
          <div>
            {/* Attention clients */}
            {attentionList.length > 0 && (
              <>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', margin: '8px 0 14px' }}>
                  <h2 style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.01em', color: C.ink, margin: 0 }}>
                    Clientes que precisam de atenção
                  </h2>
                  <span style={{ fontSize: 11, color: C.ink3, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {attentionList.length} · ordenados por gravidade
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {attentionList.map(({ client, signals }) => (
                    <AttentionCard
                      key={client.id}
                      client={client}
                      signals={signals}
                      isActive={selectedClient?.id === client.id}
                      onClick={setSelectedClient}
                    />
                  ))}
                </div>
              </>
            )}

            {/* Healthy clients */}
            {healthyList.length > 0 && (
              <>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', margin: `${attentionList.length > 0 ? 28 : 8}px 0 14px` }}>
                  <h2 style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.01em', color: C.ink, margin: 0 }}>
                    Saudáveis · sem sinal ativo
                  </h2>
                  <span style={{ fontSize: 11, color: C.ink3, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {healthyList.length} clientes
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10 }}>
                  {healthyList.map(({ client }) => (
                    <HealthyCard key={client.id} client={client} onClick={setSelectedClient} />
                  ))}
                </div>
              </>
            )}

            {clients.length === 0 && !isLoading && (
              <div style={{ textAlign: 'center', padding: '60px 0', color: C.ink4, fontSize: 14 }}>
                Nenhum cliente encontrado.
              </div>
            )}
          </div>

          {/* Right sidebar */}
          <RightSidebar clients={clients} activities={activities} />
        </div>
      </div>

      {/* ── DRAWER ── */}
      {selectedClient && (
        <ClientDrawer
          client={selectedClient}
          signals={selectedSignals}
          rules={rules}
          onClose={() => setSelectedClient(null)}
        />
      )}
    </div>
  )
}
