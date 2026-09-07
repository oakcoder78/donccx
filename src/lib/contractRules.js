// Helpers for contract motor: regras contíguas → expansão 1..N + validation

export const HANDOVER_KEYS = [
  'contexto',
  'como_trabalha',
  'problemas',
  'impactos',
  'necessidades',
  'resultados_esperados',
  'criterios_sucesso',
  'pessoas',
  'expectativas',
  'riscos',
  'motivo_compra',
]

export const HANDOVER_LABELS = {
  contexto: 'Contexto',
  como_trabalha: 'Como o cliente trabalha hoje?',
  problemas: 'Quais problemas o cliente quer resolver?',
  impactos: 'Quais são as consequências desses problemas?',
  necessidades: 'O que o cliente precisa que a solução resolva?',
  resultados_esperados: 'Quais resultados concretos o cliente espera alcançar?',
  criterios_sucesso: 'Como saberemos que o projeto foi bem-sucedido?',
  pessoas: 'Quem são os principais envolvidos?',
  expectativas: 'Que expectativas ou compromissos foram estabelecidos?',
  riscos: 'Quais riscos, resistências ou particularidades?',
  motivo_compra: 'Por que o cliente escolheu nossa solução?',
}

export function validateRulesContiguous(rules, N) {
  if (!rules || rules.length === 0) return { ok: false, error: 'Adicione ao menos uma regra de recorrência' }
  const sorted = [...rules].sort((a, b) => a.from - b.from)
  if (sorted[0].from !== 1) return { ok: false, error: `Primeira regra deve começar em 1 (atual ${sorted[0].from})`, gapAt: 1 }
  for (let i = 0; i < sorted.length; i++) {
    const r = sorted[i]
    if (r.from > r.to) return { ok: false, error: `Regra ${i + 1}: "de" (${r.from}) maior que "até" (${r.to})`, gapAt: r.from }
    if (r.from < 1 || r.to > N) return { ok: false, error: `Regra ${i + 1} fora do intervalo 1..${N}`, gapAt: r.from }
    if (i > 0) {
      const prev = sorted[i - 1]
      if (r.from !== prev.to + 1) return { ok: false, error: `Gap/overlap entre regras ${i} e ${i + 1}: esperado ${prev.to + 1}, veio ${r.from}`, gapAt: prev.to + 1 }
    }
    if (!['absolute','percent','base'].includes(r.mode)) return { ok: false, error: `Regra ${i + 1}: modo inválido ${r.mode}` }
    if (r.value == null || isNaN(Number(r.value)) || Number(r.value) <= 0) return { ok: false, error: `Regra ${i + 1}: valor inválido` }
  }
  const last = sorted[sorted.length - 1]
  if (last.to !== N) return { ok: false, error: `Última regra deve ir até ${N} (atual ${last.to})`, gapAt: last.to + 1 }
  return { ok: true }
}

export function expandRulesToCharges(rules, N, opts = {}) {
  const v = validateRulesContiguous(rules, N)
  if (!v.ok) throw new Error(v.error)
  const { seriesId = null, billingStart = null } = opts
  const charges = []
  const sorted = [...rules].sort((a, b) => a.from - b.from)
  for (const r of sorted) {
    for (let m = r.from; m <= r.to; m++) {
      const isBase = r.mode === 'base'
      charges.push({
        month_index: m,
        kind: 'recorrencia',
        mode: isBase ? 'absolute' : r.mode,
        amount: isBase || r.mode === 'absolute' ? Number(r.value) : null,
        percent: r.mode === 'percent' ? Number(r.value) : null,
        label: r.label || null,
        ...(seriesId ? { series_id: seriesId } : {}),
        ...(billingStart ? { ref_month: refMonth(billingStart, m) } : {}),
      })
    }
  }
  return charges
}

