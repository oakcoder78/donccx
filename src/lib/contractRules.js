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

export function expandRulesToCharges(rules, N) {
  const v = validateRulesContiguous(rules, N)
  if (!v.ok) throw new Error(v.error)
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
      })
    }
  }
  return charges
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

export function formatBRL4(n) {
  return Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 4 })
}

export const TI_TIPO_OPTIONS = [
  { value: 'interna', label: 'Interna' },
  { value: 'terceirizada', label: 'Terceirizada' },
  { value: 'hibrida', label: 'Híbrida' },
  { value: 'nao_possui', label: 'Não possui' },
]
