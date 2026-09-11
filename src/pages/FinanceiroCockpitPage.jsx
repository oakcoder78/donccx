import { useState, useMemo, useCallback, useEffect } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useFeatureFlags } from '@/hooks/useFeatureFlags'
import {
  useFinanceiroCockpit,
  useFinanceiroDetalhe,
  useLastDoncSync,
} from '@/hooks/useFinanceiroCockpit'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Icons } from '@/lib/icons'
import { useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { supabase } from '@/lib/supabaseClient'
import { ExcecaoModal } from '@/components/financeiro/ExcecaoModal'
import { PaymentToggle } from '@/components/financeiro/PaymentToggle'
import {
  formatBRL,
  formatPercent,
  monthLabel,
  deltaDisplay,
  defaultRefMonth,
  seriesModeLabel,
  excecaoLabel,
} from '@/lib/financeiro'

// ─── Helpers ───────────────────────────────────────────────────────────────────

const BILLING_TYPE_LABELS = {
  por_licenca: 'Por licença',
  por_os: 'Por OS',
  mista: 'Mista',
}

const BADGE_BASE = 'inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded'
const BADGE_GREEN = `${BADGE_BASE} bg-donc-verde/10 text-donc-verde`
const BADGE_RED = `${BADGE_BASE} bg-donc-red/10 text-donc-red`
const BADGE_AMBER = `${BADGE_BASE} bg-donc-amber/10 text-donc-amber`
const BADGE_MUTED = `${BADGE_BASE} bg-bg-secondary text-text-tertiary`

function billingTypeLabel(type) {
  return BILLING_TYPE_LABELS[type] || type || '—'
}

function ChevronIcon({ open }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none"
      className="transition-transform duration-200 flex-shrink-0"
      style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
    >
      <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function BackButton({ navigate }) {
  return (
    <button onClick={() => navigate('/cockpits')} className="flex items-center gap-1.5 text-sm text-text-tertiary hover:text-text-secondary transition-colors mb-4">
      <Icons.ArrowLeft className="w-4 h-4" />
      Voltar para Cockpits
    </button>
  )
}

// Same switch style used by ProjectCockpitPage.
function Toggle({ value, onChange, disabled }) {
  return (
    <div
      role="switch"
      aria-checked={value}
      aria-disabled={disabled}
      tabIndex={disabled ? -1 : 0}
      onClick={() => !disabled && onChange(!value)}
      onKeyDown={(e) => {
        if (disabled) return
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault()
          onChange(!value)
        }
      }}
      style={{
        width: 36, height: 20, borderRadius: 10, flexShrink: 0,
        backgroundColor: value ? '#173557' : '#d4d3ce',
        position: 'relative', transition: 'background 0.2s',
        cursor: disabled ? 'default' : 'pointer',
        display: 'inline-block',
        outlineOffset: 2,
      }}
    >
      <div style={{
        position: 'absolute', top: 2, left: value ? 18 : 2,
        width: 16, height: 16, borderRadius: '50%', backgroundColor: '#fff',
        transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
      }} />
    </div>
  )
}

/** Previous calendar month of a YYYY-MM ref month. */
function prevMonthOf(refMonth) {
  const [year, month] = String(refMonth || '').split('-').map(Number)
  if (!year || !month) return null
  const d = new Date(year, month - 2, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** Percent delta vs a previous total; null when there is no baseline. */
function pctDelta(cur, prev) {
  if (!prev || prev <= 0) return null
  return parseFloat(((cur - prev) / prev * 100).toFixed(1))
}

function toISODateLocal(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** contract_renewal within [today, today + 30d] (local time, date-only compare). */
function isRenewalWithin30d(dateStr) {
  if (!dateStr) return false
  const key = String(dateStr).slice(0, 10)
  const today = new Date()
  const limit = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 30)
  return key >= toISODateLocal(today) && key <= toISODateLocal(limit)
}

function formatDateTime(value) {
  if (!value) return '—'
  return new Date(value).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function formatDate(value) {
  if (!value) return '—'
  const d = String(value).length === 10 ? new Date(`${value}T00:00:00`) : new Date(value)
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function downloadFile(content, filename, mime) {
  const blob = new Blob(['\uFEFF' + content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// ─── Exports (Phase 4) ─────────────────────────────────────────────────────────

const EXPORT_VIEWS = [
  { key: 'geral', label: 'Geral' },
  { key: 'faturavel', label: 'Faturável' },
  { key: 'isento', label: 'Isento' },
]

function applyExportView(rows, view) {
  if (view === 'faturavel') return (rows || []).filter((r) => Number(r.mrr_real) > 0)
  if (view === 'isento') return (rows || []).filter((r) => Number(r.mrr_real) === 0 && Number(r.series_count) > 0)
  return rows || []
}

function csvField(value) {
  const s = value === null || value === undefined ? '' : String(value)
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function csvLine(values) {
  return values.map(csvField).join(';')
}

function slugify(value) {
  return (
    String(value || 'cliente')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase() || 'cliente'
  )
}

async function fetchFinanceiroDetail(clientId, refMonth) {
  const { data, error } = await supabase.rpc('get_financeiro_detalhe', {
    p_client_id: clientId,
    p_ref_month: refMonth,
  })
  if (error) throw error
  return data?.[0] || null
}

function paymentText(status, delayDays) {
  if (status === 'adimplente') return 'Adimplente'
  if (status === 'inadimplente') return `Inadimplente${Number(delayDays) > 0 ? ` ${delayDays}d` : ''}`
  return ''
}

function profsLabel(profs) {
  return (profs || []).map((p) => p.nome).filter(Boolean).join('; ')
}

const ANALITICO_HEADER = [
  'Cliente', 'CNPJ', 'SaaS ID', 'Série', 'Tipo de série', 'Plano', 'Modo',
  'Piso', 'Uso', 'Billable', 'Valor unit.', 'MRR mínimo', 'MRR real', 'Excedente',
  'Exceção', 'Escopo', 'Adimplência', 'Atraso (d)', 'Pago em', 'Índice de reajuste',
  'Reajuste (%)', 'Profissionais',
]

function analiticoRowFromExport(r) {
  return csvLine([
    r.client_name, r.cnpj, r.saas_id, r.series_label, r.series_kind,
    billingTypeLabel(r.billing_type),
    r.mode === 'base_excedente' ? 'Base + excedente' : 'Travado',
    r.billing_floor, r.uso, r.billable, formatBRL(r.valor_unit),
    formatBRL(r.mrr_min), formatBRL(r.mrr_real), formatBRL(r.excedente),
    r.excecao_desc, r.excecao_escopo === 'serie' ? 'série' : (r.excecao_escopo || ''),
    paymentText(r.payment_status, r.delay_days),
    r.delay_days, r.paid_at ? formatDate(r.paid_at) : '',
    r.correction_index, r.correction_percent, profsLabel(r.profissionais),
  ])
}

async function csvAnaliticoGlobal({ refMonth, rows, view }) {
  const { data, error } = await supabase.rpc('get_financeiro_export', { p_ref_month: refMonth })
  if (error) throw error
  const ids = new Set((rows || []).map((r) => String(r.client_id)))
  const scoped = applyExportView((data || []).filter((r) => ids.has(String(r.client_id))), view)
  const lines = [csvLine(ANALITICO_HEADER), ...scoped.map(analiticoRowFromExport)]
  downloadFile(lines.join('\n'), `financeiro-analitico-${view}-${refMonth}.csv`, 'text/csv;charset=utf-8')
}

async function csvAnaliticoRow({ row, refMonth }) {
  const detail = await fetchFinanceiroDetail(row.client_id, refMonth)
  const series = detail?.series || []
  const modulos = detail?.modulos || []
  const excecoes = detail?.excecoes || []
  const payment = detail?.payment || []
  const profs = detail?.profissionais || []
  const header = [
    'Cliente', 'CNPJ', 'SaaS ID', 'Série', 'Tipo de série', 'Plano', 'Modo',
    'Uso', 'MRR mínimo', 'MRR real', 'Excedente', 'Exceções', 'Módulos', 'Adimplência', 'Profissionais',
  ]
  const lines = [csvLine(header)]
  if (series.length === 0) {
    lines.push(csvLine([row.client_name, row.cnpj, row.saas_id]))
  }
  series.forEach((s) => {
    const modsOfSeries = modulos
      .filter((m) => m.series_id === s.series_id)
      .map((m) => `${m.nome}=${formatBRL(m.valor_rateado)}${m.pct != null ? ` (${formatPercent(m.pct)})` : ''}`)
      .join('; ')
    const excOfScope = excecoes
      .filter((e) => (e.series_id || null) === (s.series_id || null))
      .map((e) => `${excecaoLabel(e.type, e)} · ${e.valid_from}→${e.valid_to}`)
      .join('; ')
    const pay = payment.find((p) => p.series_id === s.series_id)
    lines.push(csvLine([
      row.client_name, row.cnpj, row.saas_id, s.label, s.kind,
      billingTypeLabel(s.billing_type), seriesModeLabel(s.mode),
      s.uso, formatBRL(s.min), formatBRL(s.total),
      formatBRL(Number(s.total) - Number(s.min)),
      excOfScope, modsOfSeries,
      pay ? paymentText(pay.status, pay.delay_days) : '',
      s.billing_type === 'por_licenca' ? profsLabel(profs) : '',
    ]))
  })
  downloadFile(
    lines.join('\n'),
    `financeiro-analitico-geral-${slugify(row.client_name)}-${refMonth}.csv`,
    'text/csv;charset=utf-8'
  )
}

function buildPdfHtml(row, detail, refMonth, opts = {}) {
  const series = detail?.series || []
  const excecoes = detail?.excecoes || []
  const payment = detail?.payment || []
  const profs = detail?.profissionais || []
  const commit = typeof __COMMIT_HASH__ !== 'undefined' ? __COMMIT_HASH__ : 'dev'
  const esc = (s) =>
    String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
  const seriesRows = series
    .map(
      (s) => `<tr>
        <td>${esc(s.label)}<br><span class="muted">${esc(s.kind)}</span></td>
        <td>${esc(billingTypeLabel(s.billing_type))}</td>
        <td>${esc(seriesModeLabel(s.mode))}</td>
        <td class="num">${formatBRL(s.min)}</td>
        <td class="num">${s.uso ?? ''}</td>
        <td class="num">${formatBRL(s.excedente)}</td>
        <td class="num"><strong>${formatBRL(s.total)}</strong></td>
      </tr>`
    )
    .join('')
  const excecoesList = excecoes.length
    ? `<ul>${excecoes.map((e) => `<li><strong>${esc(excecaoLabel(e.type, e))}</strong> · ${e.escopo === 'serie' ? 'série' : 'cliente'} · ${formatDate(e.valid_from)} → ${formatDate(e.valid_to)}<br><span class="muted">${esc(e.reason)}</span></li>`).join('')}</ul>`
    : '<p class="muted">Sem exceções no mês.</p>'
  const paymentList = payment.length
    ? `<ul>${payment.map((p) => {
        const s = series.find((x) => x.series_id === p.series_id)
        return `<li>${esc(s?.label || 'Série')} · ${esc(paymentText(p.status, p.delay_days))}${p.paid_at ? ` · pago em ${formatDate(p.paid_at)}` : ''}</li>`
      }).join('')}</ul>`
    : '<p class="muted">Sem dados de adimplência.</p>'
  const ativosList = profs.filter((p) => p.ativo)
  const profBlock = profs.length === 0
    ? ''
    : opts.includeProfs
      ? `<h2>Profissionais ativos (${ativosList.length})</h2>
<table><thead><tr><th>Nome</th><th>E-mail</th><th>Último login</th></tr></thead><tbody>${ativosList.map((p) => `<tr><td>${esc(p.nome)}</td><td>${esc(p.email || '—')}</td><td>${formatDateTime(p.data_ultimo_login)}</td></tr>`).join('')}</tbody></table>`
      : `<h2>Profissionais ativos</h2><p>${ativosList.length} ativos de ${profs.length} profissionais no mês.</p>`

  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Financeiro — ${esc(row.client_name)} — ${esc(monthLabel(refMonth))}</title>
<style>
  *{box-sizing:border-box}
  body{font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1a1a18;margin:32px;font-size:12px}
  h1{font-size:18px;margin:0}
  h2{font-size:15px;margin:16px 0 6px}
  .muted{color:#888780}
  .header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #173557;padding-bottom:10px}
  .cards{display:flex;gap:10px;margin:14px 0}
  .card{flex:1;border:1px solid #e8e7e3;border-radius:10px;padding:10px 12px}
  .card .label{font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#888780}
  .card .value{font-size:16px;font-weight:700;margin-top:2px}
  table{width:100%;border-collapse:collapse;margin-top:4px}
  th{background:#173557;color:#fff;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.05em;padding:6px 8px}
  td{border-bottom:1px solid #e8e7e3;padding:6px 8px;vertical-align:top}
  .num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
  ul{margin:4px 0 0 16px;padding:0}
  li{margin-bottom:4px}
  .footer{margin-top:24px;border-top:1px solid #e8e7e3;padding-top:8px;color:#888780;font-size:10px;display:flex;justify-content:space-between}
  @media print{body{margin:12mm}.no-print{display:none}}
</style></head><body>
<div class="header">
  <div>
    <h1>Financeiro · Faturamento</h1>
    <div><strong>${esc(row.client_name)}</strong></div>
    <div class="muted">${esc(row.cnpj || 'CNPJ —')} · SaaS_ID ${esc(row.saas_id || '—')}</div>
  </div>
  <div class="num muted">${esc(monthLabel(refMonth))}</div>
</div>
<div class="cards">
  <div class="card"><div class="label">MRR mínimo garantido</div><div class="value">${formatBRL(row.mrr_min)}</div></div>
  <div class="card"><div class="label">MRR real faturável</div><div class="value">${formatBRL(row.mrr_real)}</div></div>
  <div class="card"><div class="label">Excedente</div><div class="value">${formatBRL(row.excedente)}</div></div>
</div>
<h2>Séries do mês</h2>
${series.length
    ? `<table><thead><tr><th>Série</th><th>Plano</th><th>Modo</th><th class="num">Mínimo</th><th class="num">Uso</th><th class="num">Excedente</th><th class="num">Total</th></tr></thead><tbody>${seriesRows}</tbody></table>`
    : '<p class="muted">Sem séries no mês.</p>'}
<h2>Exceções vigentes</h2>${excecoesList}
<h2>Adimplência</h2>${paymentList}
${profBlock}
<div class="footer">
  <span>DoncCX Hub · Financeiro — ${esc(monthLabel(refMonth))}</span>
  <span>Gerado em ${new Date().toLocaleString('pt-BR')} · build ${esc(commit)}</span>
</div>
</body></html>`
}

async function exportPdfRow(row, refMonth, opts = {}) {
  const w = window.open('', '_blank')
  if (!w) {
    toast.error('Permita pop-ups para gerar o PDF')
    return
  }
  try {
    const detail = await fetchFinanceiroDetail(row.client_id, refMonth)
    w.document.write(buildPdfHtml(row, detail, refMonth, opts))
    w.document.close()
    w.focus()
    setTimeout(() => w.print(), 250)
  } catch (e) {
    w.close()
    toast.error('Erro ao gerar PDF: ' + e.message)
  }
}

// ─── KPI Card ───────────────────────────────────────────────────────────────────

const CARD_COLORS = {
  neutral:  { bg: 'bg-bg-secondary', text: 'text-text-secondary' },
  positive: { bg: 'bg-donc-verde/10', text: 'text-donc-verde' },
  negative: { bg: 'bg-donc-red/10',   text: 'text-donc-red' },
  muted:    { bg: 'bg-bg-secondary',  text: 'text-text-tertiary' },
}

function KpiCard({ icon: Icon, label, value, delta, sub, color, compact }) {
  const colorKey = color || CARD_COLORS.neutral
  const valueSize = compact ? 'text-sm font-semibold' : 'text-2xl font-bold'

  return (
    <div className="bg-bg-primary border border-border-tertiary rounded-xl px-5 py-4">
      <div className="flex items-center gap-2.5">
        <div className={`w-9 h-9 rounded-lg ${colorKey.bg} flex items-center justify-center flex-shrink-0`}>
          <Icon className={`w-5 h-5 ${colorKey.text}`} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className={`${valueSize} text-text-primary leading-tight tabular-nums truncate`}>
              {value ?? '—'}
            </span>
            {delta !== null && delta !== undefined && (
              <span className={`text-[11px] font-semibold flex-shrink-0 ${delta >= 0 ? 'text-donc-verde' : 'text-donc-red'}`}>
                {delta > 0 ? '+' : ''}{delta}%{delta >= 0 ? ' ▲' : ' ▼'}
              </span>
            )}
          </div>
          <div className="text-xs text-text-tertiary font-medium mt-0.5 truncate">{label}</div>
          {sub && <div className="text-xs text-text-tertiary mt-0.5 truncate">{sub}</div>}
        </div>
      </div>
    </div>
  )
}

// ─── Expanded client panel ─────────────────────────────────────────────────────

function seriesLabelFor(series, seriesId) {
  const match = (series || []).find(s => s.series_id === seriesId)
  return match?.label || null
}

function FinanceiroClientPanel({ clientId, refMonth, row, onClose }) {
  const { data, isLoading, error, refetch } = useFinanceiroDetalhe(clientId, refMonth, true)
  const qc = useQueryClient()
  const { effectiveRole } = useAuth()
  const canWrite = ['admin', 'finance'].includes(effectiveRole)
  const [excecaoModal, setExcecaoModal] = useState(null)
  const [paymentOpen, setPaymentOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [showProfs, setShowProfs] = useState(false)

  const invalidate = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['financeiro_detalhe', clientId, refMonth] })
    qc.invalidateQueries({ queryKey: ['financeiro_cockpit', refMonth] })
    qc.invalidateQueries({ queryKey: ['billing_payments', clientId] })
    qc.invalidateQueries({ queryKey: ['billing_payments_latest', clientId] })
  }, [qc, clientId, refMonth])

  if (isLoading) {
    return (
      <div className="bg-bg-primary border border-border-tertiary rounded-xl p-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-4 bg-bg-secondary rounded animate-pulse mb-3" />
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-bg-primary border border-border-tertiary rounded-xl p-5 text-sm text-donc-red">
        Erro ao carregar detalhe: {error.message}
        <button onClick={() => refetch()} className="ml-2 underline hover:no-underline">Tentar novamente</button>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="bg-bg-primary border border-border-tertiary rounded-xl p-8 text-center text-sm text-text-tertiary">
        Sem detalhe para este cliente.
      </div>
    )
  }

  const series = data.series || []
  const excecoes = data.excecoes || []
  const payment = data.payment || []
  const profissionais = data.profissionais || []
  const ativos = profissionais.filter((p) => p.ativo)
  const correctionPercent = row?.correction_percent ?? data.correction_percent
  const correctionAnniversary = row?.correction_anniversary ?? data.correction_anniversary
  const hasCorrection = correctionPercent !== null && correctionPercent !== undefined && correctionPercent !== ''
  const excecaoBadge = row?.excecao_desc
    || (excecoes.length > 0 ? excecaoLabel(excecoes[0].type, excecoes[0]) : null)
  const isLate = row?.payment_status === 'inadimplente' || Number(row?.delay_days) > 0
  const dd = deltaDisplay(row?.mrr_delta)

  return (
    <div id={`financeiro-detail-${clientId}`} className="bg-bg-primary border border-border-tertiary rounded-xl">
      {/* Header: veredito + ações */}
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 py-4 border-b border-border-tertiary">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-base font-bold text-text-primary truncate">{row?.client_name || 'Cliente'}</h3>
            {excecaoBadge && (
              <span className={BADGE_AMBER}>
                <Icons.AlertTriangle className="w-3 h-3 flex-shrink-0" />
                {excecaoBadge}
              </span>
            )}
            {hasCorrection && (
              <span className={BADGE_MUTED}>
                Reajuste {formatPercent(correctionPercent)} · {correctionAnniversary || '—'}
              </span>
            )}
          </div>
          <p className="text-sm text-text-secondary mt-1 tabular-nums">
            {formatBRL(row?.mrr_real)} faturado
            {row?.payment_status && (
              <span className={isLate ? 'text-donc-red' : 'text-donc-verde'}>
                {' · '}{isLate ? 'Inadimplente' : 'Adimplente'}
              </span>
            )}
            {row?.mrr_delta != null && (
              <span className={`ml-2 text-xs font-semibold ${dd.color}`}>{dd.text}{dd.arrow} vs mês anterior</span>
            )}
          </p>
          <p className="text-[11px] text-text-tertiary mt-1">
            {[row?.cnpj, row?.saas_id].filter(Boolean).join(' · ') || 'CNPJ/SaaS_ID —'} · {series.length} série{series.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {canWrite && (
            <Button size="sm" variant="primary" onClick={() => setExcecaoModal({ excecao: null })}>
              + Exceção
            </Button>
          )}
          <Button size="sm" variant="secondary" onClick={() => setPaymentOpen(true)}>
            Adimplência
          </Button>
          <div className="relative">
            <Button size="sm" variant="secondary" onClick={() => setExportOpen((v) => !v)}>
              <Icons.Download className="w-3.5 h-3.5" />
              Exportar
            </Button>
            {exportOpen && (
              <div className="absolute right-0 mt-1 w-44 bg-bg-primary border border-border-tertiary rounded-lg shadow-lg z-30 py-1">
                <button
                  onClick={() => {
                    csvAnaliticoRow({ row, refMonth }).catch((e) => toast.error('Erro no CSV: ' + e.message))
                    setExportOpen(false)
                  }}
                  className="w-full text-left px-3 py-2 text-sm text-text-primary hover:bg-bg-secondary"
                >
                  CSV analítico
                </button>
                <button
                  onClick={() => {
                    exportPdfRow(row, refMonth, { includeProfs: showProfs })
                    setExportOpen(false)
                  }}
                  className="w-full text-left px-3 py-2 text-sm text-text-primary hover:bg-bg-secondary"
                >
                  PDF
                </button>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar detalhe"
            className="p-2 text-text-tertiary hover:text-text-primary transition-colors"
          >
            <Icons.X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="p-5 space-y-6">
        {/* Resumo */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-lg border border-border-tertiary px-4 py-3">
            <p className="text-[11px] uppercase tracking-wider text-text-tertiary">MRR mínimo garantido</p>
            <p className="text-lg font-bold text-text-primary tabular-nums mt-0.5">{formatBRL(row?.mrr_min)}</p>
            <p className="text-[11px] text-text-tertiary">Piso {row?.billing_floor ?? 0} · {billingTypeLabel(row?.billing_type)}</p>
          </div>
          <div className="rounded-lg border border-border-tertiary px-4 py-3">
            <p className="text-[11px] uppercase tracking-wider text-text-tertiary">MRR real faturável</p>
            <p className="text-lg font-bold text-text-primary tabular-nums mt-0.5">{formatBRL(row?.mrr_real)}</p>
            <p className="text-[11px] text-text-tertiary">Uso {row?.uso_cur ?? 0} · Billable {row?.billable ?? '—'}</p>
          </div>
          <div className="rounded-lg border border-border-tertiary px-4 py-3">
            <p className="text-[11px] uppercase tracking-wider text-text-tertiary">Excedente</p>
            <p className={`text-lg font-bold tabular-nums mt-0.5 ${Number(row?.excedente) > 0 ? 'text-donc-verde' : 'text-text-primary'}`}>
              {formatBRL(row?.excedente)}
            </p>
            <p className="text-[11px] text-text-tertiary">Valor unit. {formatBRL(row?.valor_unit)}</p>
          </div>
        </div>

        {/* Séries */}
        <section>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-text-tertiary mb-2">Séries do mês</h4>
          {series.length === 0 ? (
            <p className="text-sm text-text-tertiary">Sem séries no mês.</p>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {series.map((s, i) => (
                <div key={s.series_id ?? i} className="rounded-lg border border-border-tertiary p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-text-primary truncate" title={s.label || ''}>{s.label || '—'}</p>
                      <p className="text-[11px] text-text-tertiary">
                        {s.kind} · {billingTypeLabel(s.billing_type)} · {seriesModeLabel(s.mode)}
                      </p>
                    </div>
                    <p className="text-base font-bold text-text-primary tabular-nums whitespace-nowrap">{formatBRL(s.total)}</p>
                  </div>
                  <div className="grid grid-cols-3 gap-2 mt-3">
                    <div>
                      <span className="block text-[11px] text-text-tertiary">Mínimo</span>
                      <span className="text-xs tabular-nums text-text-primary">{formatBRL(s.min)}</span>
                    </div>
                    <div>
                      <span className="block text-[11px] text-text-tertiary">Uso</span>
                      <span className="text-xs tabular-nums text-text-primary">{s.uso ?? '—'}</span>
                    </div>
                    <div>
                      <span className="block text-[11px] text-text-tertiary">Excedente</span>
                      <span className={`text-xs tabular-nums ${Number(s.excedente) > 0 ? 'text-donc-verde' : 'text-text-primary'}`}>
                        {formatBRL(s.excedente)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Exceções + Adimplência */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <section>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-text-tertiary mb-2">Exceções vigentes</h4>
            {excecoes.length === 0 ? (
              <p className="text-sm text-text-tertiary">Sem exceções no mês.</p>
            ) : (
              <ul className="space-y-2">
                {excecoes.map((ex, i) => (
                  <li key={ex.id ?? i} className="rounded-lg border border-border-tertiary px-3 py-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-text-primary">{excecaoLabel(ex.type, ex)}</span>
                      <span className={BADGE_MUTED}>
                        {ex.escopo === 'serie' ? (seriesLabelFor(series, ex.series_id) || 'série') : 'cliente'}
                      </span>
                      <span className="text-[11px] text-text-tertiary ml-auto">
                        {formatDate(ex.valid_from)} → {formatDate(ex.valid_to)}
                      </span>
                      {canWrite && (
                        <button
                          type="button"
                          onClick={() => setExcecaoModal({ excecao: ex })}
                          className="text-[11px] text-donc-sky hover:underline"
                        >
                          Editar
                        </button>
                      )}
                    </div>
                    <p className="text-xs text-text-secondary mt-1 truncate" title={ex.reason || ''}>{ex.reason || '—'}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-text-tertiary mb-2">Adimplência</h4>
            {payment.length === 0 ? (
              <p className="text-sm text-text-tertiary">Sem dados de adimplência no mês.</p>
            ) : (
              <ul className="space-y-2">
                {payment.map((p, i) => (
                  <li key={p.series_id ?? i} className="flex items-center gap-2 flex-wrap text-sm">
                    <span className="text-text-secondary">{seriesLabelFor(series, p.series_id) || 'Série'}</span>
                    <span className={p.status === 'adimplente' ? BADGE_GREEN : p.status === 'inadimplente' ? BADGE_RED : BADGE_MUTED}>
                      {p.status === 'adimplente'
                        ? 'Adimplente'
                        : p.status === 'inadimplente'
                          ? `Inadimplente${Number(p.delay_days) > 0 ? ` ${p.delay_days}d` : ''}`
                          : (p.status || '—')}
                    </span>
                    {p.paid_at && <span className="text-[11px] text-text-tertiary">pago em {formatDate(p.paid_at)}</span>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* Profissionais ativos (disclosure) */}
        {row?.billing_type === 'por_licenca' && (
          <section>
            <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                Profissionais ativos <span className="normal-case">({ativos.length} de {profissionais.length})</span>
              </h4>
              {ativos.length > 0 && (
                <Button size="xs" variant="secondary" onClick={() => setShowProfs((v) => !v)}>
                  {showProfs ? 'Ocultar lista' : `Ver lista completa (${ativos.length})`}
                </Button>
              )}
            </div>
            {profissionais.length === 0 ? (
              <p className="text-sm text-text-tertiary">Sem profissionais vinculados.</p>
            ) : showProfs ? (
              <div className="rounded-lg border border-border-tertiary overflow-hidden">
                <div className="max-h-72 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-donc-navy text-white sticky top-0 z-10">
                        <th scope="col" className="px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-wider">Nome</th>
                        <th scope="col" className="px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-wider">E-mail</th>
                        <th scope="col" className="px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-wider">Último login</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ativos.map((p, i) => (
                        <tr key={`${p.email || p.nome || 'prof'}-${i}`} className="border-b border-border-tertiary last:border-0 hover:bg-bg-secondary">
                          <td className="px-4 py-2 text-text-primary">{p.nome || '—'}</td>
                          <td className="px-4 py-2 text-text-secondary">{p.email || '—'}</td>
                          <td className="px-4 py-2 text-text-secondary whitespace-nowrap">{formatDateTime(p.data_ultimo_login)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <p className="text-sm text-text-tertiary">
                {ativos.length} ativos de {profissionais.length} profissionais no mês. Abra a lista para detalhar — o PDF inclui os profissionais apenas com a lista aberta.
              </p>
            )}
          </section>
        )}
      </div>

      <ExcecaoModal
        open={!!excecaoModal}
        onClose={() => setExcecaoModal(null)}
        clientId={clientId}
        clientName={row?.client_name}
        excecao={excecaoModal?.excecao || null}
        onSaved={invalidate}
      />
      <PaymentToggle
        open={paymentOpen}
        onClose={() => setPaymentOpen(false)}
        clientId={clientId}
        clientName={row?.client_name}
        refMonth={refMonth}
        series={series}
        payments={payment}
        canWrite={canWrite}
        onSaved={invalidate}
      />
    </div>
  )
}


// ─── Page ──────────────────────────────────────────────────────────────────────

export default function FinanceiroCockpitPage() {
  const navigate = useNavigate()
  const { effectiveRole } = useAuth()
  const { isEnabled } = useFeatureFlags()

  const [selectedMonth, setSelectedMonth] = useState(null)
  const [search, setSearch] = useState('')
  const [billingType, setBillingType] = useState('all')
  const [onlyExcedentes, setOnlyExcedentes] = useState(false)
  const [openClientId, setOpenClientId] = useState(null)
  const [csvDropdownOpen, setCsvDropdownOpen] = useState(false)
  const [exportView, setExportView] = useState('geral')
  const [exporting, setExporting] = useState(false)

  const fallbackMonth = defaultRefMonth()

  // Months-only probe (data query disabled with null refMonth); the real query
  // below reuses the same cached months query.
  const { months, monthsLoading } = useFinanceiroCockpit(null)
  const refMonth = selectedMonth
    || (months.length > 0 ? (months.includes(fallbackMonth) ? fallbackMonth : months[0]) : fallbackMonth)

  const { data: rows, isLoading, error, refetch } = useFinanceiroCockpit(refMonth)
  const { data: prevRows } = useFinanceiroCockpit(prevMonthOf(refMonth))
  const { data: lastSync } = useLastDoncSync(refMonth)

  // ─── Filtering ────────────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    let out = rows || []
    if (q) {
      out = out.filter(r =>
        (r.client_name || '').toLowerCase().includes(q) ||
        String(r.cnpj || '').toLowerCase().includes(q) ||
        String(r.saas_id || '').toLowerCase().includes(q)
      )
    }
    if (billingType !== 'all') out = out.filter(r => r.billing_type === billingType)
    if (onlyExcedentes) out = out.filter(r => (Number(r.excedente) || 0) > 0)
    return out
  }, [rows, search, billingType, onlyExcedentes])

  const filteredIds = useMemo(() => new Set(filtered.map(r => String(r.client_id))), [filtered])

  // ─── KPIs ─────────────────────────────────────────────────────────────────────

  const kpis = useMemo(() => {
    const sum = (arr, key) => arr.reduce((s, r) => s + (Number(r[key]) || 0), 0)
    const prevMatching = (prevRows || []).filter(r => filteredIds.has(String(r.client_id)))
    const late = filtered.filter(r => Number(r.delay_days) > 0)
    const totalMin = sum(filtered, 'mrr_min')
    const totalReal = sum(filtered, 'mrr_real')
    const totalExc = sum(filtered, 'excedente')
    return {
      totalMin,
      totalReal,
      totalExc,
      dMin: pctDelta(totalMin, sum(prevMatching, 'mrr_min')),
      dReal: pctDelta(totalReal, sum(prevMatching, 'mrr_real')),
      dExc: pctDelta(totalExc, sum(prevMatching, 'excedente')),
      aboveFloor: filtered.filter(r => Number(r.uso_cur) > Number(r.billing_floor)).length,
      withExcecao: filtered.filter(r => r.excecao_desc != null).length,
      lateCount: late.length,
      lateSum: sum(late, 'mrr_real'),
      renewals: filtered.filter(r => isRenewalWithin30d(r.contract_renewal)).length,
    }
  }, [filtered, prevRows, filteredIds])

  const formatMonthOption = useCallback((m) => monthLabel(m), [])

  // ─── Row expand ───────────────────────────────────────────────────────────────

  const toggleRow = useCallback((clientId) => {
    setOpenClientId((prev) => (prev === clientId ? null : clientId))
  }, [])

  const openRow = useMemo(
    () => (rows || []).find((r) => r.client_id === openClientId) || null,
    [rows, openClientId]
  )

  // Trocar o mês fecha o painel (dados de outro mês)
  useEffect(() => {
    setOpenClientId(null)
  }, [refMonth])

  // ─── CSV export ──────────────────────────────────────────────────────────────

  function csvSintetico(scopeRows) {
    const scoped = applyExportView(scopeRows, exportView)
    const header = [
      'Cliente', 'CNPJ', 'SaaS ID', 'Tipo', 'Piso', 'Uso', 'Billable', 'Valor unit.',
      'MRR mínimo', 'MRR real', 'Excedente', 'Exceção', 'Escopo', 'Adimplência', 'Δ',
    ]
    const lines = [csvLine(header)]
    scoped.forEach((r) => {
      const dd = deltaDisplay(r.mrr_delta)
      lines.push(csvLine([
        r.client_name,
        r.cnpj,
        r.saas_id,
        billingTypeLabel(r.billing_type),
        r.billing_floor,
        r.uso_cur ?? '',
        r.billable ?? '',
        formatBRL(r.valor_unit),
        formatBRL(r.mrr_min),
        formatBRL(r.mrr_real),
        formatBRL(r.excedente),
        r.excecao_desc,
        r.excecao_escopo === 'serie' ? 'série' : (r.excecao_escopo || ''),
        paymentText(r.payment_status, r.delay_days),
        `${dd.text}${dd.arrow}`,
      ]))
    })
    downloadFile(
      lines.join('\n'),
      `financeiro-sintetico-${exportView}-${refMonth}.csv`,
      'text/csv;charset=utf-8'
    )
  }

  // ─── Guard (defense-in-depth; CockpitRoute already gates the route) ──────────

  if (!isEnabled('cockpit_financeiro', effectiveRole) || !isEnabled('financial_data', effectiveRole)) {
    return <Navigate to="/module-unavailable" replace />
  }

  const monthDisplay = monthLabel(refMonth)

  if (error) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <BackButton navigate={navigate} />
        <PageHeader title="Financeiro · Faturamento" subtitle={monthDisplay} />
        <div className="mt-6 p-4 bg-donc-red/10 border border-donc-red/20 rounded-lg text-donc-red text-sm flex items-center gap-3">
          <Icons.AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>Erro ao carregar dados: {error.message}</span>
          <button onClick={() => refetch()} className="ml-auto underline hover:no-underline">
            Tentar novamente
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <BackButton navigate={navigate} />
      <PageHeader
        title="Financeiro · Faturamento"
        subtitle={monthDisplay}
        action={
          <Button
            size="sm"
            variant="lime"
            onClick={() => window.open('/help/financeiro-regras.html', '_blank', 'noopener')}
          >
            <Icons.FileQuestion className="w-3.5 h-3.5" />
            Como funciona a cobrança
          </Button>
        }
      />

      {/* KPI cards T1-T3 */}
      {isLoading && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-5">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-bg-primary border border-border-tertiary rounded-xl px-5 py-4 animate-pulse">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-lg bg-bg-secondary flex-shrink-0" />
                  <div className="flex-1">
                    <div className="h-6 bg-bg-secondary rounded w-20 mb-1" />
                    <div className="h-3 bg-bg-secondary rounded w-28" />
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="bg-bg-primary border border-border-tertiary rounded-xl px-5 py-4 animate-pulse">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-lg bg-bg-secondary flex-shrink-0" />
                  <div className="flex-1">
                    <div className="h-6 bg-bg-secondary rounded w-16 mb-1" />
                    <div className="h-3 bg-bg-secondary rounded w-24" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
      {!isLoading && (rows || []).length > 0 && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-5">
            <KpiCard
              icon={Icons.Wallet}
              label="MRR mínimo garantido"
              value={formatBRL(kpis.totalMin)}
              delta={kpis.dMin}
              sub={kpis.dMin === null ? '—' : undefined}
              color={CARD_COLORS.neutral}
            />
            <KpiCard
              icon={Icons.DollarSign}
              label="MRR real faturável"
              value={formatBRL(kpis.totalReal)}
              delta={kpis.dReal}
              sub={kpis.dReal === null ? '—' : undefined}
              color={kpis.totalExc > 0 ? CARD_COLORS.positive : CARD_COLORS.neutral}
            />
            <KpiCard
              icon={Icons.TrendingUp}
              label="Excedente"
              value={formatBRL(kpis.totalExc)}
              delta={kpis.dExc}
              sub={kpis.dExc === null ? '—' : undefined}
              color={kpis.totalExc > 0 ? CARD_COLORS.positive : CARD_COLORS.neutral}
            />
          </div>

          {/* Secondary stats T4-T7 */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
            <KpiCard
              icon={Icons.Users}
              label="Clientes acima do piso"
              value={kpis.aboveFloor}
              color={CARD_COLORS.neutral}
            />
            <KpiCard
              icon={Icons.Percent}
              label="Com exceção no mês"
              value={kpis.withExcecao}
              color={CARD_COLORS.neutral}
            />
            <KpiCard
              icon={Icons.AlertTriangle}
              label="Em atraso"
              value={kpis.lateCount}
              sub={formatBRL(kpis.lateSum)}
              color={kpis.lateCount > 0 ? CARD_COLORS.negative : CARD_COLORS.neutral}
            />
            <KpiCard
              icon={Icons.Clock}
              label="Renovações 30d"
              value={kpis.renewals}
              color={CARD_COLORS.neutral}
            />
          </div>
        </>
      )}

      {/* Toolbar */}
      <div className="mt-5 flex items-center gap-3 flex-wrap">
        {/* Month selector */}
        <select
          value={refMonth}
          onChange={e => { setSelectedMonth(e.target.value); setOpenSet(new Set()) }}
          className="text-sm border border-border-tertiary rounded-lg px-3 py-2 bg-bg-primary text-text-primary focus:outline-none focus:border-donc-purple"
        >
          {monthsLoading && <option value="">Carregando...</option>}
          {months.map(m => (
            <option key={m} value={m}>{formatMonthOption(m)}</option>
          ))}
        </select>

        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Icons.Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" />
          <input
            type="text"
            placeholder="Buscar cliente, CNPJ ou SaaS ID..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-border-tertiary rounded-lg bg-bg-primary text-text-primary focus:outline-none focus:border-donc-purple"
          />
        </div>

        {/* Billing type */}
        <select
          value={billingType}
          onChange={e => setBillingType(e.target.value)}
          className="text-sm border border-border-tertiary rounded-lg px-3 py-2 bg-bg-primary text-text-primary focus:outline-none focus:border-donc-purple"
        >
          <option value="all">Todos os tipos</option>
          <option value="por_licenca">Por licença</option>
          <option value="por_os">Por OS</option>
          <option value="mista">Mista</option>
        </select>

        {/* Only excedentes */}
        <div className="flex items-center gap-2 text-sm text-text-secondary">
          <Toggle value={onlyExcedentes} onChange={setOnlyExcedentes} />
          <span className="whitespace-nowrap">Só excedentes</span>
        </div>

        {/* CSV dropdown */}
        <div className="relative">
          <button
            onClick={() => setCsvDropdownOpen(!csvDropdownOpen)}
            className="flex items-center gap-1.5 text-sm border border-border-tertiary rounded-lg px-3 py-2 bg-bg-primary text-text-secondary hover:bg-bg-secondary transition-colors"
          >
            <Icons.FileDown className="w-4 h-4" />
            Exportar CSV
            <ChevronIcon open={csvDropdownOpen} />
          </button>
          {csvDropdownOpen && (
            <div className="absolute right-0 mt-1 w-64 bg-bg-primary border border-border-tertiary rounded-lg shadow-lg z-30 py-2">
              <div className="px-3 pb-1 text-[11px] font-medium text-text-tertiary uppercase tracking-wider">Visão</div>
              <div className="flex gap-1 px-3 pb-2">
                {EXPORT_VIEWS.map((v) => (
                  <button
                    key={v.key}
                    onClick={() => setExportView(v.key)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
                      exportView === v.key
                        ? 'bg-donc-navy text-white border-donc-navy'
                        : 'bg-bg-primary text-text-secondary border-border-tertiary hover:bg-bg-secondary'
                    }`}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
              <div className="border-t border-border-tertiary pt-1">
                <button
                  onClick={() => { csvSintetico(filtered); setCsvDropdownOpen(false) }}
                  className="w-full text-left px-3 py-2 text-sm text-text-primary hover:bg-bg-secondary"
                >
                  CSV sintético ({EXPORT_VIEWS.find((v) => v.key === exportView)?.label})
                </button>
                <button
                  disabled={exporting}
                  onClick={async () => {
                    setExporting(true)
                    try {
                      await csvAnaliticoGlobal({ refMonth, rows: filtered, view: exportView })
                    } catch (e) {
                      toast.error('Erro no CSV analítico: ' + e.message)
                    } finally {
                      setExporting(false)
                      setCsvDropdownOpen(false)
                    }
                  }}
                  className="w-full text-left px-3 py-2 text-sm text-text-primary hover:bg-bg-secondary disabled:opacity-50"
                >
                  {exporting ? 'Gerando…' : `CSV analítico (${EXPORT_VIEWS.find((v) => v.key === exportView)?.label})`}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Last sync timestamp */}
        <span className="ml-auto text-xs text-text-tertiary flex items-center gap-1 flex-shrink-0">
          <Icons.Clock className="w-3.5 h-3.5" />
          {lastSync?.finished_at ? (
            <>Última sincronização: {formatDateTime(lastSync.finished_at)}</>
          ) : (
            <span className="italic">Nunca sincronizado</span>
          )}
        </span>
      </div>

      {/* Sync failure banner (Q9) */}
      {lastSync?.status === 'failed' && (
        <div className="mt-3 flex items-center gap-2 px-3 py-2 bg-donc-amber/10 border border-donc-amber/30 rounded-lg text-donc-amber text-xs">
          <Icons.AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
          Uso de {monthDisplay} não sincronizou — contate o suporte DoncCX Hub
        </div>
      )}

      {/* Loading state */}
      {isLoading && (
        <div className="mt-5 bg-bg-primary border border-border-tertiary rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-donc-navy text-white text-xs uppercase tracking-wider">
                <th scope="col" className="w-8 px-3 py-2.5" />
                <th scope="col" className="px-4 py-2.5 text-left">Cliente</th>
                <th scope="col" className="px-4 py-2.5 text-center">Tipo</th>
                <th scope="col" className="px-4 py-2.5 text-center">Uso</th>
                <th scope="col" className="px-4 py-2.5 text-center whitespace-nowrap">MRR mínimo</th>
                <th scope="col" className="px-4 py-2.5 text-center whitespace-nowrap">MRR real</th>
                <th scope="col" className="px-4 py-2.5 text-center">Δ</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="animate-pulse">
                  <td className="px-3 py-2.5"><div className="h-3 w-3 bg-bg-secondary rounded" /></td>
                  <td className="px-4 py-2.5"><div className="h-3 bg-bg-secondary rounded w-2/3" /></td>
                  {Array.from({ length: 5 }).map((__, j) => (
                    <td key={j} className="px-4 py-2.5"><div className="h-3 bg-bg-secondary rounded" /></td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Mobile: client cards (no horizontal scroll) */}
      {!isLoading && filtered.length > 0 && (
        <div className="lg:hidden mt-5 space-y-3">
          {filtered.map((row) => {
            const isOpen = openClientId === row.client_id
            const dd = deltaDisplay(row.mrr_delta)
            const cardBorder = row.payment_status === 'inadimplente'
              ? 'border-donc-red/30'
              : row.excecao_desc
                ? 'border-donc-amber/40'
                : 'border-border-tertiary'
            return (
              <div key={row.client_id} className={`bg-bg-primary border ${cardBorder} rounded-xl`}>
                <button
                  type="button"
                  onClick={() => toggleRow(row.client_id)}
                  aria-expanded={isOpen}
                  aria-controls={`financeiro-detail-${row.client_id}`}
                  className="w-full text-left p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-text-primary truncate">{row.client_name}</p>
                      <p className="text-[11px] text-text-tertiary truncate">
                        {[row.cnpj, row.saas_id].filter(Boolean).join(' · ') || '—'}
                      </p>
                    </div>
                    <span className="text-sm font-bold tabular-nums whitespace-nowrap text-text-primary">{formatBRL(row.mrr_real)}</span>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap mt-2">
                    <span className="text-[11px] text-text-tertiary">{billingTypeLabel(row.billing_type)} · uso {row.uso_cur ?? 0}</span>
                    {row.excecao_desc && <span className={BADGE_AMBER}>{row.excecao_desc}</span>}
                    {row.payment_status === 'adimplente' && <span className={BADGE_GREEN}>Adimplente</span>}
                    {row.payment_status === 'inadimplente' && (
                      <span className={BADGE_RED}>Inadimplente{Number(row.delay_days) > 0 ? ` ${row.delay_days}d` : ''}</span>
                    )}
                    <span className={`ml-auto text-[11px] font-semibold ${dd.color}`}>{dd.text}{dd.arrow}</span>
                  </div>
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* Desktop table: 7 columns, fits the container (no horizontal scroll) */}
      {!isLoading && (rows || []).length > 0 && filtered.length > 0 && (
        <div className="hidden lg:block mt-5 bg-bg-primary border border-border-tertiary rounded-lg overflow-hidden">
          <table className="w-full text-sm table-fixed">
            <thead>
              <tr className="bg-donc-navy text-white text-xs uppercase tracking-wider">
                <th scope="col" className="w-8 px-3 py-2.5" />
                <th scope="col" className="px-4 py-2.5 text-left">Cliente</th>
                <th scope="col" className="w-28 px-4 py-2.5 text-center">Tipo</th>
                <th scope="col" className="w-20 px-4 py-2.5 text-center">Uso</th>
                <th scope="col" className="w-32 px-4 py-2.5 text-center whitespace-nowrap">MRR mínimo</th>
                <th scope="col" className="w-32 px-4 py-2.5 text-center whitespace-nowrap">MRR real</th>
                <th scope="col" className="w-16 px-4 py-2.5 text-center">Δ</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => {
                const isOpen = openClientId === row.client_id
                const dd = deltaDisplay(row.mrr_delta)
                const isZeroed = Number(row.mrr_real) === 0 && row.excecao_desc != null
                const rowBg = row.payment_status === 'inadimplente'
                  ? 'bg-donc-red/10'
                  : row.excecao_desc
                    ? 'bg-donc-amber/10'
                    : ''
                return (
                  <tr key={row.client_id} className={`border-b border-border-tertiary transition-colors hover:bg-bg-secondary ${rowBg}`}>
                    <td className="px-3 py-2.5 align-middle">
                      <button
                        type="button"
                        onClick={() => toggleRow(row.client_id)}
                        aria-expanded={isOpen}
                        aria-controls={`financeiro-detail-${row.client_id}`}
                        aria-label={isOpen ? 'Recolher detalhe' : 'Expandir detalhe'}
                        className="p-1 text-text-tertiary hover:text-text-primary transition-colors"
                      >
                        <ChevronIcon open={isOpen} />
                      </button>
                    </td>
                    <td className="px-4 py-2.5">
                      <button
                        type="button"
                        onClick={() => toggleRow(row.client_id)}
                        className="text-left min-w-0 w-full"
                      >
                        <div className="text-text-primary font-semibold truncate" title={row.client_name || ''}>{row.client_name}</div>
                        <div
                          className="text-[11px] text-text-tertiary truncate"
                          title={[row.cnpj, row.saas_id].filter(Boolean).join(' · ')}
                        >
                          {[row.cnpj, row.saas_id].filter(Boolean).join(' · ') || '—'}
                        </div>
                        {(row.excecao_desc || row.payment_status) && (
                          <div className="flex items-center gap-1 mt-1 flex-wrap">
                            {row.excecao_desc && <span className={BADGE_AMBER}>{row.excecao_desc}</span>}
                            {row.payment_status === 'adimplente' && <span className={BADGE_GREEN}>Adimplente</span>}
                            {row.payment_status === 'inadimplente' && (
                              <span className={BADGE_RED}>Inadimplente{Number(row.delay_days) > 0 ? ` ${row.delay_days}d` : ''}</span>
                            )}
                          </div>
                        )}
                      </button>
                    </td>
                    <td className="px-4 py-2.5 text-center text-text-secondary whitespace-nowrap">{billingTypeLabel(row.billing_type)}</td>
                    <td className="px-4 py-2.5 text-center tabular-nums text-text-primary">{row.uso_cur ?? '—'}</td>
                    <td className="px-4 py-2.5 text-center tabular-nums text-text-primary whitespace-nowrap">{formatBRL(row.mrr_min)}</td>
                    <td className="px-4 py-2.5 text-center tabular-nums text-text-primary whitespace-nowrap">
                      {isZeroed ? (
                        <>
                          <span className="font-semibold">{formatBRL(0)}</span>
                          <div className="text-[10px] font-normal text-text-tertiary">fatura zerada</div>
                        </>
                      ) : (
                        <span className="font-semibold">{formatBRL(row.mrr_real)}</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <span className={`text-[11px] font-semibold whitespace-nowrap ${dd.color}`}>{dd.text}{dd.arrow}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Expanded client panel (outside the table — no width/scroll coupling) */}
      {!isLoading && openRow && (
        <div className="mt-5">
          <FinanceiroClientPanel
            clientId={openRow.client_id}
            refMonth={refMonth}
            row={openRow}
            onClose={() => setOpenClientId(null)}
          />
        </div>
      )}

      {/* Empty state */}
      {!isLoading && filtered.length === 0 && (
        <div className="mt-5 bg-bg-primary border border-border-tertiary rounded-lg">
          <div className="text-center py-12 text-text-tertiary text-sm px-4">
            Nenhum cliente no mês selecionado
          </div>
        </div>
      )}
    </div>
  )
}
