/**
 * reportGenerator.js — RMC Sistema de Design
 * Arquitetura de "slides" com design system completo.
 * Navy #173557 · Navy-deep #0e2240 · Lime #d3da47 · Sky #59c2ed
 */

import { getSectionFields, resolveField, formatFieldValue } from './reportFields'

// ── Design tokens ─────────────────────────────────────────────
const C = {
  navy:      '#173557',
  navyDeep:  '#0e2240',
  lime:      '#d3da47',
  sky:       '#59c2ed',
  bg:        '#fafbfc',
  card:      '#ffffff',
  text:      '#2d3748',
  textLight: '#718096',
  border:    '#e2e8f0',
  green:     '#38a169',
  yellow:    '#d69e2e',
  red:       '#e53e3e',
}

const ACCENT = {
  sky:   C.sky,
  lime:  C.lime,
  navy:  C.navy,
  green: C.green,
}

const DELTA_COLORS = {
  green: { bg: '#f0fff4', text: '#276749' },
  red:   { bg: '#fff5f5', text: '#9b2c2c' },
  gray:  { bg: '#f3f4f6', text: '#6b7280' },
}

const MONTH_NAMES = [
  '', 'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro',
]
const MONTH_SHORT = [
  '', 'Jan','Fev','Mar','Abr','Mai','Jun',
  'Jul','Ago','Set','Out','Nov','Dez',
]

export function periodLabel(period) {
  if (!period) return ''
  const [y, m] = period.split('-')
  return `${MONTH_NAMES[parseInt(m, 10)]} ${y}`
}

function mShort(period) {
  if (!period) return ''
  return MONTH_SHORT[parseInt(period.split('-')[1], 10)]
}

