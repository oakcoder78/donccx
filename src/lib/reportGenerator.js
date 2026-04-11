/**
 * reportGenerator.js — RMC Sistema de Design
 * Arquitetura de "slides" com design system completo.
 * Navy #173557 · Navy-deep #0e2240 · Lime #d3da47 · Sky #59c2ed
 */

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
export function defaultSections() {
  return [
    { id: 'capa',           type: 'capa',           title: 'Capa',              enabled: true, content: { subtitle: '', clientTeam: [] }, extras: [] },
    { id: 'escala',         type: 'escala',         title: 'Escala da Operação',enabled: true, content: { callout: '' }, extras: [] },
    { id: 'suporte',        type: 'suporte',        title: 'Suporte',           enabled: true, content: { callout: '' }, extras: [] },
    { id: 'projetos',       type: 'projetos',       title: 'Projetos',          enabled: true, content: { callout: '' }, extras: [] },
    { id: 'health_score',   type: 'health_score',   title: 'Health Score',      enabled: true, content: {},             extras: [] },
    { id: 'destaques',      type: 'destaques',      title: 'Destaques do Período', enabled: true, content: { items: [], callout: '' }, extras: [] },
    { id: 'contexto',       type: 'contexto',       title: 'Contexto Externo',  enabled: true, content: { text: '' },   extras: [] },
    { id: 'proximos_passos',type: 'proximos_passos',title: 'Próximos Passos',   enabled: true, content: { items: [] },  extras: [] },
  ]
}

/** Migra formato antigo (object) para array de seções */
export function normalizeSections(raw) {
  if (Array.isArray(raw)) {
    // Verificar se já tem seção capa; se não, inserir no início
    const hasCapa = raw.some(s => s.id === 'capa')
    if (!hasCapa) {
      return [
        { id: 'capa', type: 'capa', title: 'Capa', enabled: true, content: { subtitle: '', clientTeam: [] }, extras: [] },
        ...raw,
      ]
    }
    return raw
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
    return { ...def, enabled, content }
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

function kpiCard({ label, value, sublabel, delta, deltaType, accentColor, highlighted }) {
  const accent = ACCENT[accentColor] ?? C.sky
  const dBg    = deltaType === 'up'   ? '#f0fff4' : deltaType === 'down' ? '#fff5f5' : '#ebf8ff'
  const dColor = deltaType === 'up'   ? '#276749' : deltaType === 'down' ? '#9b2c2c' : '#2b6cb0'
  const dIcon  = deltaType === 'up'   ? '▲' : deltaType === 'down' ? '▼' : '≈'

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
      <span style="width:36px;text-align:right;font-size:12px;font-weight:600;color:${C.text};flex-shrink:0;">${d.value}%</span>
    </div>`).join('')}</div>`
}

function resolBar(pct) {
  const color = pct >= 90 ? C.green : pct >= 70 ? C.yellow : C.red
  const label = pct >= 90 ? 'Excelente' : pct >= 70 ? 'Atenção' : 'Crítico'
  return `<div style="margin:16px 0;">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
      <span style="font-size:11px;font-weight:700;color:${C.textLight};text-transform:uppercase;letter-spacing:.5px;">Taxa de Resolução</span>
      <span style="font-size:14px;font-weight:800;color:${color};">${pct}% · ${label}</span>
    </div>
    <div style="background:${C.border};border-radius:999px;height:10px;overflow:hidden;">
      <div style="background:${color};width:${Math.min(pct, 100)}%;height:100%;border-radius:999px;"></div>
    </div>
  </div>`
}

function barChartV(usageHistory, period) {
  const sorted = [...(usageHistory ?? [])]
    .filter(u => u.os_created != null)
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
  })), cols)
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

      <!-- Cards: CSM + equipe — alinhados à direita abaixo do nome -->
      <div style="display:flex;gap:12px;justify-content:flex-end;flex-wrap:wrap;">
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

