/**
 * reportGenerator.js
 * Gera HTML standalone para o RMC (Relatório Mensal do Cliente)
 * Navy #173557 · Lime #d3da47 · Sky #59c2ed
 */

const NAVY = '#173557'
const LIME = '#d3da47'
const SKY  = '#59c2ed'

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
  const [year, month] = period.split('-')
  return `${MONTH_NAMES[parseInt(month, 10)]} ${year}`
}

function monthShort(period) {
  if (!period) return ''
  const [, month] = period.split('-')
  return MONTH_SHORT[parseInt(month, 10)]
}

// Suporta formato antigo (string) e novo ({ content, enabled })
function getContent(sec) {
  if (!sec) return ''
  if (typeof sec === 'string') return sec
  return sec.content ?? ''
}

function isEnabled(sec) {
  if (!sec) return false
  if (typeof sec === 'string') return !!sec.trim()
  return sec.enabled !== false
}

function textToHTML(text) {
  if (!text || !text.trim()) return ''
  return text
    .split('\n')
    .filter(l => l.trim())
    .map(l => `<p style="margin:0 0 10px 0;line-height:1.7;color:#374151;">${l.trim()}</p>`)
    .join('')
}

function sectionWrapper(icon, title, bodyHTML, accent = NAVY) {
  if (!bodyHTML || !bodyHTML.trim()) return ''
  return `
  <div style="
    background:#ffffff;border-radius:12px;padding:28px 32px;margin-bottom:20px;
    box-shadow:0 1px 6px rgba(0,0,0,0.07);border-left:4px solid ${accent};
    break-inside:avoid;page-break-inside:avoid;
  ">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:20px;">
      <span style="font-size:22px;line-height:1;">${icon}</span>
      <h2 style="margin:0;font-size:15px;font-weight:800;color:${NAVY};text-transform:uppercase;letter-spacing:0.8px;">${title}</h2>
    </div>
    <div style="font-size:14px;">${bodyHTML}</div>
  </div>`
}

function sectionBlock(icon, title, section, accent = NAVY) {
  if (!isEnabled(section)) return ''
  const body = textToHTML(getContent(section))
  if (!body) return ''
  return sectionWrapper(icon, title, body, accent)
}

// ── Escala: bullets + gráfico de barras SVG ────────────────────
function escalaBlock(section, usageHistory = []) {
  if (!isEnabled(section)) return ''
  const textBody = textToHTML(getContent(section))
  const chartSVG = buildOsBarChart(usageHistory)
  const body = textBody + chartSVG
  if (!body.trim()) return ''
  return sectionWrapper('📈', 'Escala da Operação', body, SKY)
}

function buildOsBarChart(usageHistory) {
  if (!usageHistory || usageHistory.length === 0) return ''
  const sorted = [...usageHistory]
    .filter(u => u.os_created != null)
    .sort((a, b) => a.ref_month.localeCompare(b.ref_month))
    .slice(-4)
  if (sorted.length === 0) return ''

  const maxVal = Math.max(...sorted.map(u => u.os_created), 1)
  const svgW = 480
  const chartH = 90
  const topPad = 24
  const bottomPad = 28
  const svgH = chartH + topPad + bottomPad
  const barW = 70
  const gap = (svgW - sorted.length * barW) / (sorted.length + 1)
  const lastIdx = sorted.length - 1

  const bars = sorted.map((u, i) => {
    const x = gap + i * (barW + gap)
    const h = Math.round((u.os_created / maxVal) * chartH)
    const y = topPad + (chartH - h)
    const color = i === lastIdx ? LIME : SKY
    const opacity = i === lastIdx ? '1' : '0.6'
    return `
      <rect x="${x}" y="${y}" width="${barW}" height="${h}" rx="4" fill="${color}" opacity="${opacity}"/>
      <text x="${x + barW / 2}" y="${y - 6}" text-anchor="middle" font-size="11" font-weight="700" fill="${NAVY}" font-family="sans-serif">${u.os_created}</text>
      <text x="${x + barW / 2}" y="${topPad + chartH + 18}" text-anchor="middle" font-size="11" fill="#64748b" font-family="sans-serif">${monthShort(u.ref_month)}</text>`
  }).join('')

  return `
  <div style="margin-top:20px;">
    <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.8px;margin-bottom:10px;">O.S. Criadas — Últimos Meses</div>
    <svg viewBox="0 0 ${svgW} ${svgH}" width="100%" style="max-width:${svgW}px;display:block;overflow:visible;">${bars}</svg>
  </div>`
}

