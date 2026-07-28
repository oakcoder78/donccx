import { useState, useMemo, useCallback, Fragment, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useProfissionaisCockpit } from '@/hooks/useProfissionaisCockpit'
import { supabase } from '@/lib/supabaseClient'
import { PageHeader } from '@/components/ui/PageHeader'
import { Icons } from '@/lib/icons'

// ─── Helpers ───────────────────────────────────────────────────────────────────

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

function monthLabel(refMonth) {
  if (!refMonth) return ''
  const [year, month] = refMonth.split('-')
  const d = new Date(Number(year), Number(month) - 1, 1)
  return d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
}

function deltaDisplay(delta) {
  if (delta === null || delta === undefined) return { text: '—', color: 'text-text-tertiary', arrow: '' }
  const up = delta >= 0
  return {
    text: `${Math.abs(delta)}%`,
    color: up ? 'text-donc-verde' : 'text-donc-red',
    arrow: up ? ' ▲' : ' ▼',
  }
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

// ─── KPI Card ───────────────────────────────────────────────────────────────────

const CARD_COLORS = {
  neutral:  { bg: 'bg-bg-secondary', text: 'text-text-secondary' },
  positive: { bg: 'bg-donc-verde/10', text: 'text-donc-verde' },
  negative: { bg: 'bg-donc-red/10',   text: 'text-donc-red' },
  muted:    { bg: 'bg-bg-secondary',  text: 'text-text-tertiary' },
}

function KpiCard({ icon: Icon, label, value, delta, sub, color, compact, onClick }) {
  const colorKey = color || CARD_COLORS.neutral
  const valueSize = compact ? 'text-sm font-semibold' : 'text-2xl font-bold'

  return (
    <div
      className={`bg-bg-primary border border-border-tertiary rounded-xl px-5 py-4 ${onClick ? 'cursor-pointer hover:border-donc-purple/30 hover:shadow-sm transition-all' : ''}`}
      onClick={onClick}
    >
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

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function ProfissionaisCockpitPage() {
  const navigate = useNavigate()

  const prevMonthDefault = (() => {
    const d = new Date()
    d.setDate(1)
    d.setMonth(d.getMonth() - 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })()

  const [selectedMonth, setSelectedMonth] = useState(prevMonthDefault)
  const [search, setSearch] = useState('')
  const [openSet, setOpenSet] = useState(new Set())
  const [detailCache, setDetailCache] = useState({})
  const [csvDropdownOpen, setCsvDropdownOpen] = useState(false)

  const refMonth = selectedMonth
  const { months, monthsLoading, data: rows, isLoading, error } = useProfissionaisCockpit(refMonth)

  // Filter by search
  const filtered = useMemo(() => {
    if (!rows) return []
    if (!search.trim()) return rows
    const q = search.toLowerCase()
    return rows.filter(r => (r.client_name || '').toLowerCase().includes(q))
  }, [rows, search])

  // ─── KPI Cards ────────────────────────────────────────────────────────────────

  const highlightRef = useRef(null)

  const kpiCards = useMemo(() => {
    if (!rows || rows.length === 0) return null

    const totalCur = rows.reduce((s, r) => s + r.ativos_cur, 0)
    const totalPrev = rows.reduce((s, r) => s + r.ativos_prev, 0)
    const totalDelta = totalPrev > 0
      ? parseFloat(((totalCur - totalPrev) / totalPrev * 100).toFixed(1))
      : null

    const positive = rows
      .filter(r => r.ativos_delta !== null && r.ativos_delta > 0)
      .sort((a, b) => b.ativos_delta - a.ativos_delta)
    const topPos = positive[0] || null

    const negative = rows
      .filter(r => r.ativos_delta !== null && r.ativos_delta < 0)
      .sort((a, b) => a.ativos_delta - b.ativos_delta)
    const topNeg = negative[0] || null

    return { totalCur, totalPrev, totalDelta, topPos, topNeg }
  }, [rows])

  function scrollToClient(clientId) {
    if (highlightRef.current) {
      highlightRef.current.classList.remove('ring-2', 'ring-donc-purple', 'bg-donc-purple/5')
    }
    setSearch('')
    requestAnimationFrame(() => {
      const row = document.getElementById(`client-row-${clientId}`)
      if (row) {
        row.scrollIntoView({ behavior: 'smooth', block: 'center' })
        row.classList.add('ring-2', 'ring-donc-purple', 'bg-donc-purple/5')
        highlightRef.current = row
        setTimeout(() => {
          row.classList.remove('ring-2', 'ring-donc-purple', 'bg-donc-purple/5')
          highlightRef.current = null
        }, 2000)
      }
    })
  }

  // ─── Row expand / detail ─────────────────────────────────────────────────────

  async function loadDetail(clientId) {
    const key = String(clientId)
    setDetailCache(prev => ({ ...prev, [key]: { loading: true, error: null, data: null } }))
    try {
      const { data, error: rpcErr } = await supabase.rpc('get_profissionais_detalhe', {
        p_client_id: clientId,
        p_ref_month: refMonth,
      })
      if (rpcErr) throw rpcErr
      setDetailCache(prev => ({ ...prev, [key]: { loading: false, error: null, data: data || [] } }))
    } catch (e) {
      setDetailCache(prev => ({ ...prev, [key]: { loading: false, error: e, data: null } }))
    }
  }

  function toggleRow(clientId) {
    setOpenSet(prev => {
      const next = new Set(prev)
      if (next.has(clientId)) {
        next.delete(clientId)
      } else {
        next.add(clientId)
        const key = String(clientId)
        if (!detailCache[key]) loadDetail(clientId)
      }
      return next
    })
  }

  // ─── Last sync ────────────────────────────────────────────────────────────────

  const { data: lastSync } = useQuery({
    queryKey: ['last_donc_sync', refMonth],
    queryFn: () => supabase
      .from('sync_service_log')
      .select('finished_at')
      .eq('service_name', 'donc-api')
      .eq('ref_month', refMonth)
      .eq('status', 'success')
      .order('finished_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    staleTime: 60_000,
    enabled: !!refMonth,
  })

  // ─── CSV export ──────────────────────────────────────────────────────────────

  function csvSintetico(scopeRows) {
    const header = ['Cliente', 'Ativos', '\u0394 Ativos', 'Com acesso no mes', '\u0394 Acesso', 'Com OS no mes', '\u0394 OS']
    const lines = [header.join('\t')]
    scopeRows.forEach(r => {
      const ad = deltaDisplay(r.ativos_delta)
      const acd = deltaDisplay(r.acesso_delta)
      const od = deltaDisplay(r.os_delta)
      lines.push([
        r.client_name, r.ativos_cur, `${ad.text}${ad.arrow}`,
        r.acesso_cur, `${acd.text}${acd.arrow}`,
        r.os_cur, `${od.text}${od.arrow}`,
      ].join('\t'))
    })
    downloadFile(lines.join('\n'), `profissionais-sintetico-${refMonth}.csv`, 'text/csv;charset=utf-8')
  }

  async function csvAnalitico(scopeRows) {
    // If individual client row, use cached detail data
    if (scopeRows.length === 1) {
      const key = String(scopeRows[0].client_id)
      const cached = detailCache[key]
      const profs = cached?.data || []
      const header = ['Cliente', 'Nome', 'Email', 'Ativo', 'Ultimo Login', 'Ultima OS', 'Codigo OS']
      const lines = [header.join('\t')]
      profs.forEach(p => {
        lines.push([
          scopeRows[0].client_name, p.nome, p.email || '', p.ativo ? 'Sim' : 'Nao',
          p.data_ultimo_login || '', p.data_ultima_os || '', p.codigo_ultima_os || '',
        ].join('\t'))
      })
      downloadFile(lines.join('\n'), `profissionais-analitico-${scopeRows[0].client_name}-${refMonth}.csv`, 'text/csv;charset=utf-8')
      return
    }
    // All clients — use RPC
    try {
      const { data, error: rpcErr } = await supabase.rpc('get_profissionais_export', {
        p_ref_month: refMonth,
      })
      if (rpcErr) throw rpcErr
      const profs = data || []
      const header = ['Cliente', 'Nome', 'Email', 'Ativo', 'Ultimo Login', 'Ultima OS', 'Codigo OS']
      const lines = [header.join('\t')]
      profs.forEach(p => {
        lines.push([
          p.client_name, p.nome, p.email || '', p.ativo ? 'Sim' : 'Nao',
          p.data_ultimo_login || '', p.data_ultima_os || '', p.codigo_ultima_os || '',
        ].join('\t'))
      })
      downloadFile(lines.join('\n'), `profissionais-analitico-${refMonth}.csv`, 'text/csv;charset=utf-8')
    } catch (e) {
      alert('Erro ao exportar: ' + (e.message || e))
    }
    setCsvDropdownOpen(false)
  }

  // ─── PDF export (individual) ─────────────────────────────────────────────────

  function exportPdf(row) {
    const key = String(row.client_id)
    const cached = detailCache[key]
    const profs = cached?.data || []

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Profissionais - ${row.client_name}</title>
<style>
  body { font-family: -apple-system, sans-serif; padding: 20px; color: #1e293b; }
  h1 { font-size: 18px; margin-bottom: 4px; }
  h2 { font-size: 13px; color: #64748b; font-weight: normal; margin-bottom: 16px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th { background: #1e293b; color: white; padding: 8px 10px; text-align: left; font-size: 10px; text-transform: uppercase; }
  td { padding: 6px 10px; border-bottom: 1px solid #e2e8f0; }
  .summary { display: flex; gap: 24px; margin-bottom: 20px; }
  .summary-box { border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 16px; }
  .summary-box .label { font-size: 11px; color: #64748b; }
  .summary-box .value { font-size: 20px; font-weight: 600; }
  @media print { .no-print { display: none; } }
</style></head><body>
  <h1>Profissionais · ${row.client_name}</h1>
  <h2>${monthLabel(refMonth)}</h2>
  <div class="summary">
    <div class="summary-box"><div class="label">Ativos</div><div class="value">${row.ativos_cur}</div></div>
    <div class="summary-box"><div class="label">Com acesso no mes</div><div class="value">${row.acesso_cur}</div></div>
    <div class="summary-box"><div class="label">Com OS no mes</div><div class="value">${row.os_cur}</div></div>
  </div>
  <table><thead><tr><th>Nome</th><th>Email</th><th>Ativo</th><th>Ultimo Login</th><th>Ultima OS</th><th>Codigo OS</th></tr></thead><tbody>
    ${profs.map(p => `<tr><td>${p.nome}</td><td>${p.email || ''}</td><td>${p.ativo ? 'Sim' : 'Nao'}</td><td>${p.data_ultimo_login || ''}</td><td>${p.data_ultima_os || ''}</td><td>${p.codigo_ultima_os || ''}</td></tr>`).join('')}
  </tbody></table>
</body></html>`

    const w = window.open('', '_blank', 'width=900,height=700')
    if (w) {
      w.document.write(html)
      w.document.close()
      setTimeout(() => w.print(), 500)
    }
  }

  // ─── Render helpers ──────────────────────────────────────────────────────────

  const formatMonthOption = useCallback((m) => {
    return monthLabel(m) + ' (' + m + ')'
  }, [])

  // ─── Render ──────────────────────────────────────────────────────────────────

  if (error) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <BackButton navigate={navigate} />
        <PageHeader title="Profissionais · Faturamento" description="Dados de profissionais por cliente" />
        <div className="mt-6 p-4 bg-donc-red/10 border border-donc-red/20 rounded-lg text-donc-red text-sm">
          Erro ao carregar dados: {error.message}
        </div>
      </div>
    )
  }

  const monthDisplay = monthLabel(refMonth)

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <BackButton navigate={navigate} />
      <PageHeader title="Profissionais · Faturamento" description={monthDisplay ? `Dados de ${monthDisplay}` : 'Dados de profissionais por cliente'} />

      {/* KPI Summary Cards */}
      {isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-5">
          {[1,2,3].map(i => (
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
      )}
      {!isLoading && kpiCards && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-5">
          <KpiCard
            icon={Icons.Users}
            label="Profissionais Ativos (Total)"
            value={kpiCards.totalCur.toLocaleString('pt-BR')}
            delta={kpiCards.totalDelta}
            sub={`em ${rows?.length || 0} cliente${rows?.length !== 1 ? 's' : ''}`}
            color={CARD_COLORS.neutral}
          />
          <KpiCard
            icon={Icons.TrendingUp}
            label="Maior Variação Positiva"
            value={kpiCards.topPos ? kpiCards.topPos.client_name : 'Nenhuma'}
            delta={kpiCards.topPos?.ativos_delta ?? undefined}
            sub={kpiCards.topPos ? `de ${kpiCards.topPos.ativos_prev} para ${kpiCards.topPos.ativos_cur} ativos` : 'variação positiva'}
            color={kpiCards.topPos ? CARD_COLORS.positive : CARD_COLORS.muted}
            compact
            onClick={kpiCards.topPos ? () => scrollToClient(kpiCards.topPos.client_id) : undefined}
          />
          <KpiCard
            icon={Icons.TrendingDown}
            label="Maior Variação Negativa"
            value={kpiCards.topNeg ? kpiCards.topNeg.client_name : 'Nenhuma'}
            delta={kpiCards.topNeg?.ativos_delta ?? undefined}
            sub={kpiCards.topNeg ? `de ${kpiCards.topNeg.ativos_prev} para ${kpiCards.topNeg.ativos_cur} ativos` : 'variação negativa'}
            color={kpiCards.topNeg ? CARD_COLORS.negative : CARD_COLORS.muted}
            compact
            onClick={kpiCards.topNeg ? () => scrollToClient(kpiCards.topNeg.client_id) : undefined}
          />
        </div>
      )}

      {/* Toolbar */}
      <div className="mt-5 flex items-center gap-3 flex-wrap">
        {/* Month selector */}
        <select
          value={refMonth}
          onChange={e => { setSelectedMonth(e.target.value); setOpenSet(new Set()); setDetailCache({}) }}
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
            placeholder="Buscar cliente..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-border-tertiary rounded-lg bg-bg-primary text-text-primary focus:outline-none focus:border-donc-purple"
          />
        </div>

        {/* Last sync timestamp */}
        {lastSync?.finished_at && (
          <span className="ml-auto text-xs text-text-tertiary flex items-center gap-1 flex-shrink-0">
            <Icons.Clock className="w-3.5 h-3.5" />
            Última sinc: {new Date(lastSync.finished_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', timeZoneName: 'short' })}
          </span>
        )}

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
            <div className="absolute right-0 mt-1 w-56 bg-bg-primary border border-border-tertiary rounded-lg shadow-lg z-30 py-1">
              <button
                onClick={() => { csvSintetico(filtered); setCsvDropdownOpen(false) }}
                className="w-full text-left px-3 py-2 text-sm text-text-primary hover:bg-bg-secondary"
              >
                Sinterico (todos os clientes)
              </button>
              <button
                onClick={() => { csvAnalitico(filtered); setCsvDropdownOpen(false) }}
                className="w-full text-left px-3 py-2 text-sm text-text-primary hover:bg-bg-secondary"
              >
                Analitico (todos os clientes)
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="mt-5 bg-bg-primary border border-border-tertiary rounded-lg overflow-hidden">
          <div className="overflow-x-auto w-full">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-donc-navy text-white text-xs uppercase tracking-wider">
                  <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-white w-8" />
                  <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-white">Cliente</th>
                  <th className="px-4 py-2.5 text-center text-xs font-semibold uppercase tracking-wider text-white w-28">Ativos</th>
                  <th className="px-4 py-2.5 text-center text-xs font-semibold uppercase tracking-wider text-white w-32">Acesso no mes</th>
                  <th className="px-4 py-2.5 text-center text-xs font-semibold uppercase tracking-wider text-white w-32">OS no mes</th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="px-4 py-2.5"><div className="h-3 bg-bg-secondary rounded" /></td>
                    <td className="px-4 py-2.5"><div className="h-3 bg-bg-secondary rounded w-2/3" /></td>
                    <td className="px-4 py-2.5"><div className="h-5 bg-bg-secondary rounded" /></td>
                    <td className="px-4 py-2.5"><div className="h-3 bg-bg-secondary rounded" /></td>
                    <td className="px-4 py-2.5"><div className="h-3 bg-bg-secondary rounded" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Table */}
      {!isLoading && filtered.length > 0 && (
        <div className="mt-5 bg-bg-primary border border-border-tertiary rounded-lg overflow-hidden">
          <div className="overflow-x-auto w-full">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-donc-navy text-white text-xs uppercase tracking-wider">
                  <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-white w-8" />
                  <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-white">Cliente</th>
                  <th className="px-4 py-2.5 text-center text-xs font-semibold uppercase tracking-wider text-white w-28">Ativos</th>
                  <th className="px-4 py-2.5 text-center text-xs font-semibold uppercase tracking-wider text-white w-32">Acesso no mes</th>
                  <th className="px-4 py-2.5 text-center text-xs font-semibold uppercase tracking-wider text-white w-32">OS no mes</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={5} className="text-center py-12 text-text-tertiary text-sm px-4">
                      {search.trim()
                        ? 'Nenhum cliente encontrado para esta busca.'
                        : `Nenhum dado de profissionais encontrado para ${monthDisplay}.`}
                    </td>
                  </tr>
                )}
                {filtered.map(row => {
                  const isOpen = openSet.has(row.client_id)
                  const key = String(row.client_id)
                  const detail = detailCache[key] || { loading: false, error: null, data: null }
                  const dAtivos = deltaDisplay(row.ativos_delta)
                  const dAcesso = deltaDisplay(row.acesso_delta)
                  const dOS = deltaDisplay(row.os_delta)

                  return (
                    <Fragment key={row.client_id}>
                      <tr
                        id={`client-row-${row.client_id}`}
                        onClick={() => toggleRow(row.client_id)}
                        className={`border-b border-border-tertiary transition-colors hover:bg-bg-secondary cursor-pointer${row.ativos_delta != null && row.ativos_delta < -35 ? ' bg-donc-red/10' : ''}`}
                      >
                        <td className="px-4 py-2.5">
                          <ChevronIcon open={isOpen} />
                        </td>
                        <td className="px-4 py-2.5 text-text-primary font-medium truncate max-w-[200px]">
                          {row.client_name}
                        </td>
                        <td className="px-4 py-2.5 text-center font-semibold tabular-nums text-text-primary whitespace-nowrap">
                          {row.ativos_cur}
                          <span className={`ml-1.5 text-[11px] font-semibold flex-shrink-0 ${dAtivos.color}`}>
                            {dAtivos.text}{dAtivos.arrow}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-center font-semibold tabular-nums text-text-primary whitespace-nowrap">
                          {row.acesso_cur}
                          <span className={`ml-1.5 text-[11px] font-semibold flex-shrink-0 ${dAcesso.color}`}>
                            {dAcesso.text}{dAcesso.arrow}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-center font-semibold tabular-nums text-text-primary whitespace-nowrap">
                          {row.os_cur}
                          <span className={`ml-1.5 text-[11px] font-semibold flex-shrink-0 ${dOS.color}`}>
                            {dOS.text}{dOS.arrow}
                          </span>
                        </td>
                      </tr>

                      {/* Expanded detail row */}
                      {isOpen && (
                        <tr>
                          <td colSpan={5} className="p-0 border-b border-border-tertiary bg-bg-secondary/20">
                            {detail.loading && (
                              <div className="px-4 py-6 text-center text-sm text-text-tertiary">
                                <Icons.Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
                                Carregando profissionais de {row.client_name}... pode levar alguns segundos
                              </div>
                            )}

                            {detail.error && (
                              <div className="px-4 py-4 text-sm text-donc-red">
                                Erro ao carregar profissionais: {detail.error.message}
                                <button
                                  onClick={() => loadDetail(row.client_id)}
                                  className="ml-2 underline hover:no-underline"
                                >
                                  Tentar novamente
                                </button>
                              </div>
                            )}

                            {!detail.loading && !detail.error && detail.data && (
                              <div>
                                <div className="flex items-center gap-1.5 px-4 py-2 border-b border-border-tertiary bg-bg-tertiary/60">
                                  <span className="text-[11px] font-medium text-text-tertiary uppercase tracking-wider mr-1">Exportar</span>
                                  <button
                                    onClick={() => csvSintetico([row])}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-md text-text-secondary bg-bg-primary border border-border-tertiary hover:border-donc-navy/30 hover:text-donc-navy transition-colors"
                                  >
                                    <Icons.FileDown className="w-3 h-3" />
                                    CSV Sintetico
                                  </button>
                                  <button
                                    onClick={() => csvAnalitico([row])}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-md text-text-secondary bg-bg-primary border border-border-tertiary hover:border-donc-navy/30 hover:text-donc-navy transition-colors"
                                  >
                                    <Icons.FileDown className="w-3 h-3" />
                                    CSV Analitico
                                  </button>
                                  <button
                                    onClick={() => exportPdf(row)}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-md text-text-secondary bg-bg-primary border border-border-tertiary hover:border-donc-navy/30 hover:text-donc-navy transition-colors"
                                  >
                                    <Icons.Download className="w-3 h-3" />
                                    PDF
                                  </button>
                                  <span className="text-[11px] text-text-tertiary ml-auto">{detail.data.length} profissionais</span>
                                </div>
                                <div className="overflow-x-auto">
                                  <table className="w-full text-sm">
                                    <thead>
                                      <tr className="bg-donc-navy/70 text-white">
                                        <th className="px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-white/90">Nome</th>
                                        <th className="px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-white/90">Email</th>
                                        <th className="px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-white/90">Ultimo Login</th>
                                        <th className="px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-white/90">Ultima OS</th>
                                        <th className="px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-white/90">Codigo OS</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {detail.data.map((p, i) => (
                                        <tr key={i} className="border-b border-border-tertiary transition-colors hover:bg-bg-secondary">
                                          <td className="px-4 py-2 text-text-primary">{p.nome}</td>
                                          <td className="px-4 py-2 text-text-secondary">{p.email || '—'}</td>
                                          <td className="px-4 py-2 text-text-secondary">{p.data_ultimo_login ? new Date(p.data_ultimo_login).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                                          <td className="px-4 py-2 text-text-secondary">{p.data_ultima_os ? new Date(p.data_ultima_os).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                                          <td className="px-4 py-2 text-text-secondary">{p.codigo_ultima_os || '—'}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Empty state — only when no loading and no data at all */}
      {!isLoading && (!rows || rows.length === 0) && (
        <div className="mt-6 text-text-tertiary text-sm">
          Nenhum dado de profissionais encontrado para {monthDisplay}.
        </div>
      )}
    </div>
  )
}