function slideEscala(sec, usageHistory, period, clientName, p) {
  const cur  = usageHistory.find(u => u.ref_month === period)
  const prev = usageHistory.find(u => u.ref_month === prevMonthStr(period))

  function delta(cur, prev) {
    if (cur == null || prev == null || prev === 0) return { d: null, t: 'neutral' }
    const pct = Math.round(((cur - prev) / prev) * 100)
    return { d: `${pct >= 0 ? '+' : ''}${pct}% vs anterior`, t: pct >= 0 ? 'up' : 'down' }
  }
  const du = delta(cur?.active_users, prev?.active_users)
  const dos = delta(cur?.os_created, prev?.os_created)

  // OS Criadas primeiro, Usuários Ativos segundo
  const autoCards = []
  if (cur?.os_created != null)
    autoCards.push(kpiCard({ label: 'O.S. Criadas', value: cur.os_created, sublabel: 'mês atual', delta: dos.d, deltaType: dos.t, accentColor: 'lime' }))
  if (cur?.active_users != null)
    autoCards.push(kpiCard({ label: 'Usuários Ativos', value: cur.active_users, sublabel: 'mês atual', delta: du.d, deltaType: du.t, accentColor: 'sky' }))

  const allCards = [...autoCards, ...(sec.extras ?? []).map(e =>
    kpiCard({ label: e.label, value: e.value, sublabel: e.sublabel, delta: e.delta, deltaType: e.deltaType, accentColor: e.accentColor ?? 'sky', highlighted: e.highlighted ?? false }))]

  const body = `
    ${allCards.length ? kpiGrid(allCards, Math.min(Math.max(allCards.length, 2), 4)) : ''}
    ${calloutBlock(sec.content?.callout, C.sky)}
    ${barChartV(usageHistory, period)}`

  return slide('📈', 'Escala da Operação', body, clientName, period, p, sec.subtitle)
}

function slideSuporte(sec, supportRaw, clientName, period, p) {
  const raw = supportRaw ?? {}
  const opened   = raw.tickets_opened    ?? null
  const resolved = raw.tickets_resolved  ?? null
  const sla      = raw.sla_first_response ?? null
  const n1 = raw.n1_pct ?? null
  const n2 = raw.n2_pct ?? null
  const n3 = raw.n3_pct ?? null
  const resRate = opened != null && resolved != null && opened > 0
    ? Math.round((resolved / opened) * 100) : null

  const autoCards = [
    kpiCard({ label: 'Tickets Abertos',    value: opened,   sublabel: 'mês atual', accentColor: 'navy' }),
    kpiCard({ label: 'Tickets Resolvidos', value: resolved, sublabel: 'mês atual', accentColor: 'green' }),
    kpiCard({ label: 'SLA 1ª Resp. (min)', value: sla,      sublabel: 'média',     accentColor: 'sky' }),
    kpiCard({ label: 'Taxa de Resolução',  value: resRate != null ? `${resRate}%` : null,
      sublabel: 'mês atual', accentColor: resRate != null && resRate >= 90 ? 'green' : 'lime' }),
  ]
  const allCards = [...autoCards, ...(sec.extras ?? []).map(e =>
    kpiCard({ label: e.label, value: e.value, sublabel: e.sublabel, delta: e.delta, deltaType: e.deltaType, accentColor: e.accentColor ?? 'sky', highlighted: e.highlighted ?? false }))]

  const n1n2n3 = [
    n1 != null ? { label: 'N1', value: n1, color: C.green  } : null,
    n2 != null ? { label: 'N2', value: n2, color: C.yellow } : null,
    n3 != null ? { label: 'N3', value: n3, color: C.red    } : null,
  ].filter(Boolean)

  const body = `
    ${kpiGrid(allCards, Math.min(allCards.length, 4))}
    ${resRate !== null ? resolBar(resRate) : ''}
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
 * @param {object} extraData — { usageHistory, supportRaw, healthData, projects }
 */
export function generateReportHTML(client, report, csm, extraData = {}) {
  const { sections: rawSecs = [], period = '', title = 'Relatório Mensal' } = report || {}
  const { usageHistory = [], supportRaw = null, healthData = null, projects = [] } = extraData

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
      if (s.type === 'escala')          return slideEscala(s, usageHistory, period, clientName, p)
      if (s.type === 'suporte')         return slideSuporte(s, supportRaw, clientName, period, p)
      if (s.type === 'projetos')        return slideProjetos(s, projects, clientName, period, p)
      if (s.type === 'health_score')    return slideHealthScore(s, healthData, clientName, period, p)
      if (s.type === 'destaques')       return slideDestaques(s, clientName, period, p)
      if (s.type === 'contexto')        return slideContexto(s, clientName, period, p)
      if (s.type === 'proximos_passos') return slideProximosPassos(s, clientName, period, p)
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