// ── Suporte: números grandes + barra de progresso ──────────────
function suporteBlock(section, supportRaw = null) {
  if (!isEnabled(section)) return ''
  const raw = supportRaw || {}
  const opened   = raw.tickets_opened    ?? null
  const resolved = raw.tickets_resolved  ?? null
  const sla      = raw.sla_first_response ?? null
  const n1       = raw.n1_pct ?? null
  const n2       = raw.n2_pct ?? null
  const n3       = raw.n3_pct ?? null

  const resRate = (opened != null && resolved != null && opened > 0)
    ? Math.round((resolved / opened) * 100)
    : null

  const rateColor = resRate === null ? '#94a3b8'
    : resRate >= 90 ? '#22c55e'
    : resRate >= 70 ? '#f59e0b'
    : '#ef4444'

  function metricCard(value, label, color) {
    return `
    <div style="flex:1;text-align:center;padding:16px 8px;background:#f8fafc;border-radius:10px;">
      <div style="font-size:48px;font-weight:800;color:${color};line-height:1.1;margin-bottom:4px;">${value !== null ? value : '—'}</div>
      <div style="font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;">${label}</div>
    </div>`
  }

  const metricsHTML = `
  <div style="display:flex;gap:12px;margin-bottom:20px;">
    ${metricCard(opened, 'Tickets Abertos', NAVY)}
    ${metricCard(resolved, 'Tickets Resolvidos', '#2563eb')}
    ${metricCard(sla, 'SLA 1ª Resposta (min)', '#6366f1')}
  </div>`

  const progressHTML = resRate !== null ? `
  <div style="margin-bottom:16px;">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
      <span style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.8px;">Taxa de Resolução</span>
      <span style="font-size:13px;font-weight:800;color:${rateColor};">${resRate}%</span>
    </div>
    <div style="background:#f1f5f9;border-radius:999px;height:8px;overflow:hidden;">
      <div style="background:${rateColor};width:${Math.min(resRate, 100)}%;height:100%;border-radius:999px;"></div>
    </div>
  </div>` : ''

  const n1n2n3 = (n1 != null || n2 != null || n3 != null) ? `
  <div style="font-size:12px;color:#64748b;margin-top:8px;">
    ${n1 != null ? `<span style="margin-right:16px;">N1: <strong>${n1}%</strong></span>` : ''}
    ${n2 != null ? `<span style="margin-right:16px;">N2: <strong>${n2}%</strong></span>` : ''}
    ${n3 != null ? `<span>N3 (escalados): <strong>${n3}%</strong></span>` : ''}
  </div>` : ''

  const textBody = textToHTML(getContent(section))
  const extra = textBody ? `<div style="margin-top:16px;">${textBody}</div>` : ''
  const body = metricsHTML + progressHTML + n1n2n3 + extra

  return sectionWrapper('🎫', 'Suporte', body, NAVY)
}