/** 'YYYY-MM-DD' + month_index (1-based, relativo à série) → 'YYYY-MM' */
export function refMonth(billingStartISO, monthIndex) {
  const [y, m] = String(billingStartISO || '').split('-').map(Number)
  if (!y || !m) throw new Error('billing_start inválido para derivar ref_month')
  const dt = new Date(y, m - 1 + (Number(monthIndex) - 1), 1)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`
}

/** 'YYYY-MM' do mês corrente (para MRR e cronograma) */
export function currentRefMonth(from = new Date()) {
  return `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, '0')}`
}

/** Nº de meses de billingStart ('YYYY-MM-DD') até dateISO ('YYYY-MM-DD'), mínimo 1 */
export function diffMonths(billingStartISO, dateISO) {
  const [y1, m1] = String(billingStartISO || '').split('-').map(Number)
  const [y2, m2] = String(dateISO || '').split('-').map(Number)
  if (!y1 || !m1 || !y2 || !m2) return 1
  return Math.max(1, (y2 - y1) * 12 + (m2 - m1) + 1)
}

/** 'YYYY-MM-DD' do mês `monthIndex` (1-based) a partir de billingStart */
export function monthDate(billingStartISO, monthIndex) {
  const [y, m] = String(billingStartISO || '').split('-').map(Number)
  if (!y || !m) return ''
  const dt = new Date(y, m - 1 + (Number(monthIndex) || 1) - 1, 1)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-01`
}

/** Último dia de billing_start + (N-1) meses → 'YYYY-MM-DD' (fim da cobrança) */
export function billingEnd(billingStartISO, N) {
  const [y, m] = String(billingStartISO || '').split('-').map(Number)
  if (!y || !m) return ''
  const dt = new Date(y, m + (Number(N) || 1) - 1, 0)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}

/** Reagrupa charges de recorrência em regras contíguas (inverso de expandRulesToCharges) */
export function regroupRecorrencia(charges) {
  const sorted = [...(charges || [])]
    .filter(c => c.kind === 'recorrencia')
    .sort((a, b) => a.month_index - b.month_index)
  if (sorted.length === 0) return { rules: [], N: 36 }
  const rules = []
  let cur = {
    from: sorted[0].month_index, to: sorted[0].month_index,
    mode: sorted[0].mode,
    value: String(sorted[0].mode === 'percent' ? sorted[0].percent : sorted[0].amount),
    label: sorted[0].label || '',
  }
  for (let i = 1; i < sorted.length; i++) {
    const c = sorted[i]
    const val = String(c.mode === 'percent' ? c.percent : c.amount)
    if (c.mode === cur.mode && val === cur.value && c.month_index === cur.to + 1) {
      cur.to = c.month_index
    } else {
      rules.push(cur)
      cur = { from: c.month_index, to: c.month_index, mode: c.mode, value: val, label: c.label || '' }
    }
  }
  rules.push(cur)
  return { rules, N: Math.max(...sorted.map(c => c.month_index)) }
}

/** Reagrupa charges de implantação em eventuais (startMonth = menor month_index do grupo) */
export function regroupEventuais(charges) {
  const impl = (charges || []).filter(c => c.kind === 'implantacao')
  if (impl.length === 0) return []
  const groups = {}
  impl.forEach((c, idx) => {
    const g = c.installment_group || `legacy-${c.id ?? idx}`
    if (!groups[g]) groups[g] = { label: c.label || 'Implantação', total: 0, installments: 0, startMonth: c.month_index, group: c.installment_group || null }
    groups[g].total += Number(c.amount) || 0
    groups[g].installments += 1
    groups[g].startMonth = Math.min(groups[g].startMonth, c.month_index)
  })
  return Object.values(groups).map(g => ({
    label: g.label, total: String(Math.round(g.total * 100) / 100),
    installments: g.installments, startMonth: g.startMonth, _group: g.group,
  }))
}

/** Expande eventuais em parcelas com mês de início próprio (centavos ajustados na última parcela) */
export function expandEventuais(list, { seriesId = null, billingStart = null } = {}) {
  const out = []
  ;(list || []).forEach(ev => {
    const total = Number(ev.total) || 0
    const inst = Math.max(1, Number(ev.installments) || 1)
    const start = Math.max(1, Number(ev.startMonth) || 1)
    const group = ev._group || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `ev-${Date.now()}-${Math.random()}`)
    const per = Math.floor((total / inst) * 100) / 100
    for (let i = 0; i < inst; i++) {
      const isLast = i === inst - 1
      const amount = isLast ? Number((total - per * (inst - 1)).toFixed(2)) : per
      const m = start + i
      out.push({
        month_index: m, kind: 'implantacao', mode: 'absolute', amount,
        label: ev.label || 'Implantação',
        installment_group: group, installments_total: inst,
        ...(seriesId ? { series_id: seriesId } : {}),
        ...(billingStart ? { ref_month: refMonth(billingStart, m) } : {}),
      })
    }
  })
  return out
}

