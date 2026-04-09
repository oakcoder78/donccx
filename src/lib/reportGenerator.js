/**
 * reportGenerator.js
 * Gera um HTML standalone completo para o Relatório Mensal do Cliente (RMC).
 *
 * Design: Montserrat · Navy #173557 · Lime #d3da47 · Sky #59c2ed
 */

const NAVY = '#173557'
const LIME = '#d3da47'
const SKY  = '#59c2ed'

const MONTH_NAMES = [
  '', 'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro',
]

export function periodLabel(period) {
  if (!period) return ''
  const [year, month] = period.split('-')
  return `${MONTH_NAMES[parseInt(month, 10)]} ${year}`
}

// Converte texto em parágrafos HTML
function textToHTML(text) {
  if (!text || !text.trim()) return ''
  return text
    .split('\n')
    .filter(l => l.trim())
    .map(l => `<p style="margin:0 0 10px 0;line-height:1.7;color:#374151;">${l.trim()}</p>`)
    .join('')
}

// Cria bloco de seção com barra colorida à esquerda
function sectionBlock(icon, title, content, accent = NAVY) {
  const body = textToHTML(content)
  if (!body) return ''
  return `
  <div style="
    background:#ffffff;border-radius:12px;padding:28px 32px;margin-bottom:20px;
    box-shadow:0 1px 6px rgba(0,0,0,0.07);border-left:4px solid ${accent};
    break-inside:avoid;page-break-inside:avoid;
  ">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;">
      <span style="font-size:22px;line-height:1;">${icon}</span>
      <h2 style="
        margin:0;font-size:15px;font-weight:800;color:${NAVY};
        text-transform:uppercase;letter-spacing:0.8px;
      ">${title}</h2>
    </div>
    <div style="font-size:14px;">${body}</div>
  </div>`
}

/**
 * Gera o HTML completo do relatório.
 *
 * @param {object} client   — objeto client (id, name, fantasy_name, logo_url)
 * @param {object} report   — objeto report (title, period, sections)
 * @param {object|null} csm — perfil do CSM (name, email)
 * @returns {string}        — HTML standalone
 */
export function generateReportHTML(client, report, csm) {
  const { sections = {}, title = 'Relatório Mensal', period = '' } = report || {}
  const clientName = client?.fantasy_name || client?.name || '—'
  const logoUrl    = client?.logo_url   || null
  const csmName    = csm?.name          || '—'
  const csmEmail   = csm?.email         || ''
  const per        = periodLabel(period)
  const genDate    = new Date().toLocaleDateString('pt-BR', { day:'2-digit', month:'long', year:'numeric' })

  /* ── Capa ── */
  const logoHTML = logoUrl
    ? `<img src="${logoUrl}" alt="${clientName}" style="
        width:72px;height:72px;object-fit:contain;border-radius:10px;
        background:rgba(255,255,255,0.15);padding:8px;flex-shrink:0;
      " />`
    : `<div style="
        width:72px;height:72px;border-radius:10px;flex-shrink:0;
        background:rgba(255,255,255,0.18);
        display:flex;align-items:center;justify-content:center;
        font-size:28px;font-weight:800;color:#fff;
      ">${clientName.charAt(0).toUpperCase()}</div>`

  /* ── Seções ── */
  const sectionsHTML = [
    sectionBlock('📈', 'Escala da Operação',  sections.escala,           SKY),
    sectionBlock('🎫', 'Suporte',             sections.suporte,          NAVY),
    sectionBlock('🗂️', 'Projetos',            sections.projetos,         '#6366f1'),
    sectionBlock('⭐', 'Destaques do Período', sections.destaques,        '#e67e22'),
    sectionBlock('🌐', 'Contexto Externo',    sections.contexto,         '#f59e0b'),
    sectionBlock('🎯', 'Próximos Passos',     sections.proximos_passos,  '#10b981'),
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
    body{
      font-family:'Montserrat',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
      background:#f1f5f9;color:#1e293b;
      -webkit-print-color-adjust:exact;print-color-adjust:exact;
    }
    .wrap{max-width:820px;margin:0 auto;padding:28px 20px 40px;}
    @media print{
      body{background:#fff;}
      .wrap{padding:0;}
      .no-print{display:none!important;}
    }
  </style>
</head>
<body>
<div class="wrap">

  <!-- ── Capa ── -->
  <div style="
    background:linear-gradient(140deg,${NAVY} 0%,#1a4a82 60%,#1a3d6e 100%);
    border-radius:14px;padding:40px 36px;margin-bottom:20px;
    position:relative;overflow:hidden;
  ">
    <!-- Decoração de fundo -->
    <div style="
      position:absolute;top:-50px;right:-50px;
      width:200px;height:200px;border-radius:50%;
      background:rgba(255,255,255,0.04);pointer-events:none;
    "></div>
    <div style="
      position:absolute;bottom:-60px;left:-40px;
      width:180px;height:180px;border-radius:50%;
      background:${LIME}18;pointer-events:none;
    "></div>

    <!-- Conteúdo da capa -->
    <div style="position:relative;z-index:1;">
      <!-- Logo + nome cliente -->
      <div style="display:flex;align-items:center;gap:18px;margin-bottom:32px;">
        ${logoHTML}
        <div>
          <div style="
            font-size:10px;font-weight:700;letter-spacing:2.5px;
            color:${LIME};text-transform:uppercase;margin-bottom:6px;
          ">Relatório Mensal do Cliente</div>
          <h1 style="font-size:24px;font-weight:800;color:#fff;line-height:1.2;margin-bottom:4px;">
            ${clientName}
          </h1>
          <div style="font-size:15px;font-weight:500;color:rgba(255,255,255,0.7);">
            ${per}
          </div>
        </div>
      </div>

      <!-- CSM card -->
      <div style="
        display:inline-flex;align-items:center;gap:14px;
        background:rgba(255,255,255,0.08);
        border:1px solid rgba(255,255,255,0.14);
        border-radius:10px;padding:12px 18px;
      ">
        <div style="
          width:38px;height:38px;border-radius:50%;
          background:${LIME};flex-shrink:0;
          display:flex;align-items:center;justify-content:center;
          font-weight:800;font-size:15px;color:${NAVY};
        ">${csmName.charAt(0).toUpperCase()}</div>
        <div>
          <div style="font-size:11px;color:rgba(255,255,255,0.55);margin-bottom:2px;">
            CSM Responsável
          </div>
          <div style="font-size:14px;font-weight:700;color:#fff;">${csmName}</div>
          ${csmEmail
            ? `<div style="font-size:12px;color:${LIME};">${csmEmail}</div>`
            : ''}
        </div>
      </div>
    </div>
  </div>

  <!-- ── Seções ── -->
  ${emptySections
    ? `<div style="
        text-align:center;padding:60px 20px;color:#94a3b8;
        font-size:14px;background:#fff;border-radius:12px;
        border:2px dashed #e2e8f0;
      ">Nenhum conteúdo adicionado ainda.</div>`
    : sectionsHTML}

  <!-- ── Rodapé ── -->
  <div style="
    text-align:center;padding:24px 16px 0;
    border-top:1px solid #e2e8f0;margin-top:12px;
  ">
    <div style="font-size:13px;font-weight:800;color:${NAVY};letter-spacing:0.5px;margin-bottom:3px;">
      Powered by doncCX
    </div>
    <div style="font-size:11px;color:#94a3b8;">
      Gerado em ${genDate}
    </div>
  </div>

</div>
</body>
</html>`
}
