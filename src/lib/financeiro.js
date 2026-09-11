import { formatBRL4 } from './contractRules'

/**
 * Finance cockpit pure helpers.
 * Mirror of the SQL engine `_financeiro_series_month` (SDD v0.3 §4.1).
 */

export function formatBRL(n) {
  return Number(n || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export function formatPercent(n) {
  if (n === null || n === undefined || n === '') return '—'
  return `${Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`
}

export function monthLabel(refMonth) {
  if (!refMonth) return ''
  const [year, month] = String(refMonth).split('-')
  const d = new Date(Number(year), Number(month) - 1, 1)
  return d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
}

export function deltaDisplay(delta) {
  if (delta === null || delta === undefined) return { text: '—', color: 'text-text-tertiary', arrow: '' }
  const up = Number(delta) >= 0
  return {
    text: `${Math.abs(Number(delta)).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`,
    color: up ? 'text-donc-verde' : 'text-donc-red',
    arrow: up ? ' ▲' : ' ▼',
  }
}

/** Previous calendar month as YYYY-MM (cockpit default ref_month). */
export function defaultRefMonth(from = new Date()) {
  const d = new Date(from.getFullYear(), from.getMonth() - 1, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function filterByBillingType(rows, type) {
  if (!type || type === 'all') return rows
  return (rows || []).filter((r) => r.billing_type === type)
}

export function isExcecaoVigente(refMonth, validFrom, validTo) {
  const m = String(refMonth || '')
  return m >= String(validFrom || '').slice(0, 7) && m <= String(validTo || '').slice(0, 7)
}

export function seriesModeLabel(mode) {
  return mode === 'base_excedente' ? 'Base + excedente' : 'Travado'
}

export function excecaoLabel(type, row = {}) {
  switch (type) {
    case 'isencao_total': return 'Isento'
    case 'desconto_percent': return `Desconto ${formatPercent(row.percent)}`
    case 'valor_reduzido': return 'Valor reduzido'
    case 'desconto_unidade': return `Desconto ${formatBRL4(row.unit_discount)}/un.`
    default: return '—'
  }
}

/** Pure mirror of the por_os tier lookup used by the SQL engine. */
export function tierValue(tiers, uso, floor, unit) {
  const list = [...(tiers || [])].sort((a, b) => a.tier_order - b.tier_order)
  if (list.length === 0) return greatest(uso, floor) * unit
  const applicable = list.find((t) => uso <= t.limit_to)
  if (applicable) return Number(applicable.fixed_value) || 0
  const last = list[list.length - 1]
  return (Number(last.fixed_value) || 0) + greatest(uso - last.limit_to, 0) * (Number(last.excess_unit_price) || 0)
}

/** Suggested renewal base after the annual adjustment: base × (1 + percent/100). */
export function renewalSuggestion(baseValue, percent) {
  const base = Number(baseValue) || 0
  const p = Number(percent) || 0
  if (base <= 0 || p <= 0) return null
  return Math.round(base * (1 + p / 100) * 10000) / 10000
}

function greatest(a, b) {
  return Math.max(Number(a) || 0, Number(b) || 0)
}