// ── Health Score: card + dimensões ────────────────────────────
function healthScoreBlock(section, healthData = null) {
  if (!isEnabled(section)) return ''

  if (!healthData || healthData.health_total == null) {
    const body = '<p style="color:#94a3b8;font-style:italic;font-size:13px;">Dados de Health Score não disponíveis.</p>'
    return sectionWrapper('💚', 'Health Score', body, '#22c55e')
  }

  const total = healthData.health_total
  const status = total >= 75
    ? { label: 'Saudável', color: '#22c55e' }
    : total >= 50
      ? { label: 'Atenção', color: '#f59e0b' }
      : { label: 'Risco', color: '#ef4444' }

  const dims = [
    { label: 'Uso',            key: 'health_uso',            color: SKY       },
    { label: 'Suporte',        key: 'health_suporte',        color: '#6366f1' },
    { label: 'Relacionamento', key: 'health_relacionamento', color: '#f59e0b' },
    { label: 'Financeiro',     key: 'health_financeiro',     color: '#10b981' },
    { label: 'Projeto',        key: 'health_projeto',        color: '#ec4899' },
  ]

  const scoreCard = `
  <div style="text-align:center;padding:24px 0 20px;border-bottom:1px solid #f1f5f9;margin-bottom:20px;">
    <div style="font-size:72px;font-weight:800;color:${status.color};line-height:1;">${total}</div>
    <div style="font-size:16px;font-weight:700;color:${status.color};margin-top:4px;">${status.label}</div>
    <div style="font-size:11px;color:#94a3b8;margin-top:2px;">Health Score</div>
  </div>`

  const dimsHTML = dims.map(d => {
    const val = healthData[d.key] ?? null
    const pct = val !== null ? Math.min(val, 100) : 0
    return `
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:10px;">
      <div style="width:120px;font-size:12px;color:#374151;">${d.label}</div>
      <div style="flex:1;background:#f1f5f9;border-radius:999px;height:8px;overflow:hidden;">
        <div style="background:${d.color};width:${pct}%;height:100%;border-radius:999px;"></div>
      </div>
      <div style="width:30px;text-align:right;font-size:12px;font-weight:700;color:#374151;">${val !== null ? val : '—'}</div>
    </div>`
  }).join('')

  return sectionWrapper('💚', 'Health Score', scoreCard + `<div>${dimsHTML}</div>`, '#22c55e')
}

// ── Evolução do Health Score: linha SVG ───────────────────────
function healthEvolutionBlock(section, healthHistory = []) {
  if (!isEnabled(section)) return ''

  const hasHistory = healthHistory && healthHistory.length > 1

  if (!hasHistory) {
    const body = '<p style="text-align:center;color:#94a3b8;font-size:13px;font-style:italic;padding:20px 0;">Histórico em construção — dados acumulam a partir deste mês.</p>'
    return sectionWrapper('📊', 'Evolução do Health Score', body, LIME)
  }

  const sorted = [...healthHistory]
    .sort((a, b) => a.ref_month.localeCompare(b.ref_month))
    .slice(-8)
  const n = sorted.length
  const svgW = 500
  const padL = 36, padR = 16, padT = 20, padB = 28
  const plotW = svgW - padL - padR
  const plotH = 100

  function px(i) { return padL + (n === 1 ? plotW / 2 : (i * plotW) / (n - 1)) }
  function py(score) { return padT + plotH - (score / 100) * plotH }

  const points = sorted.map((h, i) => `${px(i)},${py(h.health_total)}`).join(' ')

  const dots = sorted.map((h, i) => `
    <circle cx="${px(i)}" cy="${py(h.health_total)}" r="4" fill="${LIME}" stroke="${NAVY}" stroke-width="1.5"/>
    <text x="${px(i)}" y="${py(h.health_total) - 8}" text-anchor="middle" font-size="10" font-weight="700" fill="${LIME}" font-family="sans-serif">${h.health_total}</text>`).join('')

  const xLabels = sorted.map((h, i) => `
    <text x="${px(i)}" y="${padT + plotH + padB - 4}" text-anchor="middle" font-size="10" fill="rgba(255,255,255,0.6)" font-family="sans-serif">${monthShort(h.ref_month)}</text>`).join('')

  const grid = [25, 50, 75].map(v => `
    <line x1="${padL}" y1="${py(v)}" x2="${svgW - padR}" y2="${py(v)}" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>
    <text x="${padL - 4}" y="${py(v) + 4}" text-anchor="end" font-size="9" fill="rgba(255,255,255,0.4)" font-family="sans-serif">${v}</text>`).join('')

  const svgH = padT + plotH + padB
  const body = `
  <div style="background:${NAVY};border-radius:10px;padding:16px;margin-top:4px;">
    <svg viewBox="0 0 ${svgW} ${svgH}" width="100%" style="max-width:${svgW}px;display:block;overflow:visible;">
      ${grid}
      <polyline points="${points}" fill="none" stroke="${LIME}" stroke-width="2.5" stroke-linejoin="round"/>
      ${dots}
      ${xLabels}
    </svg>
  </div>`

  return sectionWrapper('📊', 'Evolução do Health Score', body, LIME)
}

