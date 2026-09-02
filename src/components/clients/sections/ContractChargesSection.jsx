import { useMemo, useState } from 'react'
import { validateRulesContiguous, expandRulesToCharges, formatBRL4, getBaseTotal, calculateRuleTotal } from '@/lib/contractRules'
import { Icons } from '@/lib/icons'

const ROW = 'grid grid-cols-[3rem_4rem_1.5rem_4rem_12rem_9rem_1fr_2rem] items-center gap-2 min-w-[44rem]'

/**
 * "Evolução da recorrência (MRR)" — how much the client pays in each stretch of
 * the contract. Business language only: no table/column names.
 * The parent wraps this in a <FormSection> (title + duration + hint).
 */
export function ContractChargesSection({ N, rules, setRules, billingBaseValue, billingFloor }) {
  const [showPreview, setShowPreview] = useState(false)

  const baseTotal = getBaseTotal(billingBaseValue, billingFloor)

  const validation = useMemo(() => validateRulesContiguous(rules, N), [rules, N])

  const preview = useMemo(() => {
    if (!validation.ok) return []
    try {
      return expandRulesToCharges(rules, N).map(c => {
        const rule = rules.find(r => c.month_index >= r.from && c.month_index <= r.to)
        return { month_index: c.month_index, total: rule ? calculateRuleTotal(rule, baseTotal) : null }
      })
    } catch { return [] }
  }, [validation.ok, rules, N, baseTotal])

  function updateRule(idx, patch) {
    setRules(prev => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)))
  }
  function removeRule(idx) {
    setRules(prev => prev.filter((_, i) => i !== idx))
  }
  function addRule() {
    const lastTo = rules.length ? Math.max(...rules.map(r => r.to)) : 0
    const from = lastTo + 1
    if (from > N) return
    const defaultVal = baseTotal > 0 ? String(baseTotal) : String(billingBaseValue || '')
    setRules(prev => [...prev, { from, to: N, mode: 'absolute', value: defaultVal, label: '' }])
  }

  return (
    <div className="space-y-1.5 overflow-x-auto">
      {rules.length === 0 && (
        <p className="text-xs text-text-tertiary">
          Nenhum período definido — a recorrência é a mesma do mês 1 ao {N}.
        </p>
      )}

      {rules.map((r, idx) => (
        <div key={idx} className={ROW}>
          <span className="text-xs text-text-secondary">Do mês</span>
          <input
            type="number" min="1" max={N} value={r.from}
            onChange={e => updateRule(idx, { from: Number(e.target.value) })}
            className="input-base w-full text-center"
          />
          <span className="text-center text-xs text-text-tertiary">ao</span>
          <input
            type="number" min="1" max={N} value={r.to}
            onChange={e => updateRule(idx, { to: Number(e.target.value) })}
            className="input-base w-full text-center"
          />
          <select
            value={r.mode === 'percent' ? 'percent' : 'absolute'}
            onChange={e => {
              const mode = e.target.value
              let value = r.value
              if (mode === 'percent' && Number(value) > 100) {
                value = baseTotal > 0 && !isNaN(Number(value))
                  ? String(Math.min(100, Math.round((Number(value) / baseTotal) * 100)))
                  : '100'
              }
              if (mode === 'absolute' && r.mode === 'percent' && baseTotal > 0) {
                value = String(baseTotal)
              }
              updateRule(idx, { mode, value })
            }}
            className="input-base w-full"
          >
            <option value="absolute">Valor fixo (R$)</option>
            <option value="percent">% da recorrência</option>
          </select>
          <div className="flex items-center gap-1">
            <span className="w-4 text-xs text-text-tertiary">{r.mode === 'percent' ? '%' : 'R$'}</span>
            <input
              type="number" min="0"
              step={r.mode === 'percent' ? '1' : '0.01'}
              max={r.mode === 'percent' ? '100' : undefined}
              value={r.value}
              onChange={e => {
                let v = e.target.value
                if (r.mode === 'percent' && Number(v) > 100) v = '100'
                updateRule(idx, { value: v })
              }}
              className="input-base w-full text-right"
              placeholder={r.mode === 'percent' ? '80' : (formatBRL4(baseTotal).replace('R$', '').trim() || '2500')}
            />
          </div>
          <span className="truncate text-[11px] text-text-tertiary">
            {r.mode === 'percent' && baseTotal > 0 && r.value !== '' && `= ${formatBRL4(baseTotal * (Number(r.value) / 100))}/mês`}
          </span>
          <button
            type="button" onClick={() => removeRule(idx)}
            className="inline-flex items-center justify-center h-8 w-8 rounded border border-border-tertiary text-text-tertiary hover:bg-bg-secondary hover:text-donc-red"
            aria-label="Remover período"
          >
            <Icons.X size={14} />
          </button>
        </div>
      ))}

      <div className="flex gap-2 pt-1">
        <button type="button" onClick={addRule} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs border border-dashed border-border-secondary rounded hover:bg-bg-secondary">
          <Icons.Plus size={13} /> Adicionar período
        </button>
        {rules.length > 0 && preview.length > 0 && (
          <button type="button" onClick={() => setShowPreview(v => !v)} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border-tertiary rounded hover:bg-bg-secondary">
            {showPreview ? <Icons.EyeOff size={13} /> : <Icons.Eye size={13} />}
            {showPreview ? 'Ocultar' : 'Ver mês a mês'}
          </button>
        )}
      </div>

      {!validation.ok && rules.length > 0 && (
        <p className="text-xs text-donc-red bg-donc-red/10 border border-donc-red/20 rounded px-2 py-1.5">
          {/valor/i.test(validation.error || '')
            ? 'Informe um valor válido em todos os períodos.'
            : `Os períodos precisam cobrir do mês 1 ao ${N} sem falhas nem sobreposição.`}
        </p>
      )}

      {showPreview && validation.ok && preview.length > 0 && (
        <div className="border border-border-tertiary rounded overflow-hidden max-h-64 overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="bg-bg-secondary sticky top-0">
              <tr className="text-left text-text-tertiary">
                <th className="px-3 py-1.5 font-medium">Mês</th>
                <th className="px-3 py-1.5 font-medium">Recorrência</th>
              </tr>
            </thead>
            <tbody>
              {preview.slice(0, 60).map(p => (
                <tr key={p.month_index} className="border-t border-border-tertiary/50">
                  <td className="px-3 py-1.5">{p.month_index}</td>
                  <td className="px-3 py-1.5 font-medium text-donc-navy">{formatBRL4(p.total)}</td>
                </tr>
              ))}
              {preview.length > 60 && (
                <tr><td colSpan={2} className="px-3 py-1.5 text-text-tertiary">… mais {preview.length - 60} meses</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