function prevMonthStr(period) {
  const [y, m] = period.split('-').map(Number)
  const d = new Date(y, m - 2, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// ── Seções padrão ─────────────────────────────────────────────
function buildFieldDefaults(type) {
  const fds = getSectionFields(type)
  const fields = {}
  for (const f of fds) {
    fields[f.key] = { enabled: f.defaultEnabled, override: null }
  }
  return fields
}

export function defaultSections() {
  return [
    { id: 'capa',           type: 'capa',           title: 'Capa',              enabled: true, content: { subtitle: '', clientTeam: [] }, extras: [] },
    { id: 'escala',         type: 'escala',         title: 'Escala da Operação',enabled: true, content: { callout: '', fields: buildFieldDefaults('escala') }, extras: [] },
    { id: 'indicadores_operacionais', type: 'indicadores_operacionais', title: 'Indicadores Operacionais', subtitle: 'Métricas de tempo dos profissionais em campo', enabled: true, content: { callout: '', fields: buildFieldDefaults('indicadores_operacionais') }, extras: [] },
    { id: 'qualidade_operacao', type: 'qualidade_operacao', title: 'Qualidade da Operação', subtitle: '', enabled: true, content: { callout: '', fields: buildFieldDefaults('qualidade_operacao') }, extras: [] },
    { id: 'categorias_ocorrencia', type: 'categorias_ocorrencia', title: 'Categorias de Ocorrência', subtitle: '', enabled: true, content: { callout: '', fields: buildFieldDefaults('categorias_ocorrencia') }, extras: [] },
    { id: 'desempenho_operacional', type: 'desempenho_operacional', title: 'Desempenho Operacional', subtitle: 'Produtividade dos profissionais em campo', enabled: false, content: { callout: '', fields: buildFieldDefaults('desempenho_operacional') }, extras: [] },
    { id: 'suporte',        type: 'suporte',        title: 'Suporte',           enabled: true, content: { callout: '', fields: buildFieldDefaults('suporte') }, extras: [] },
    { id: 'projetos',       type: 'projetos',       title: 'Projetos',          enabled: true, content: { callout: '' }, extras: [] },
    { id: 'health_score',   type: 'health_score',   title: 'Health Score',      enabled: true, content: {},             extras: [] },
    { id: 'destaques',      type: 'destaques',      title: 'Destaques do Período', enabled: true, content: { items: [], callout: '' }, extras: [] },
    { id: 'contexto',       type: 'contexto',       title: 'Contexto Externo',  enabled: true, content: { text: '' },   extras: [] },
    { id: 'proximos_passos',type: 'proximos_passos',title: 'Próximos Passos',   enabled: true, content: { items: [] },  extras: [] },
  ]
}

/** Garante que uma seção tenha o objeto fields no content */
export function ensureFields(sec, type) {
  if (!sec.content) sec.content = {}
  if (!sec.content.fields) {
    const fds = getSectionFields(type)
    if (fds.length) {
      const fields = {}
      for (const f of fds) {
        const oldKey = f.key
        // Migrate old-style overrides
        let override = null
        if (sec.content[`override${oldKey.replace(/(^|_)(\w)/g, (_, __, c) => c.toUpperCase())}`] != null) {
          override = sec.content[`override${oldKey.replace(/(^|_)(\w)/g, (_, __, c) => c.toUpperCase())}`]
        }
        fields[f.key] = { enabled: f.defaultEnabled, override }
      }
      sec.content.fields = fields
      // Clean up old overrides
      if (sec.content.overrideOs != null) delete sec.content.overrideOs
      if (sec.content.overrideUsers != null) delete sec.content.overrideUsers
      if (sec.content.overrideProdutosMontados != null) delete sec.content.overrideProdutosMontados
      if (sec.content.overrideExecMin != null) delete sec.content.overrideExecMin
      if (sec.content.overrideTransitoMin != null) delete sec.content.overrideTransitoMin
      if (sec.content.overrideTicketsAbertos != null) delete sec.content.overrideTicketsAbertos
      if (sec.content.overrideTicketsResolvidos != null) delete sec.content.overrideTicketsResolvidos
      if (sec.content.overrideSla != null) delete sec.content.overrideSla
      if (sec.content.overrideTaxaResolucao != null) delete sec.content.overrideTaxaResolucao
    }
  }
}

/** Migra formato antigo (object) para array de seções */
export function normalizeSections(raw) {
  if (Array.isArray(raw)) {
    // Verificar se já tem seção capa; se não, inserir no início
    const hasCapa = raw.some(s => s.id === 'capa')
    const result = hasCapa ? raw : [
      { id: 'capa', type: 'capa', title: 'Capa', enabled: true, content: { subtitle: '', clientTeam: [] }, extras: [] },
      ...raw,
    ]
    for (const sec of result) ensureFields(sec, sec.type)
    return result
  }
  if (!raw || typeof raw !== 'object') return defaultSections()

  // Formato legado: { escala: { content, enabled }, ... }
  const defs = defaultSections()
  const keyMap = {
    escala: 'callout', suporte: 'callout', projetos: 'callout',
    destaques: 'callout', contexto: 'text', proximos_passos: null,
  }
  return defs.map(def => {
    if (def.id === 'capa') return def
    const old = raw[def.id]
    if (!old) return def
    const enabled = typeof old === 'object' ? old.enabled !== false : true
    const text    = typeof old === 'string' ? old : (old.content ?? '')
    const field   = keyMap[def.id]
    const content = field ? { ...def.content, [field]: text } : def.content
    const sec = { ...def, enabled, content }
    ensureFields(sec, sec.type)
    return sec
  })
}

// ── Utilidade de texto rico ───────────────────────────────────
function richText(text) {
  if (!text) return ''
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br>')
}

// ── Componentes HTML reutilizáveis ────────────────────────────

function kpiCard({ label, value, sublabel, delta, deltaType, accentColor, highlighted, deltaColor }) {
  const accent = ACCENT[accentColor] ?? C.sky

  // Arrow icon (always from deltaType)
  const dIcon  = deltaType === 'up'   ? '▲'
               : deltaType === 'down' ? '▼'
               : deltaType === 'none' ? ''
               : '≈'

  // Badge colors: deltaColor overrides, 'auto' or undefined derives from deltaType
  const dPalette = (deltaColor && deltaColor !== 'auto')
    ? (DELTA_COLORS[deltaColor] ?? DELTA_COLORS.gray)
    : deltaType === 'up'   ? DELTA_COLORS.green
    : deltaType === 'down' ? DELTA_COLORS.red
    : DELTA_COLORS.gray

  const dBg    = dPalette.bg
  const dColor = dPalette.text

  if (highlighted) {
    const sublabelH = sublabel
      ? `<div style="font-size:11px;color:rgba(255,255,255,0.6);margin-top:4px;">${sublabel}</div>` : ''
    const deltaH = delta
      ? `<div style="display:inline-flex;align-items:center;gap:3px;margin-top:8px;padding:2px 8px;border-radius:999px;background:rgba(255,255,255,0.1);color:rgba(255,255,255,0.6);font-size:11px;font-weight:700;">${dIcon} ${delta}</div>` : ''
    return `
    <div style="background:${C.navyDeep};border-radius:10px;border:1px solid rgba(255,255,255,0.1);padding:16px 20px;">
      <div style="font-size:10px;font-weight:700;color:${C.sky};text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">${label}</div>
      <div style="font-size:2.2rem;font-weight:800;color:${C.lime};line-height:1;">${value ?? '—'}</div>
      ${sublabelH}${deltaH}
    </div>`
  }

  const sublabelH = sublabel
    ? `<div style="font-size:11px;color:${C.textLight};margin-top:4px;">${sublabel}</div>` : ''
  const deltaH = delta
    ? `<div style="display:inline-flex;align-items:center;gap:3px;margin-top:8px;padding:2px 8px;border-radius:999px;background:${dBg};color:${dColor};font-size:11px;font-weight:700;">${dIcon} ${delta}</div>` : ''

  return `
  <div style="background:${C.card};border-radius:10px;border:1px solid ${C.border};border-top:3px solid ${accent};padding:16px 20px;">
    <div style="font-size:10px;font-weight:700;color:${C.textLight};text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">${label}</div>
    <div style="font-size:2.2rem;font-weight:800;color:${C.text};line-height:1;">${value ?? '—'}</div>
    ${sublabelH}${deltaH}
  </div>`
}

function kpiGrid(cards, cols = 3) {
  if (!cards?.length) return ''
  return `<div style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:12px;margin-bottom:24px;">${cards.join('')}</div>`
}

function calloutBlock(text, color = C.sky) {
  if (!text?.trim()) return ''
  const bg = color === C.green ? '#f0fff4' : color === C.yellow ? '#fffff0' : color === C.red ? '#fff5f5' : '#ebf8ff'
  return `<div style="border-left:4px solid ${color};background:${bg};border-radius:0 8px 8px 0;padding:14px 18px;margin:16px 0;">
    <p style="margin:0;font-size:13.5px;line-height:1.7;color:${C.text};">${richText(text.trim())}</p>
  </div>`
}

function subTitle(text) {
  return `<div style="display:flex;align-items:center;gap:10px;margin:20px 0 12px;">
    <div style="width:4px;height:20px;background:${C.lime};border-radius:2px;flex-shrink:0;"></div>
    <span style="font-size:11px;font-weight:700;color:${C.textLight};text-transform:uppercase;letter-spacing:1.2px;">${text}</span>
  </div>`
}

function barH(items) {
  // Horizontal bar chart: [{label, value, color}]
  if (!items?.length) return ''
  const max = Math.max(...items.map(d => d.value ?? 0), 1)
  return `<div style="margin:12px 0;">${items.map(d => `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
      <span style="width:40px;font-size:12px;font-weight:700;color:${C.textLight};flex-shrink:0;">${d.label}</span>
      <div style="flex:1;background:${C.border};border-radius:999px;height:8px;overflow:hidden;">
        <div style="background:${d.color ?? C.sky};width:${Math.round((d.value / max) * 100)}%;height:100%;border-radius:999px;"></div>
      </div>
      <span style="width:36px;text-align:right;font-size:12px;font-weight:600;color:${C.text};flex-shrink:0;">${d.value} tickets</span>
    </div>`).join('')}</div>`
}

function resolBar(pct) {
  const color = pct >= 90 ? C.green : pct >= 70 ? C.yellow : C.red
  return `<div style="margin:16px 0;">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
      <span style="font-size:11px;font-weight:700;color:${C.textLight};text-transform:uppercase;letter-spacing:.5px;">Taxa de Resolução</span>
      <span style="font-size:14px;font-weight:800;color:${color};">${pct}%</span>
    </div>
    <div style="background:${C.border};border-radius:999px;height:10px;overflow:hidden;">
      <div style="background:${color};width:${Math.min(pct, 100)}%;height:100%;border-radius:999px;"></div>
    </div>
  </div>`
}

function barChartV(usageHistory, period) {
  // Aggregate by ref_month — clients with multiple instances generate N rows/month
  const agg = {}
  for (const u of usageHistory ?? []) {
    if (u.pending === true) continue          // skip incomplete current-month snapshots
    if (u.os_created == null) continue
    if (!agg[u.ref_month]) agg[u.ref_month] = { ref_month: u.ref_month, os_created: 0 }
    agg[u.ref_month].os_created += u.os_created
  }
  const sorted = Object.values(agg)
    .sort((a, b) => a.ref_month.localeCompare(b.ref_month))
    .slice(-12)
  if (!sorted.length) return ''

  const maxVal = Math.max(...sorted.map(u => u.os_created), 1)
  const svgW = 700
  const chartH = 140
  const topP = 24, botP = 26
  const svgH = chartH + topP + botP
  const n = sorted.length
  const barW = Math.floor((svgW - 40) / n * 0.62)
  const gap  = Math.floor((svgW - 40 - n * barW) / (n + 1))

  const bars = sorted.map((u, i) => {
    const x = 20 + gap + i * (barW + gap)
    const h = Math.max(2, Math.round((u.os_created / maxVal) * chartH))
    const y = topP + (chartH - h)
    const isCur = u.ref_month === period
    return `
      <rect x="${x}" y="${y}" width="${barW}" height="${h}" rx="3"
        fill="${isCur ? C.lime : C.sky}" opacity="${isCur ? 1 : 0.7}"/>
      <text x="${x + barW / 2}" y="${y - 5}" text-anchor="middle" font-size="10" font-weight="700"
        fill="${C.text}" font-family="sans-serif">${u.os_created}</text>
      <text x="${x + barW / 2}" y="${topP + chartH + 16}" text-anchor="middle" font-size="10"
        fill="${C.textLight}" font-family="sans-serif">${mShort(u.ref_month)}</text>`
  }).join('')

  return `<div style="margin-top:24px;">
    <div style="font-size:11px;font-weight:700;color:${C.textLight};text-transform:uppercase;letter-spacing:.8px;margin-bottom:10px;">O.S. Criadas — Histórico</div>
    <svg viewBox="0 0 ${svgW} ${svgH}" width="100%" style="display:block;overflow:visible;">${bars}</svg>
  </div>`
}

function barChartTipoOS(porTipoAtual, porTipoPrev, period) {
  if (!porTipoAtual || !Object.keys(porTipoAtual).length) return ''

  const CORES = {
    'Montagem': C.sky,
    'Desmontagem': '#94a3b8',
    'Assistência': C.lime,
  }
  const OUTRA_COR = '#cbd5e1'

  let tipos = Object.entries(porTipoAtual).filter(([, v]) => v > 0)
  if (!tipos.length) return ''

  // Top 9 + "Outros" (max 10 rows)
  tipos.sort(([, a], [, b]) => b - a)
  if (tipos.length > 10) {
    const top9 = tipos.slice(0, 9)
    const restSum = tipos.slice(9).reduce((s, [, v]) => s + v, 0)
    tipos = [...top9, ['Outros', restSum]]
  }

  const maxVal = Math.max(...tipos.map(([, v]) => v), 1)
  const periodLabelStr = periodLabel(period)

  const bars = tipos.map(([label, val]) => {
    const pct = Math.round((val / maxVal) * 100)
    const color = CORES[label.split(' ')[0]] || OUTRA_COR
    return `
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px;">
        <span style="min-width:140px;font-size:13px;color:${C.text};font-weight:500;">${label}</span>
        <div style="flex:1;background:${C.border};border-radius:999px;height:12px;overflow:hidden;">
          <div style="background:${color};width:${pct}%;height:100%;border-radius:999px;"></div>
        </div>
        <span style="min-width:60px;text-align:right;font-size:13px;font-weight:700;color:${C.text};">${val.toLocaleString('pt-BR')}</span>
      </div>`
  }).join('')

  return `<div style="margin-top:24px;">
    <div style="font-size:11px;font-weight:700;color:${C.textLight};text-transform:uppercase;letter-spacing:.8px;margin-bottom:14px;">Composição das OS — ${periodLabelStr}</div>
    ${bars}
  </div>`
}

function nextStepsList(items) {
  if (!items?.length) return `<p style="color:${C.textLight};font-style:italic;font-size:13px;">Nenhum próximo passo adicionado.</p>`
  const tagStyle = {
    'Donc':         { bg: '#ebf8ff', color: '#2b6cb0' },
    'Cliente':      { bg: '#f0fff4', color: '#276749' },
    'Conjunto':     { bg: '#faf5ff', color: '#553c9a' },
    'Oportunidade': { bg: '#fffbeb', color: '#92400e' },
    'A discutir':   { bg: '#fff7ed', color: '#9a3412' },
    'Em espera':    { bg: '#f1f5f9', color: '#475569' },
  }
  return `<div style="display:flex;flex-direction:column;gap:16px;">${items.map((item, i) => {
    const t = tagStyle[item.tag] ?? { bg: '#f7fafc', color: '#4a5568' }
    return `
    <div style="display:flex;gap:14px;align-items:flex-start;">
      <div style="width:30px;height:30px;border-radius:50%;background:${C.navy};color:#fff;font-size:13px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0;">${i + 1}</div>
      <div>
        <div style="font-size:14px;font-weight:700;color:${C.text};margin-bottom:3px;">${item.title || ''}</div>
        ${item.description ? `<div style="font-size:13px;color:${C.textLight};">${richText(item.description)}</div>` : ''}
        ${item.tag ? `<span style="display:inline-block;margin-top:5px;padding:2px 8px;border-radius:999px;background:${t.bg};color:${t.color};font-size:10px;font-weight:700;">${item.tag}</span>` : ''}
      </div>
    </div>`
  }).join('')}</div>`
}

function timelineList(items) {
  if (!items?.length) return `<p style="color:${C.textLight};font-style:italic;font-size:13px;">Nenhum destaque adicionado.</p>`
  return `<div style="display:flex;flex-direction:column;gap:20px;">${items.map(item => `
    <div style="display:flex;gap:14px;align-items:flex-start;">
      <div style="width:40px;height:40px;border-radius:50%;background:#f7fafc;border:2px solid ${C.border};display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0;">${item.emoji || '⭐'}</div>
      <div>
        <div style="font-size:14px;font-weight:700;color:${C.text};margin-bottom:3px;">${item.title || ''}</div>
        ${item.description ? `<div style="font-size:13px;color:${C.textLight};line-height:1.6;">${richText(item.description)}</div>` : ''}
      </div>
    </div>`).join('')}</div>`
}

function extrasRow(extras) {
  if (!extras?.length) return ''
  const cols = Math.min(extras.length, 4)
  return kpiGrid(extras.map(e => kpiCard({
    label: e.label, value: e.value, sublabel: e.sublabel,
    delta: e.delta, deltaType: e.deltaType, accentColor: e.accentColor ?? 'sky',
    highlighted: e.highlighted ?? false,
    deltaColor: e.deltaColor,
  })), cols)
}

// ── Helpers para field registry ───────────────────────────────

function slideData(period, usageHistory, operationalData, supportRaw) {
  const [y, m] = period.split('-').map(Number)
  const prevDt = new Date(y, m - 2, 1)
  return {
    usage: usageHistory ?? [],
    sup: supportRaw ?? null,
    opCurrent: operationalData?.current ?? null,
    opPrev: operationalData?.prev ?? null,
    period,
    prevPeriod: `${prevDt.getFullYear()}-${String(prevDt.getMonth() + 1).padStart(2, '0')}`,
  }
}

/**
 * Renderiza KPI cards para fields enabled (não-chart) de uma seção.
 * Cada field que não seja chart e esteja enabled vira um kpiCard.
 * Deltas são fields independentes com chave `delta_{key}`.
 */
function renderFieldCards(sec, type, data, accentMap = {}) {
  const fields = getSectionFields(type)
  const uf = sec.content?.fields ?? {}
  const cards = []

  for (const f of fields) {
    if (f.type === 'chart' || f.type === 'delta') continue
    if (uf[f.key]?.enabled === false) continue

    const fopts = uf[f.key] ?? {}
    const override = fopts.override
    const value = override ?? resolveField(type, f.key, data)
    if (value == null) continue

    const label = fopts.label || f.label
    const accentColor = fopts.accentColor || accentMap[f.key] || accentMap._ || 'sky'

    // Delta
    let deltaStr = null
    let deltaType = 'neutral'
    let deltaColor = 'gray'

    if (fopts.deltaEnabled !== false) {
      const deltaKey = `delta_${f.key}`
      const deltaField = fields.find(df => df.key === deltaKey)
      if (deltaField) {
        const dopts = uf[deltaKey] ?? {}
        if (dopts.enabled !== false) {
          const deltaOverride = dopts.override
          const deltaRaw = deltaOverride ?? resolveField(type, deltaKey, data)
          if (deltaRaw != null) {
            deltaStr = dopts.deltaText || formatFieldValue(deltaField, deltaRaw)
            deltaType = fopts.deltaType || (deltaRaw > 0 ? 'up' : deltaRaw < 0 ? 'down' : 'neutral')
            deltaColor = fopts.deltaColor || (deltaType === 'up' ? 'red' : deltaType === 'down' ? 'green' : 'gray')
          }
        }
      }
    }

    cards.push(kpiCard({
      label,
      value: formatFieldValue(f, value),
      sublabel: undefined,
      delta: deltaStr,
      deltaType,
      deltaColor,
      accentColor,
    }))
  }

  return cards
}

// ── Slide wrapper ─────────────────────────────────────────────
function slide(icon, title, body, clientName, period, pageNum, subtitle) {
  return `
  <div class="slide" style="background:${C.bg};border-radius:12px;box-shadow:0 2px 12px rgba(0,0,0,0.07);overflow:hidden;margin-bottom:24px;break-inside:avoid;page-break-inside:avoid;">
    <div style="background:${C.navyDeep};padding:14px 32px;display:flex;align-items:center;gap:12px;">
      <span style="font-size:18px;">${icon}</span>
      <div style="flex:1;">
        <h2 style="margin:0;font-size:15px;font-weight:800;color:#fff;text-transform:uppercase;letter-spacing:1px;">${title}</h2>
        ${subtitle ? `<div style="font-size:11px;font-weight:400;color:rgba(255,255,255,0.55);margin-top:3px;letter-spacing:.3px;">${subtitle}</div>` : ''}
      </div>
    </div>
    <div style="padding:28px 32px 24px;">${body}</div>
    <div style="padding:9px 32px;border-top:1px solid ${C.border};display:flex;justify-content:space-between;align-items:center;">
      <span style="font-size:11px;color:${C.textLight};">${clientName}</span>
      <span style="font-size:11px;color:${C.textLight};">Página ${pageNum}</span>
      <span style="font-size:11px;color:${C.textLight};">${periodLabel(period)}</span>
    </div>
  </div>`
}

// ── Slide: Capa (sempre incluída) ─────────────────────────────
function slideCapa(client, report, csm, capaContent) {
  const clientName = client?.fantasy_name || client?.name || '—'
  const logoUrl    = client?.logo_url || null
  const csmName    = csm?.name  || '—'
  const csmEmail   = csm?.email || ''
  const per        = periodLabel(report?.period)
  const subtitle   = capaContent?.subtitle ?? ''
  const clientTeam = capaContent?.clientTeam ?? []

  const avatar = logoUrl
    ? `<img src="${logoUrl}" alt="${clientName}" style="width:80px;height:80px;border-radius:50%;object-fit:cover;border:3px solid rgba(255,255,255,0.25);" />`
    : `<div style="width:80px;height:80px;border-radius:50%;background:rgba(255,255,255,0.15);border:3px solid rgba(255,255,255,0.2);display:flex;align-items:center;justify-content:center;font-size:32px;font-weight:800;color:#fff;">${clientName.charAt(0).toUpperCase()}</div>`

  const teamCard = clientTeam.length ? `
    <div style="display:flex;align-items:flex-start;gap:14px;background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.14);border-radius:10px;padding:12px 18px;">
      <div style="width:36px;height:36px;border-radius:50%;background:${C.sky};flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:15px;color:${C.navyDeep};margin-top:1px;">👥</div>
      <div>
        <div style="font-size:10px;color:${C.sky};text-transform:uppercase;letter-spacing:.8px;margin-bottom:8px;font-weight:700;">Equipe do Cliente</div>
        ${clientTeam.map(tc => `
          <div style="margin-bottom:6px;">
            <div style="font-size:13px;font-weight:700;color:#fff;">${tc.name || '—'}</div>
            ${tc.email ? `<div style="font-size:11px;color:rgba(255,255,255,0.55);margin-top:1px;">${tc.email}</div>` : ''}
          </div>`).join('')}
      </div>
    </div>` : ''

  return `
  <div class="slide cover-slide" style="background:${C.navyDeep};border-radius:12px;padding:44px 40px 40px;margin-bottom:24px;position:relative;overflow:hidden;break-inside:avoid;page-break-inside:avoid;min-height:280px;">
    <div style="position:absolute;top:-80px;right:-80px;width:320px;height:320px;border-radius:50%;background:${C.sky};opacity:0.05;pointer-events:none;"></div>
    <div style="position:absolute;bottom:-100px;left:-60px;width:300px;height:300px;border-radius:50%;background:${C.lime};opacity:0.05;pointer-events:none;"></div>

    <div style="position:relative;z-index:1;">
      <div style="display:inline-flex;align-items:center;gap:6px;background:${C.lime};color:${C.navyDeep};font-size:10px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;padding:4px 12px;border-radius:999px;margin-bottom:24px;">
        📋 Relatório de Análise Mensal
      </div>

      <!-- Nome e período -->
      <div style="display:flex;align-items:center;gap:20px;margin-bottom:${clientTeam.length ? '28px' : '20px'};">
        ${avatar}
        <div>
          <h1 style="margin:0;font-size:2rem;font-weight:800;color:#fff;line-height:1.2;">${clientName}</h1>
          <div style="font-size:1.05rem;font-weight:600;color:${C.sky};margin-top:6px;">${per}</div>
          ${subtitle ? `<div style="font-size:13px;font-weight:400;color:${C.sky};margin-top:4px;opacity:0.85;">${subtitle}</div>` : ''}
        </div>
      </div>

      <!-- Cards: CSM + equipe — coluna à direita abaixo do nome -->
      <div style="display:flex;flex-direction:column;gap:12px;align-items:flex-end;">
        <div style="display:flex;align-items:center;gap:14px;background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.14);border-radius:10px;padding:12px 18px;">
          <div style="width:36px;height:36px;border-radius:50%;background:${C.lime};flex-shrink:0;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:15px;color:${C.navyDeep};">${csmName.charAt(0).toUpperCase()}</div>
          <div>
            <div style="font-size:10px;color:${C.sky};text-transform:uppercase;letter-spacing:.8px;margin-bottom:2px;font-weight:700;">CSM Responsável</div>
            <div style="font-size:13px;font-weight:700;color:#fff;">${csmName}</div>
            ${csmEmail ? `<div style="font-size:11px;color:rgba(255,255,255,0.55);">${csmEmail}</div>` : ''}
          </div>
        </div>
        ${teamCard}
      </div>
    </div>
  </div>`
}

// ── Slides de seções ──────────────────────────────────────────

function slideEscala(sec, usageHistory, period, clientName, p, operationalData = null) {
  const data = slideData(period, usageHistory, operationalData, null)
  const uf = sec.content?.fields ?? {}

  // KPI cards via field registry
  const autoCards = renderFieldCards(sec, 'escala', data, {
    os_criadas: 'lime',
    usuarios_ativos: 'sky',
    produtos_montados: 'navy',
    valor_total_notas: 'green',
    taxa_sucesso_geral: 'green',
    _: 'sky',
  })
  const allCards = [...autoCards, ...(sec.extras ?? []).map(e =>
    kpiCard({ label: e.label, value: e.value, sublabel: e.sublabel, delta: e.delta, deltaType: e.deltaType, accentColor: e.accentColor ?? 'sky', highlighted: e.highlighted ?? false, deltaColor: e.deltaColor }))]

  // Charts via field registry toggles
  const showTipoChart = uf.grafico_por_tipo?.enabled !== false
  const rawPorTipo = data.opCurrent?.data_os?.sumario?.por_tipo
  const porTipo = rawPorTipo && typeof Object.values(rawPorTipo)[0] === 'object'
    ? Object.fromEntries(Object.entries(rawPorTipo).map(([k, v]) => [k, v.total_os ?? 0]))
    : rawPorTipo
  const tipoChart = showTipoChart
    ? barChartTipoOS(porTipo, undefined, period)
    : ''

  const showHistorico = uf.grafico_historico?.enabled !== false
  const historicoChart = showHistorico ? barChartV(data.usage, period) : ''

  const body = `
    ${allCards.length ? kpiGrid(allCards, Math.min(Math.max(allCards.length, 2), 4)) : ''}
    ${tipoChart}
    ${calloutBlock(sec.content?.callout, C.sky)}
    ${historicoChart}`

  return slide('📈', 'Escala da Operação', body, clientName, period, p, sec.subtitle)
}

function slideSuporte(sec, supportRaw, clientName, period, p) {
  const data = slideData(period, [], null, supportRaw)
  const uf = sec.content?.fields ?? {}

  const autoCards = renderFieldCards(sec, 'suporte', data, {
    tickets_abertos: 'navy',
    tickets_resolvidos: 'green',
    sla_primeira_resposta: 'sky',
    taxa_resolucao: 'lime',
    _: 'sky',
  })
  const allCards = [...autoCards, ...(sec.extras ?? []).map(e =>
    kpiCard({ label: e.label, value: e.value, sublabel: e.sublabel, delta: e.delta, deltaType: e.deltaType, accentColor: e.accentColor ?? 'sky', highlighted: e.highlighted ?? false, deltaColor: e.deltaColor }))]

  // Taxa de resolução bar (if field enabled)
  const taxaField = getSectionFields('suporte').find(f => f.key === 'taxa_resolucao')
  const taxaEnabled = uf.taxa_resolucao?.enabled !== false
  const taxaOverride = uf.taxa_resolucao?.override
  const taxaVal = taxaOverride ?? resolveField('suporte', 'taxa_resolucao', data)
  const resolBarHtml = taxaEnabled && taxaVal != null ? resolBar(taxaVal) : ''

  // N1/N2/N3 breakdown (individual field toggles)
  const n1 = uf.n1_pct?.enabled !== false ? (uf.n1_pct?.override ?? resolveField('suporte', 'n1_pct', data)) : null
  const n2 = uf.n2_pct?.enabled !== false ? (uf.n2_pct?.override ?? resolveField('suporte', 'n2_pct', data)) : null
  const n3 = uf.n3_pct?.enabled !== false ? (uf.n3_pct?.override ?? resolveField('suporte', 'n3_pct', data)) : null
  const n1n2n3 = [
    n1 != null ? { label: 'N1', value: n1, color: C.green  } : null,
    n2 != null ? { label: 'N2', value: n2, color: C.yellow } : null,
    n3 != null ? { label: 'N3', value: n3, color: C.red    } : null,
  ].filter(Boolean)

  const body = `
    ${allCards.length ? kpiGrid(allCards, Math.min(allCards.length, 4)) : ''}
    ${resolBarHtml}
    ${n1n2n3.length ? subTitle('Breakdown por Nível') + barH(n1n2n3) : ''}
    ${calloutBlock(sec.content?.callout, C.navy)}`

  return slide('🎫', 'Suporte', body, clientName, period, p, sec.subtitle)
}

function slideProjetos(sec, projects, clientName, period, p) {
  const ativos = (projects ?? []).filter(pr => pr.status !== 'concluido' && pr.status !== 'suspenso')

  const projList = ativos.length === 0
    ? `<p style="color:${C.textLight};font-style:italic;font-size:13px;">Nenhum projeto ativo no momento.</p>`
    : ativos.map(pr => {
        const ms   = pr.milestones ?? []
        const done = ms.filter(m => m.status === 'done').length
        const pct  = ms.length ? Math.round((done / ms.length) * 100) : null
        const sc   = pr.status === 'active' ? C.green : C.yellow
        return `
        <div style="background:${C.card};border-radius:8px;border:1px solid ${C.border};padding:14px 18px;margin-bottom:10px;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
            <span style="font-size:14px;font-weight:700;color:${C.text};">${pr.title}</span>
            <span style="padding:2px 8px;border-radius:999px;background:${sc}20;color:${sc};font-size:10px;font-weight:700;text-transform:uppercase;">${pr.status}</span>
          </div>
          ${pct !== null ? `
          <div style="display:flex;align-items:center;gap:10px;">
            <div style="flex:1;background:${C.border};border-radius:999px;height:6px;overflow:hidden;">
              <div style="background:${C.navy};width:${pct}%;height:100%;border-radius:999px;"></div>
            </div>
            <span style="font-size:11px;font-weight:700;color:${C.textLight};flex-shrink:0;">${done}/${ms.length} (${pct}%)</span>
          </div>` : ''}
          ${pr.end_date ? `<div style="font-size:11px;color:${C.textLight};margin-top:5px;">Prazo: ${new Date(pr.end_date + 'T00:00:00').toLocaleDateString('pt-BR')}</div>` : ''}
        </div>`
      }).join('')

  const body = `
    ${(sec.extras ?? []).length ? extrasRow(sec.extras) : ''}
    ${subTitle('Projetos Ativos')}
    ${projList}
    ${calloutBlock(sec.content?.callout, '#6366f1')}`

  return slide('🗂️', 'Projetos', body, clientName, period, p, sec.subtitle)
}

function slideHealthScore(sec, healthData, clientName, period, p) {
  if (!healthData?.health_total == null && !healthData) {
    return slide('💚', 'Health Score',
      `<p style="color:${C.textLight};font-style:italic;">Dados de Health Score não disponíveis.</p>`,
      clientName, period, p, sec.subtitle)
  }

  const hs = healthData ?? {}
  const total  = hs.health_total ?? null
  const status = total === null ? { label: 'Sem dados', color: C.textLight }
    : total >= 75 ? { label: 'Saudável', color: C.green }
    : total >= 50 ? { label: 'Atenção',  color: C.yellow }
    : { label: 'Risco', color: C.red }

  const dims = [
    { label: 'Uso',            key: 'health_uso',            color: C.sky    },
    { label: 'Suporte',        key: 'health_suporte',        color: '#6366f1' },
    { label: 'Relacionamento', key: 'health_relacionamento', color: C.yellow },
    { label: 'Financeiro',     key: 'health_financeiro',     color: C.green  },
    { label: 'Projeto',        key: 'health_projeto',        color: '#ec4899' },
  ]

  const scoreBox = total !== null ? `
  <div style="background:${C.navyDeep};border-radius:12px;padding:28px 32px;display:flex;align-items:center;gap:32px;margin-bottom:24px;">
    <div style="text-align:center;flex-shrink:0;">
      <div style="font-size:5rem;font-weight:800;color:${C.lime};line-height:1;">${total}</div>
      <div style="font-size:14px;font-weight:700;color:${status.color};margin-top:4px;">${status.label}</div>
      <div style="font-size:11px;color:rgba(255,255,255,0.4);margin-top:2px;">/ 100</div>
    </div>
    <div style="flex:1;">
      ${dims.map(d => {
        const val = hs[d.key] ?? null
        const pct = val !== null ? Math.min(val * 5, 100) : 0
        return `
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
          <span style="width:110px;font-size:12px;color:rgba(255,255,255,0.7);">${d.label}</span>
          <div style="flex:1;background:rgba(255,255,255,0.1);border-radius:999px;height:6px;overflow:hidden;">
            <div style="background:${d.color};width:${pct}%;height:100%;border-radius:999px;"></div>
          </div>
          <span style="width:40px;text-align:right;font-size:12px;font-weight:700;color:#fff;">${val !== null ? val + '/20' : '—'}</span>
        </div>`
      }).join('')}
    </div>
  </div>` : `<p style="color:${C.textLight};font-style:italic;margin-bottom:20px;">Dados de health score não disponíveis.</p>`

  return slide('💚', 'Health Score',
    scoreBox + calloutBlock(sec.content?.callout, C.sky),
    clientName, period, p, sec.subtitle)
}

function slideDestaques(sec, clientName, period, p) {
  const body = `
    ${timelineList(sec.content?.items ?? [])}
    ${calloutBlock(sec.content?.callout, C.yellow)}`
  return slide('⭐', 'Destaques do Período', body, clientName, period, p, sec.subtitle)
}

function slideContexto(sec, clientName, period, p) {
  const text  = sec.content?.text ?? ''
  const body = `
    ${(sec.extras ?? []).length ? extrasRow(sec.extras) : ''}
    ${text ? `<div style="line-height:1.7;color:${C.text};font-size:14px;">${richText(text)}</div>` : `<p style="color:${C.textLight};font-style:italic;">Nenhum contexto adicionado.</p>`}`
  return slide('🌐', 'Contexto Externo', body, clientName, period, p, sec.subtitle)
}

function slideIndicadoresOperacionais(sec, operationalData, clientName, period, p) {
  const data = slideData(period, [], operationalData, null)
  const autoCards = renderFieldCards(sec, 'indicadores_operacionais', data, {
    tempo_execucao: 'sky',
    tempo_atendimento: 'lime',
    tempo_transito: 'lime',
    _: 'sky',
  })
  const allCards = [...autoCards, ...(sec.extras ?? []).map(e =>
    kpiCard({ label: e.label, value: e.value, sublabel: e.sublabel, delta: e.delta, deltaType: e.deltaType, accentColor: e.accentColor ?? 'sky', highlighted: e.highlighted ?? false, deltaColor: e.deltaColor })
  )]

  const body = `
    ${allCards.length ? kpiGrid(allCards, Math.min(Math.max(allCards.length, 1), 3)) : `<p style="color:${C.textLight};font-style:italic;font-size:13px;">Nenhum dado operacional disponível para este período.</p>`}
    ${calloutBlock(sec.content?.callout ?? '', C.sky)}`

  return slide('⏱️', 'Indicadores Operacionais', body, clientName, period, p, sec.subtitle)
}

function slideQualidadeOperacao(sec, operationalData, clientName, period, p) {
  const data = slideData(period, [], operationalData, null)
  const uf = sec.content?.fields ?? {}

  const autoCards = renderFieldCards(sec, 'qualidade_operacao', data, {
    taxa_sucesso: 'green',
    total_sucesso: 'green',
    relatos_imprevistos: 'red',
    pontualidade: 'yellow',
    no_prazo: 'green',
    atrasadas: 'red',
    atraso_medio_dias: 'yellow',
    atrasadas_nao_concluidas: 'red',
    os_sem_inicio: 'yellow',
    os_pedido_peca: 'yellow',
    nao_liberadas: 'yellow',
    liberada_nao_iniciada: 'yellow',
    _: 'sky',
  })
  const allCards = [...autoCards, ...(sec.extras ?? []).map(e =>
    kpiCard({ label: e.label, value: e.value, sublabel: e.sublabel, delta: e.delta, deltaType: e.deltaType, accentColor: e.accentColor ?? 'sky', highlighted: e.highlighted ?? false, deltaColor: e.deltaColor })
  )]

  const totalOs = data.opCurrent?.data_os?.sumario?.total_os
  const mesLabel = periodLabel(period)
  const dynamicSubtitle = totalOs != null
    ? `Das ${totalOs.toLocaleString('pt-BR')} OS criadas em ${mesLabel}, mapeamos as seguintes ocorrências por categoria.`
    : ''
  const subtitle = sec.subtitle || dynamicSubtitle

  const body = `
    ${allCards.length ? kpiGrid(allCards, Math.min(Math.max(allCards.length, 1), 3)) : `<p style="color:${C.textLight};font-style:italic;font-size:13px;">Nenhum dado de qualidade disponível para este período.</p>`}
    ${calloutBlock(sec.content?.callout ?? '', C.green)}`

  return slide('✅', 'Qualidade da Operação', body, clientName, period, p, subtitle)
}

function slideCategoriasOcorrencia(sec, operationalData, clientName, period, p) {
  const data = slideData(period, [], operationalData, null)
  const uf = sec.content?.fields ?? {}

  const truncate = (str, max = 40) =>
    str.length > max ? str.slice(0, max) + '...' : str

  function renderBarras(items, cor) {
    if (!items.length) return ''
    const maxVal = Math.max(...items.map(m => m.total), 1)
    const labelKey = items[0].motivo != null ? 'motivo' : 'tipo'
    return `<div style="margin:12px 0;">${items.map(m => {
      const pct = Math.round((m.total / maxVal) * 100)
      const label = m[labelKey] || ''
      return `
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:10px;">
        <span style="min-width:200px;font-size:13px;color:${C.text};font-weight:500;" title="${label}">${truncate(label)}</span>
        <div style="flex:1;background:${C.border};border-radius:999px;height:10px;overflow:hidden;">
          <div style="background:${cor};width:${pct}%;height:100%;border-radius:999px;"></div>
        </div>
        <span style="min-width:50px;text-align:right;font-size:13px;font-weight:700;color:${C.text};">${m.total.toLocaleString('pt-BR')}</span>
      </div>`
    }).join('')}</div>`
  }

  const mesLabel = periodLabel(period)

  // categorias_ocorrencias (from new parser, has tipo/total)
  const showOcorrencias = uf.categorias_ocorrencias?.enabled !== false
  const rawCategorias = showOcorrencias
    ? (resolveField('categorias_ocorrencia', 'categorias_ocorrencias', data) ?? [])
    : []
  const catComTotal = rawCategorias.filter(m => m.total > 0)
  const topCategorias = catComTotal.slice(0, 5)
  const ocorrenciasHTML = topCategorias.length
    ? subTitle('Ocorrências') + renderBarras(topCategorias, C.sky)
    : ''

  // motivos_cancelamento
  const showCancel = uf.motivos_cancelamento?.enabled !== false
  const rawCancel = showCancel
    ? (resolveField('categorias_ocorrencia', 'motivos_cancelamento', data) ?? [])
    : []
  const cancelComTotal = rawCancel.filter(m => m.total > 0)
  const topCancel = cancelComTotal.slice(0, 3)
  const cancelamentosHTML = topCancel.length
    ? subTitle('Cancelamentos') + renderBarras(topCancel, C.red)
    : ''

  // sub_status_breakdown (new parser)
  const showSubStatus = uf.sub_status_breakdown?.enabled !== false
  const subStatus = showSubStatus
    ? resolveField('categorias_ocorrencia', 'sub_status_breakdown', data)
    : null
  let subStatusHTML = ''
  if (subStatus) {
    const statusLabels = { sucesso: 'Sucesso', ocorrencia: 'Ocorrência', cancelado: 'Cancelado', liberada_nao_iniciada: 'Liberada não Iniciada', nao_liberada: 'Não Liberada', iniciada_nao_concluida: 'Iniciada não Concluída', outros: 'Outros' }
    const items = Object.entries(subStatus).map(([k, v]) => {
      const total = typeof v === 'number' ? v : v.total
      return { label: statusLabels[k] || k, value: total, color: k === 'sucesso' ? C.green : k === 'ocorrencia' ? C.yellow : k === 'cancelado' ? C.red : C.textLight }
    }).filter(i => i.value > 0)
    if (items.length) {
      subStatusHTML = subTitle('Distribuição por Status') + renderBarras(
        items.map(i => ({ motivo: i.label, total: i.value })),
        C.sky
      )
    }
  }

  const hasData = topCategorias.length || topCancel.length || subStatus
  const footerNote = catComTotal.length
    ? `<div style="font-size:11px;color:${C.textLight};font-style:italic;margin-top:8px;">Ocorrências registradas pelos profissionais através do App Donc.</div>`
    : ''

  const parts = []
  if (catComTotal.length) parts.push(`${catComTotal.reduce((s, m) => s + m.total, 0)} ocorrências`)
  if (cancelComTotal.length) parts.push(`${cancelComTotal.reduce((s, m) => s + m.total, 0)} cancelamentos`)
  const dynamicSubtitle = parts.length ? parts.join(' · ') + ` em ${mesLabel}` : ''
  const subtitle = sec.subtitle || dynamicSubtitle

  const body = `
    ${!hasData ? `<p style="color:${C.textLight};font-style:italic;font-size:13px;">Nenhum dado disponível para este período.</p>` : ''}
    ${ocorrenciasHTML}
    ${cancelamentosHTML}
    ${subStatusHTML}
    ${footerNote}
    ${calloutBlock(sec.content?.callout ?? '', C.yellow)}`

  return slide('⚠️', 'Categorias de Ocorrência', body, clientName, period, p, subtitle)
}

function slideDesempenhoOperacional(sec, operationalData, clientName, period, p) {
  const data = slideData(period, [], operationalData, null)
  const uf = sec.content?.fields ?? {}

  const ranking = data.opCurrent?.data_os?.operacional?.ranking_profissionais || []

  const autoCards = renderFieldCards(sec, 'desempenho_operacional', data, {
    total_profissionais: 'sky',
    indice_produtividade: 'lime',
    total_dias_trabalhados: 'navy',
    _: 'sky',
  })

  // Ranking table (chart type, controlled by its own toggle)
  const showRanking = uf.ranking_profissionais?.enabled !== false
  const showProdutos = uf.produtos_mais_frequentes?.enabled !== false

  const normalize = (str) =>
    (str || '').replace(/\b\w/g, c => c.toUpperCase()).replace(/\s+/g, ' ').trim()

  const ranked = ranking.map(p => {
    const sucesso = p.finalizadas_sucesso || 0
    const indice = p.total_os > 0 ? Math.round((sucesso / p.total_os) * 100) : 0
    return { ...p, sucesso, indice }
  })

  const top5 = ranked.filter(p => p.indice > 0)
    .sort((a, b) => b.indice - a.indice || b.total_os - a.total_os)
    .slice(0, 5)

  const worst5 = ranked.filter(p => p.total_os >= 3)
    .sort((a, b) => a.indice - b.indice || b.total_os - a.total_os)
    .slice(0, 5)

  const tableRow = (p, isWorst) => {
    const baixo = isWorst && p.indice < 70 && p.indice > 0
    const destaque = !isWorst && p.indice >= 90
    return `
    <tr style="border-bottom:1px solid ${C.border};${isWorst ? `background:#fef2f2;` : ''}">
      <td style="padding:8px 6px 8px 0;font-size:13px;font-weight:600;color:${isWorst ? C.red : C.text};">${normalize(p.profissional || p.parceiro)}</td>
      <td style="padding:8px 6px;text-align:center;font-size:12px;font-weight:700;color:${C.text};">${p.total_os}</td>
      <td style="padding:8px 6px;text-align:center;font-size:13px;font-weight:700;color:${baixo ? C.red : destaque ? C.green : isWorst ? C.red : C.text};">
        ${p.indice}%
        ${destaque ? `<span style="display:inline-block;margin-left:4px;padding:1px 6px;border-radius:999px;background:#f0fff4;color:#276749;font-size:9px;font-weight:700;">Destaque</span>` : ''}
        ${baixo ? `<span style="display:inline-block;margin-left:4px;padding:1px 6px;border-radius:999px;background:#fff5f5;color:#9b2c2c;font-size:9px;font-weight:700;">Atenção</span>` : ''}
      </td>
    </tr>`
  }

  const tableSection = (title, list, isWorst) => `
    <div style="margin-top:16px;">
      <div style="font-size:12px;font-weight:700;color:${isWorst ? C.red : C.green};margin-bottom:8px;">
        ${isWorst ? '⚠️' : '⭐'} ${title}
      </div>
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="border-bottom:2px solid ${C.border};">
            <th style="text-align:left;padding:6px 6px 6px 0;font-size:10px;font-weight:700;color:${C.textLight};text-transform:uppercase;">Profissional</th>
            <th style="text-align:center;padding:6px;font-size:10px;font-weight:700;color:${C.textLight};text-transform:uppercase;">OS</th>
            <th style="text-align:center;padding:6px;font-size:10px;font-weight:700;color:${C.textLight};text-transform:uppercase;">Sucesso</th>
          </tr>
        </thead>
        <tbody>${list.map(p => tableRow(p, isWorst)).join('')}</tbody>
      </table>
      <div style="font-size:10px;font-style:italic;color:${C.textLight};margin-top:4px;">
        ${isWorst
          ? 'Classificado por menor taxa de sucesso entre profissionais com ≥3 OS realizadas.'
          : 'Classificado por maior taxa de sucesso entre profissionais com OS no período.'}
      </div>
    </div>`

  // Produtos mais frequentes
  const produtos = showProdutos
    ? resolveField('desempenho_operacional', 'produtos_mais_frequentes', data) ?? []
    : []
  const topProdutos = produtos.slice(0, 5)
  const produtosHTML = topProdutos.length
    ? subTitle('Produtos Mais Frequentes') + topProdutos.map(p => {
        const val = p.quantidade ?? p.total ?? 0
        return `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid ${C.border};font-size:13px;">
          <span style="color:${C.text};">${p.produto || p.nome || p.descricao || p.tipo || '—'}</span>
          <span style="font-weight:700;color:${C.textLight};">${val.toLocaleString('pt-BR')}</span>
        </div>`
      }).join('')
    : ''

  const noData = showRanking && !top5.length && !worst5.length && !topProdutos.length
  if (noData && !autoCards.length) {
    const body = `<p style="color:${C.textLight};font-style:italic;font-size:13px;">Nenhum dado de desempenho disponível para este período.</p>`
    return slide('📊', 'Desempenho Operacional', body, clientName, period, p, sec.subtitle)
  }

  const body = `
    ${autoCards.length ? kpiGrid(autoCards, Math.min(autoCards.length, 3)) : ''}
    ${showRanking && top5.length ? tableSection('Melhores Desempenhos', top5, false) : ''}
    ${showRanking && worst5.length ? tableSection('Precisam de Atenção', worst5, true) : ''}
    ${produtosHTML}
    ${calloutBlock(sec.content?.callout ?? '', C.sky)}`

  return slide('📊', 'Desempenho Operacional', body, clientName, period, p, sec.subtitle)
}

function slideProximosPassos(sec, clientName, period, p) {
  return slide('🎯', 'Próximos Passos',
    nextStepsList(sec.content?.items ?? []),
    clientName, period, p, sec.subtitle)
}

function slideCustomText(sec, clientName, period, p) {
  const text = sec.content?.text ?? ''
  const body = `${text ? `<div style="line-height:1.7;color:${C.text};font-size:14px;">${richText(text)}</div>` : ''}${calloutBlock(sec.content?.callout, C.sky)}`
  return slide('📄', sec.title || 'Seção', body, clientName, period, p, sec.subtitle)
}

function slideCustomImage(sec, clientName, period, p) {
  const url     = sec.content?.imageUrl ?? ''
  const caption = sec.content?.caption  ?? ''
  const body = url
    ? `<div style="text-align:center;">
        <img src="${url}" alt="${sec.title}" style="max-width:100%;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.08);" />
        ${caption ? `<p style="font-size:12px;color:${C.textLight};margin-top:10px;">${caption}</p>` : ''}
       </div>`
    : `<p style="color:${C.textLight};font-style:italic;">Nenhuma imagem adicionada.</p>`
  return slide('🖼️', sec.title || 'Imagem', body, clientName, period, p, sec.subtitle)
}

function slideCustomMetrics(sec, clientName, period, p) {
  const extras = sec.extras ?? []
  const body = `
    ${extras.length ? extrasRow(extras) : `<p style="color:${C.textLight};font-style:italic;">Nenhuma métrica adicionada.</p>`}
    ${calloutBlock(sec.content?.callout, C.sky)}`
  return slide('📊', sec.title || 'Métricas', body, clientName, period, p, sec.subtitle)
}

function slideCustomBars(sec, clientName, period, p) {
  const items = sec.content?.items ?? []
  const maxVal = Math.max(...items.map(i => Number(i.value) || 0), 1)
  const total = items.reduce((s, i) => s + (Number(i.value) || 0), 0)
  const colorMap = {
    navy: C.navy, sky: C.sky, lime: C.lime,
    green: C.green, yellow: C.yellow, red: C.red,
  }
  const barsHTML = items.length
    ? items.map(item => {
        const pct = Math.round(((Number(item.value) || 0) / maxVal) * 100)
        const color = colorMap[item.color] ?? C.sky
        return `
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:10px;">
          <span style="min-width:280px;font-size:13px;color:${C.text};font-weight:500;">${item.label || ''}</span>
          <div style="flex:1;background:${C.border};border-radius:999px;height:10px;overflow:hidden;">
            <div style="background:${color};width:${pct}%;height:100%;border-radius:999px;"></div>
          </div>
          <span style="min-width:40px;text-align:right;font-size:13px;font-weight:700;color:${C.text};">${item.value ?? ''}</span>
        </div>`
      }).join('')
    : `<p style="color:${C.textLight};font-style:italic;">Nenhuma categoria adicionada.</p>`

  const headerBadge = items.length
    ? ` <span style="background:${C.sky};color:#fff;border-radius:999px;padding:2px 8px;font-size:10px;font-weight:700;margin-left:8px;">${items.length} categorias · Total: ${total}</span>`
    : ''

  const body = `
    ${barsHTML}
    ${calloutBlock(sec.content?.callout, C.sky)}`

  return slide('📊', (sec.title || 'Categorias') + headerBadge, body, clientName, period, p, sec.subtitle)
}

// ── EXPORT PRINCIPAL ──────────────────────────────────────────
/**
 * @param {object} client
 * @param {object} report — { title, period, sections[] }
 * @param {object|null} csm
 * @param {object} extraData — { usageHistory, supportRaw, healthData, projects, operationalData }
 */
export function generateReportHTML(client, report, csm, extraData = {}) {
  const { sections: rawSecs = [], period = '', title = 'Relatório Mensal' } = report || {}
  const { usageHistory = [], supportRaw = null, healthData = null, projects = [], operationalData = null } = extraData

  const sections   = normalizeSections(rawSecs)
  const clientName = client?.fantasy_name || client?.name || '—'
  const genDate    = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })

  // Ler seção capa do array de sections
  const capaSection = sections.find(s => s.type === 'capa')
  const capaContent = capaSection?.content ?? { subtitle: '', clientTeam: [] }

  const capa = slideCapa(client, report, csm, capaContent)

  let pageNum = 2
  const slidesHTML = sections
    .filter(s => s.type !== 'capa' && s.enabled !== false)
    .map(s => {
      const p = pageNum++
      if (s.type === 'escala')          return slideEscala(s, usageHistory, period, clientName, p, operationalData)
      if (s.type === 'suporte')         return slideSuporte(s, supportRaw, clientName, period, p)
      if (s.type === 'projetos')        return slideProjetos(s, projects, clientName, period, p)
      if (s.type === 'health_score')    return slideHealthScore(s, healthData, clientName, period, p)
      if (s.type === 'destaques')       return slideDestaques(s, clientName, period, p)
      if (s.type === 'contexto')        return slideContexto(s, clientName, period, p)
      if (s.type === 'proximos_passos') return slideProximosPassos(s, clientName, period, p)
      if (s.type === 'indicadores_operacionais') return slideIndicadoresOperacionais(s, operationalData, clientName, period, p)
      if (s.type === 'qualidade_operacao') return slideQualidadeOperacao(s, operationalData, clientName, period, p)
      if (s.type === 'categorias_ocorrencia') return slideCategoriasOcorrencia(s, operationalData, clientName, period, p)
      if (s.type === 'desempenho_operacional') return slideDesempenhoOperacional(s, operationalData, clientName, period, p)
      if (s.type === 'custom-text')     return slideCustomText(s, clientName, period, p)
      if (s.type === 'custom-image')    return slideCustomImage(s, clientName, period, p)
      if (s.type === 'custom-metrics')  return slideCustomMetrics(s, clientName, period, p)
      if (s.type === 'custom-bars')     return slideCustomBars(s, clientName, period, p)
      return ''
    })
    .filter(Boolean)
    .join('\n')

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1.0" />
  <title>${title} · ${clientName}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
  <style>
    :root{--navy:#173557;--navy-deep:#0e2240;--lime:#d3da47;--sky:#59c2ed;--bg:#fafbfc;--card:#fff;--text:#2d3748;--text-light:#718096;--border:#e2e8f0;--green:#38a169;--yellow:#d69e2e;--red:#e53e3e;}
    *{box-sizing:border-box;margin:0;padding:0;}
    body{font-family:'Montserrat',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:var(--bg);color:var(--text);-webkit-print-color-adjust:exact;print-color-adjust:exact;}
    .wrap{max-width:860px;margin:0 auto;padding:28px 20px 48px;}
    .slide{page-break-inside:avoid;break-inside:avoid;}
    @media print{
      body{background:#fff;}
      .wrap{padding:0;max-width:100%;}
      .slide{page-break-after:always;break-after:page;min-height:190mm;}
      .cover-slide{page-break-after:always;break-after:page;}
      .no-print{display:none!important;}
    }
  </style>
</head>
<body>
<div class="wrap">
  ${capa}
  ${slidesHTML || `<div style="text-align:center;padding:60px 20px;color:#94a3b8;font-size:14px;background:#fff;border-radius:12px;border:2px dashed #e2e8f0;">Nenhuma seção habilitada.</div>`}
  <div style="text-align:center;padding:24px 16px 0;border-top:1px solid #e2e8f0;margin-top:12px;">
    <div style="font-size:13px;font-weight:800;color:#173557;letter-spacing:.5px;margin-bottom:3px;">Powered by doncCX</div>
    <div style="font-size:11px;color:#94a3b8;">Gerado em ${genDate}</div>
  </div>
</div>
</body>
</html>`
}
