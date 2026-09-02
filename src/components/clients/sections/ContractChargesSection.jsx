import { useMemo, useState } from 'react'
import { validateRulesContiguous, expandRulesToCharges, formatBRL4, getBaseTotal, calculateRuleTotal } from '@/lib/contractRules'

export function ContractChargesSection({ N, setN, rules, setRules, billingBaseValue, billingFloor, billingType }) {
  const [showPreview, setShowPreview] = useState(false)

  const basePerLicenca = Number(billingBaseValue) || 0
  const floor = Number(billingFloor) || 0
  const baseTotal = getBaseTotal(billingBaseValue, billingFloor)
  const baseLabel = floor > 0
    ? `${floor} lic × ${formatBRL4(basePerLicenca)} = ${formatBRL4(baseTotal)} base total`
    : basePerLicenca ? `${formatBRL4(basePerLicenca)}/licença (sem piso)` : 'Informe valor base e piso'

  const validation = useMemo(() => validateRulesContiguous(rules, N), [rules, N])

  let preview = []
  let previewError = null
  if (validation.ok) {
    try {
      const charges = expandRulesToCharges(rules, N)
      // enrich with calculated total for display
      preview = charges.map(c => {
        const rule = rules.find(r => c.month_index >= r.from && c.month_index <= r.to)
        const calc = rule ? calculateRuleTotal(rule, baseTotal) : null
        return { ...c, calculated: calc, ruleMode: rule?.mode, ruleValue: rule?.value }
      })
    } catch (e) { previewError = e.message }
  }

  function updateRule(idx, patch) {
    setRules(prev => prev.map((r, i) => i === idx ? { ...r, ...patch } : r))
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

  function addEventual() {
    // Eventuais handled via same charges table with kind=implantacao
    // For labs Phase 3 preview, just add a recorrencia rule example: implantação as first month(s)
    const from = 1
    const to = Math.min(1, N)
    setRules(prev => [{ from, to, mode: 'absolute', value: '5000', label: 'Implantação' }, ...prev.map(r => ({ ...r, from: r.from + to, to: r.to + to })).filter(r => r.from <= N)])
  }

  return (
    <div className="border border-border-tertiary rounded-lg overflow-hidden">
      <div className="bg-bg-secondary px-3 py-2 border-b border-border-tertiary flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-text-primary">Motor de contrato — recorrência</p>
          <p className="text-xs text-text-tertiary">Regras contíguas 1..N (valor <b>total no mês</b> — absoluto ou % do base). Motor expande para <code>contract_charges</code>.</p>
          <p className="text-xs font-medium mt-1">
            <span className="text-donc-navy">{baseLabel}</span>
            {billingType === 'por_os' && <span className="text-text-tertiary font-normal"> · por OS (tiers se aplicável)</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-text-secondary">Duração</label>
          <input type="number" min="1" max="120" value={N} onChange={e => setN(Math.min(120, Math.max(1, Number(e.target.value) || 1)))} className="input-base w-20 text-center" />
          <span className="text-xs text-text-tertiary">meses</span>
        </div>
      </div>

      <div className="p-3 space-y-2">
        <div className="grid grid-cols-12 gap-2 text-[11px] font-semibold text-text-tertiary uppercase tracking-wider px-1">
          <span className="col-span-2">De</span>
          <span className="col-span-2">Até</span>
          <span className="col-span-3">Modo</span>
          <span className="col-span-4">Valor</span>
          <span className="col-span-1">Ações</span>
        </div>

        {rules.length === 0 && (
          <p className="text-xs text-text-tertiary px-1">Nenhuma regra. Clique em + Adicionar regra.</p>
        )}

        {rules.map((r, idx) => (
          <div key={idx} className="grid grid-cols-12 gap-2 items-start">
            <input type="number" min="1" max={N} value={r.from} onChange={e => updateRule(idx, { from: Number(e.target.value) })} className="input-base col-span-2 text-center" />
            <input type="number" min="1" max={N} value={r.to} onChange={e => updateRule(idx, { to: Number(e.target.value) })} className="input-base col-span-2 text-center" />
            <select value={r.mode} onChange={e => {
              const newMode = e.target.value
              // quando troca para percentual, clamp/convert: se valor atual >100, reseta para 100 ou calcula % equivalente
              let newVal = r.value
              if (newMode === 'percent' && Number(r.value) > 100) {
                // se era absoluto (ex: 4000), sugere 100% ou calcula % do base
                if (baseTotal > 0 && !isNaN(Number(r.value))) newVal = String(Math.min(100, Math.round((Number(r.value)/baseTotal)*100)))
                else newVal = '100'
              }
              updateRule(idx, { mode: newMode, value: newVal })
            }} className="input-base col-span-3">
              <option value="absolute">Valor total no mês (R$)</option>
              <option value="percent">% do base total</option>
              <option value="base">Valor base total</option>
            </select>
            <div className="col-span-4">
              <div className="flex items-center gap-1">
                <span className="text-xs text-text-tertiary">{r.mode === 'percent' ? '%' : 'R$'}</span>
                <input
                  type="number"
                  step={r.mode === 'percent' ? '1' : '0.01'}
                  min="0"
                  max={r.mode === 'percent' ? '100' : undefined}
                  value={r.value}
                  onChange={e => {
                    let v = e.target.value
                    if (r.mode === 'percent' && Number(v) > 100) v = '100'
                    updateRule(idx, { value: v })
                  }}
                  className="input-base flex-1 text-right"
                  placeholder={r.mode === 'percent' ? '80' : formatBRL4(baseTotal).replace('R$','').trim() || '2500'}
                />
              </div>
              {r.mode === 'percent' && baseTotal > 0 && r.value !== '' && (
                <div className="mt-1 text-[11px] font-medium text-donc-verde bg-donc-verde/10 border border-donc-verde/20 rounded px-1.5 py-0.5 inline-block">
                  → {formatBRL4(baseTotal * (Number(r.value) / 100))} no mês
                </div>
              )}
              {r.mode === 'absolute' && floor > 0 && basePerLicenca > 0 && r.value !== '' && (
                <div className="mt-1 text-[11px] text-text-tertiary">
                  → {formatBRL4(Number(r.value) / floor)}/lic.
                </div>
              )}
            </div>
            <div className="col-span-1 flex justify-center pt-1">
              <button type="button" onClick={() => removeRule(idx)} className="px-2 py-1.5 text-xs border border-border-tertiary rounded hover:bg-bg-secondary leading-none">✕</button>
            </div>
          </div>
        ))}

        <div className="flex gap-2">
          <button type="button" onClick={addRule} className="px-3 py-1.5 text-xs border border-dashed border-border-secondary rounded hover:bg-bg-secondary">+ Adicionar regra</button>
          <button type="button" onClick={() => setShowPreview(!showPreview)} className="px-3 py-1.5 text-xs border border-border-tertiary rounded hover:bg-bg-secondary">
            {showPreview ? 'Ocultar preview' : `Preview 1..${N} ▼`}
          </button>
        </div>

        {!validation.ok && (
          <p className="text-xs text-donc-red bg-donc-red/10 border border-donc-red/20 rounded px-2 py-1">{validation.error}</p>
        )}
        {validation.ok && (
          <p className="text-xs text-donc-verde bg-donc-verde/10 border border-donc-verde/20 rounded px-2 py-1">Regras contíguas cobrem 1..{N} ✓</p>
        )}
        {previewError && <p className="text-xs text-donc-red">{previewError}</p>}

        {showPreview && validation.ok && preview.length > 0 && (
          <div className="border border-border-tertiary rounded overflow-hidden max-h-64 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="bg-bg-secondary sticky top-0">
                <tr className="text-left text-text-tertiary">
                  <th className="px-2 py-1">Mês</th>
                  <th className="px-2 py-1">Digitado</th>
                  <th className="px-2 py-1">Calculado (R$ total)</th>
                  <th className="px-2 py-1">Modo</th>
                </tr>
              </thead>
              <tbody>
                {preview.slice(0, 60).map(p => (
                  <tr key={p.month_index} className="border-t border-border-tertiary/50">
                    <td className="px-2 py-1">{p.month_index}</td>
                    <td className="px-2 py-1">{p.ruleMode === 'percent' ? `${p.ruleValue}%` : formatBRL4(p.ruleMode === 'base' ? baseTotal : Number(p.ruleValue))}</td>
                    <td className="px-2 py-1 font-medium text-donc-navy">{formatBRL4(p.calculated)}</td>
                    <td className="px-2 py-1">{p.ruleMode}</td>
                  </tr>
                ))}
                {preview.length > 60 && <tr><td colSpan={4} className="px-2 py-1 text-text-tertiary">... mais {preview.length - 60} meses</td></tr>}
              </tbody>
            </table>
            <div className="bg-amber-50 border-t border-amber-200 px-2 py-1.5 text-[11px] text-amber-800">
              Exemplo: 1..5 → {formatBRL4(calculateRuleTotal(rules[0], baseTotal) || 0)}, 6..10 → {formatBRL4(calculateRuleTotal(rules[1], baseTotal) || 0)}, 11..24 → {formatBRL4(calculateRuleTotal(rules[2], baseTotal) || 0)}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