// ── Seções customizadas ───────────────────────────────────────
function customSectionBlock(sec) {
  if (!isEnabled(sec)) return ''
  const { label = 'Seção', type = 'text', content = '', chartTitle = '' } = sec

  let body = ''
  if (type === 'text') {
    body = textToHTML(content)
    if (!body) return ''
  } else if (type === 'image') {
    if (!content) return ''
    body = `<img src="${content}" alt="${label}" style="max-width:100%;border-radius:8px;display:block;" />`
  } else if (type === 'chart') {
    body = buildCustomBarChart(content, chartTitle)
    if (!body) return ''
  }

  return sectionWrapper('📌', label, body, '#8b5cf6')
}

function buildCustomBarChart(csvContent, title = '') {
  if (!csvContent || !csvContent.trim()) {
    return '<p style="text-align:center;color:#94a3b8;font-size:13px;font-style:italic;padding:20px 0;">Gráfico personalizado — adicione dados no formato CSV (Label,Valor)</p>'
  }

  const data = csvContent.trim().split('\n')
    .map(l => l.trim()).filter(Boolean)
    .map(l => { const p = l.split(','); return { label: (p[0] ?? '').trim(), value: parseFloat((p[1] ?? '0').trim()) || 0 } })
    .filter(d => d.label)

  if (data.length === 0) return ''

  const maxVal = Math.max(...data.map(d => d.value), 1)
  const n = data.length
  const svgW = 480
  const barW = Math.max(30, Math.min(70, Math.floor((svgW - 40) / n) - 10))
  const gap = (svgW - n * barW) / (n + 1)
  const chartH = 90
  const topPad = 24
  const bottomPad = 28
  const svgH = chartH + topPad + bottomPad

  const bars = data.map((d, i) => {
    const x = gap + i * (barW + gap)
    const h = Math.round((d.value / maxVal) * chartH)
    const y = topPad + (chartH - h)
    return `
      <rect x="${x}" y="${y}" width="${barW}" height="${h}" rx="4" fill="#8b5cf6" opacity="0.8"/>
      <text x="${x + barW / 2}" y="${y - 6}" text-anchor="middle" font-size="11" font-weight="700" fill="${NAVY}" font-family="sans-serif">${d.value}</text>
      <text x="${x + barW / 2}" y="${topPad + chartH + 18}" text-anchor="middle" font-size="10" fill="#64748b" font-family="sans-serif">${d.label}</text>`
  }).join('')

  return `
  ${title ? `<div style="font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.8px;margin-bottom:12px;">${title}</div>` : ''}
  <svg viewBox="0 0 ${svgW} ${svgH}" width="100%" style="max-width:${svgW}px;display:block;overflow:visible;">${bars}</svg>`
}

// ── EXPORT PRINCIPAL ──────────────────────────────────────────
/**
 * @param {object} client
 * @param {object} report — { title, period, sections }
 * @param {object|null} csm
 * @param {object} extraData — { usageHistory, supportRaw, healthData, healthHistory }
 */
