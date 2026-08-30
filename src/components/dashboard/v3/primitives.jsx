import { Component } from 'react'
import { C } from '@/lib/scoring'
import { Icons } from '@/lib/icons'

// One crashing block must never blank the whole dashboard (SDD §3 Page States).
export class BlockBoundary extends Component {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(err) { console.error('[dashboard-v3] block crashed:', err) }
  render() {
    if (this.state.failed) {
      return (
        <Panel style={{ minHeight: 120, justifyContent: 'center' }}>
          <p style={{ margin: 0, color: C.ink2, fontSize: '0.8125rem' }}>
            Não foi possível carregar este bloco.
          </p>
        </Panel>
      )
    }
    return this.props.children
  }
}

// Shared building blocks for the Dashboard v3 blocks. Inline-style idiom, tokens
// from src/lib/scoring.js (SDD §2.3 / §2.4). No #hex literals, no text-[Npx].

export function Panel({ children, style, as: Tag = 'div', ...rest }) {
  return (
    <Tag
      style={{
        background: C.surface,
        border: `0.5px solid ${C.line}`,
        borderRadius: 20,
        padding: '20px 22px 16px',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        boxSizing: 'border-box',
        boxShadow: '0 1px 2px rgba(15,34,58,.04), 0 8px 24px rgba(15,34,58,.05)',
        ...style,
      }}
      {...rest}
    >
      {children}
    </Tag>
  )
}

export function StripHead({ children, style }) {
  return (
    <span style={{
      fontSize: '0.6875rem', letterSpacing: '0.12em', textTransform: 'uppercase',
      color: C.ink2, fontWeight: 700, ...style,
    }}>
      {children}
    </span>
  )
}

export function SeeAll({ children = 'ver todos', onClick, href }) {
  const style = {
    fontSize: '0.75rem', fontWeight: 700, color: C.navy, letterSpacing: '-0.01em',
    background: 'none', border: 0, padding: 0, cursor: 'pointer', display: 'inline-flex',
    alignItems: 'center', gap: 4, textDecoration: 'none',
  }
  const inner = <>{children} <span aria-hidden="true">→</span></>
  if (href) return <a href={href} style={style}>{inner}</a>
  return <button type="button" onClick={onClick} style={style}>{inner}</button>
}

/** Delta badge with a text label (never colour alone — WCAG 1.4.1). */
export function DeltaBadge({ pct, absolute, unit = '', neutralLabel }) {
  if (neutralLabel) {
    return (
      <span style={{
        fontSize: '0.6875rem', fontWeight: 700, letterSpacing: '0.03em', textTransform: 'uppercase',
        padding: '3px 8px', borderRadius: 999, background: C.bg, color: C.ink2, whiteSpace: 'nowrap',
      }}>{neutralLabel}</span>
    )
  }
  const val = pct ?? absolute ?? 0
  const up = val >= 0
  const color = val === 0 ? C.ink2 : up ? C.green : C.red
  const arrow = val === 0 ? '' : up ? '▲' : '▼'
  const text = pct != null
    ? `${up ? '+' : ''}${pct}%`
    : `${up ? '+' : ''}${Number(absolute).toLocaleString('pt-BR')}${unit ? ` ${unit}` : ''}`
  return (
    <span style={{
      fontSize: '0.75rem', fontWeight: 700, color, whiteSpace: 'nowrap',
      fontVariantNumeric: 'tabular-nums',
    }}>
      {arrow && <span aria-hidden="true">{arrow} </span>}{text}
    </span>
  )
}

/**
 * Per-block state wrapper. `title` renders an <h2> (each block is a page section).
 * Delegates loading / empty / error so one failing source never blanks the page.
 */
export function BlockShell({
  title, titleId, icon, scope, headerRight, loading, error, empty, emptyLabel,
  onRetry, children, panelStyle, minHeight = 120,
}) {
  const Icon = icon ? Icons[icon] : null
  return (
    <Panel as="section" aria-labelledby={titleId} style={panelStyle}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 28 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          {Icon && <Icon size={15} aria-hidden="true" style={{ color: C.ink2, flexShrink: 0 }} />}
          <h2 id={titleId} style={{
            margin: 0, fontSize: '0.8125rem', fontWeight: 700, letterSpacing: '-0.01em', color: C.ink,
          }}>{title}</h2>
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          {headerRight}
          {scope}
        </span>
      </div>

      <div style={{ marginTop: 14, flex: 1, minHeight }}>
        {loading && <div className="animate-pulse" style={{ height: minHeight, borderRadius: 12, background: C.bg }} />}
        {!loading && error && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start', color: C.ink2, fontSize: '0.8125rem' }}>
            <span>Erro ao carregar.</span>
            {onRetry && (
              <button type="button" onClick={onRetry} style={{ background: 'none', border: 0, padding: 0, color: C.green, fontWeight: 600, cursor: 'pointer', textDecoration: 'underline', fontSize: '0.8125rem' }}>
                Tentar novamente
              </button>
            )}
          </div>
        )}
        {!loading && !error && empty && (
          <p style={{ color: C.ink2, fontSize: '0.8125rem', margin: 0 }}>{emptyLabel || 'Sem dados.'}</p>
        )}
        {!loading && !error && !empty && children}
      </div>
    </Panel>
  )
}