/** Soma da recorrência de UMA série no ref_month (percent resolvido contra baseTotal) */
export function seriesMonthTotal(seriesCharges, refMonthStr, baseTotal) {
  const rows = (seriesCharges || []).filter(
    c => c.kind === 'recorrencia' && c.ref_month === refMonthStr
  )
  return rows.reduce((s, c) => {
    if (c.mode === 'percent') return s + ((Number(baseTotal) || 0) * Number(c.percent || 0)) / 100
    return s + (Number(c.amount) || 0)
  }, 0)
}

/**
 * MRR derivado = soma das séries ativas no mês corrente (base própria por série).
 * Sem regras em nenhuma série → MRR base da original (comportamento legado).
 * Série original sem regras + outra série com regras → base + valores.
 * Mês coberto por renegociação → original pausada (só a renegociação conta).
 */
export function resolveMRR({ billingStatus, baseTotal, series, refMonthStr }) {
  if (billingStatus !== 'ativo') return 0
  const list = (series || []).filter(s => !s.status || s.status === 'ativa')
  const anyRules = list.some(s => s.hasAnyRules)
  if (!anyRules) return baseTotal || 0
  const ref = refMonthStr || currentRefMonth()
  const renegMonths = new Set()
  list.forEach(s => {
    if (s.kind !== 'renegociacao') return
    ;(s.charges || []).forEach(c => {
      if (c.kind === 'recorrencia' && c.ref_month) renegMonths.add(c.ref_month)
    })
  })
  return list.reduce((sum, s) => {
    const base = s.baseTotal ?? baseTotal
    if (s.billingStatus && s.billingStatus !== 'ativo') return sum // série suspensa/não bilhetável
    if (s.kind === 'original' && renegMonths.has(ref)) return sum // pausada na janela
    if (s.hasAnyRules) return sum + seriesMonthTotal(s.charges, ref, base)
    return sum + (s.kind === 'original' ? base || 0 : 0)
  }, 0)
}

/** Janelas (ref_month inicial/final) de renegociações ativas — para validar sobreposição */
export function renegWindows(list) {
  return (list || [])
    .filter(s => s.kind === 'renegociacao' && (!s.status || s.status === 'ativa') && s.billing_start)
    .map(s => {
      const n = Number(s.N) || 0
      let end = null
      try {
        const [y, m] = String(s.billing_start).split('-').map(Number)
        const dt = new Date(y, m - 1 + Math.max(n - 1, 0), 1)
        end = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`
      } catch { end = null }
      return { start: String(s.billing_start).slice(0, 7), end, label: s.label }
    })
    .filter(w => w.start && w.end)
}

export function validateOsTiers(tiers) {
  if (!tiers || tiers.length === 0) return { ok: true }
  if (tiers.length > 5) return { ok: false, error: 'Máximo 5 tiers' }
  const sorted = [...tiers].sort((a, b) => a.tier_order - b.tier_order)
  for (let i = 0; i < sorted.length; i++) {
    const t = sorted[i]
    if (!t.limit_to || Number(t.limit_to) <= 0) return { ok: false, error: `Tier ${t.tier_order}: "Até" inválido` }
    if (!t.fixed_value || Number(t.fixed_value) <= 0) return { ok: false, error: `Tier ${t.tier_order}: valor inválido` }
    if (i > 0 && Number(t.limit_to) <= Number(sorted[i - 1].limit_to)) return { ok: false, error: `Tier ${t.tier_order}: "Até" deve ser crescente (anterior ${sorted[i - 1].limit_to})` }
  }
  return { ok: true }
}

export function getBaseTotal(billingBaseValue, billingFloor) {
  const per = Number(billingBaseValue) || 0
  const floor = Number(billingFloor) || 0
  if (floor > 0) return per * floor
  return per
}

export function calculateRuleTotal(rule, baseTotal) {
  if (!rule || baseTotal == null) return null
  if (rule.mode === 'percent') return baseTotal * (Number(rule.value) / 100)
  if (rule.mode === 'base') return baseTotal
  return Number(rule.value)
}

export function formatBRL4(n) {
  return Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 4 })
}

export const TI_TIPO_OPTIONS = [
  { value: 'interna', label: 'Interna' },
  { value: 'terceirizada', label: 'Terceirizada' },
  { value: 'hibrida', label: 'Híbrida' },
  { value: 'nao_possui', label: 'Não possui' },
]