export function generateReportHTML(client, report, csm, extraData = {}) {
  const { sections = {}, title = 'Relatório Mensal', period = '' } = report || {}
  const { usageHistory = [], supportRaw = null, healthData = null, healthHistory = [] } = extraData

  const clientName = client?.fantasy_name || client?.name || '—'
  const logoUrl    = client?.logo_url || null
  const csmName    = csm?.name  || '—'
  const csmEmail   = csm?.email || ''
  const per        = periodLabel(period)
  const genDate    = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })

  const logoHTML = logoUrl
    ? `<img src="${logoUrl}" alt="${clientName}" style="width:72px;height:72px;object-fit:contain;border-radius:10px;background:rgba(255,255,255,0.15);padding:8px;flex-shrink:0;" />`
    : `<div style="width:72px;height:72px;border-radius:10px;flex-shrink:0;background:rgba(255,255,255,0.18);display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:800;color:#fff;">${clientName.charAt(0).toUpperCase()}</div>`

  const custom = sections._custom ?? []

  const sectionsHTML = [
    escalaBlock(sections.escala, usageHistory),
    suporteBlock(sections.suporte, supportRaw),
    sectionBlock('🗂️', 'Projetos',             sections.projetos,        '#6366f1'),
    sectionBlock('⭐', 'Destaques do Período',  sections.destaques,       '#e67e22'),
    sectionBlock('🌐', 'Contexto Externo',      sections.contexto,        '#f59e0b'),
    sectionBlock('🎯', 'Próximos Passos',       sections.proximos_passos, '#10b981'),
    healthScoreBlock(sections.health_score, healthData),
    healthEvolutionBlock(sections.health_evolucao, healthHistory),
    ...custom.map(sec => customSectionBlock(sec)),
  ].filter(Boolean).join('\n')

  const emptySections = !sectionsHTML.trim()

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
    *{box-sizing:border-box;margin:0;padding:0;}
    body{font-family:'Montserrat',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f1f5f9;color:#1e293b;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
    .wrap{max-width:820px;margin:0 auto;padding:28px 20px 40px;}
    @media print{body{background:#fff;}.wrap{padding:0;}.no-print{display:none!important;}}
  </style>
</head>
<body>
<div class="wrap">

  <!-- Capa -->
  <div style="background:linear-gradient(140deg,${NAVY} 0%,#1a4a82 60%,#1a3d6e 100%);border-radius:14px;padding:40px 36px;margin-bottom:20px;position:relative;overflow:hidden;">
    <div style="position:absolute;top:-50px;right:-50px;width:200px;height:200px;border-radius:50%;background:rgba(255,255,255,0.04);pointer-events:none;"></div>
    <div style="position:absolute;bottom:-60px;left:-40px;width:180px;height:180px;border-radius:50%;background:${LIME}18;pointer-events:none;"></div>
    <div style="position:relative;z-index:1;">
      <div style="display:flex;align-items:center;gap:18px;margin-bottom:32px;">
        ${logoHTML}
        <div>
          <div style="font-size:10px;font-weight:700;letter-spacing:2.5px;color:${LIME};text-transform:uppercase;margin-bottom:6px;">Relatório Mensal do Cliente</div>
          <h1 style="font-size:24px;font-weight:800;color:#fff;line-height:1.2;margin-bottom:4px;">${clientName}</h1>
          <div style="font-size:15px;font-weight:500;color:rgba(255,255,255,0.7);">${per}</div>
        </div>
      </div>
      <div style="display:inline-flex;align-items:center;gap:14px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.14);border-radius:10px;padding:12px 18px;">
        <div style="width:38px;height:38px;border-radius:50%;background:${LIME};flex-shrink:0;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:15px;color:${NAVY};">${csmName.charAt(0).toUpperCase()}</div>
        <div>
          <div style="font-size:11px;color:rgba(255,255,255,0.55);margin-bottom:2px;">CSM Responsável</div>
          <div style="font-size:14px;font-weight:700;color:#fff;">${csmName}</div>
          ${csmEmail ? `<div style="font-size:12px;color:${LIME};">${csmEmail}</div>` : ''}
        </div>
      </div>
    </div>
  </div>

  <!-- Seções -->
  ${emptySections
    ? `<div style="text-align:center;padding:60px 20px;color:#94a3b8;font-size:14px;background:#fff;border-radius:12px;border:2px dashed #e2e8f0;">Nenhum conteúdo adicionado ainda.</div>`
    : sectionsHTML}

  <!-- Rodapé -->
  <div style="text-align:center;padding:24px 16px 0;border-top:1px solid #e2e8f0;margin-top:12px;">
    <div style="font-size:13px;font-weight:800;color:${NAVY};letter-spacing:0.5px;margin-bottom:3px;">Powered by doncCX</div>
    <div style="font-size:11px;color:#94a3b8;">Gerado em ${genDate}</div>
  </div>

</div>
</body>
</html>`
}
