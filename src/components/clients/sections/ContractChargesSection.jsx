import { useMemo, useState } from 'react'
import { validateRulesContiguous, expandRulesToCharges, formatBRL4 } from '@/lib/contractRules'

export function ContractChargesSection({ N, setN, rules, setRules, billingBaseValue }) {
  const [showPreview, setShowPreview] = useState(false)

  const validation = useMemo(() => validateRulesContiguous(rules, N), [rules, N])

  let preview = []
  let previewError = null
  if (validation.ok) {
    try { preview = expandRulesToCharges(rules, N) } catch (e) { previewError = e.message }
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
    setRules(prev => [...prev, { from, to: N, mode: 'absolute', value: String(billingBaseValue || ''), label: '' }])
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
          <p className="text-xs text-text-tertiary">Regras contíguas 1..N (absoluto ou % do base). Motor expande para <code>contract_charges</code>.</p>
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
          <span className="col-span-3">Valor</span>
          <span className="col-span-2">Ações</span>
        </div>

        {rules.length === 0 && (
          <p className="text-xs text-text-tertiary px-1">Nenhuma regra. Clique em + Adicionar regra.</p>
        )}

        {rules.map((r, idx) => (
          <div key={idx} className="grid grid-cols-12 gap-2 items-center">
            <input type="number" min="1" max={N} value={r.from} onChange={e => updateRule(idx, { from: Number(e.target.value) })} className="input-base col-span-2 text-center" />
            <input type="number" min="1" max={N} value={r.to} onChange={e => updateRule(idx, { to: Number(e.target.value) })} className="input-base col-span-2 text-center" />
            <select value={r.mode} onChange={e => updateRule(idx, { mode: e.target.value })} className="input-base col-span-3">
              <option value="absolute">Valor absoluto (R$)</option>
              <option value="percent">% do base</option>
              <option value="base">Valor base</option>
            </select>
            <div className="col-span-3 flex items-center gap-1">
              <span className="text-xs text-text-tertiary">{r.mode === 'percent' ? '%' : 'R$'}</span>
              <input type="number" step="0.01" min="0" value={r.value} onChange={e => updateRule(idx, { value: e.target.value })} className="input-base flex-1 text-right" placeholder={r.mode === 'percent' ? '80' : '3850'} />
            </div>
            <div className="col-span-2 flex gap-1">
              <button type="button" onClick={() => removeRule(idx)} className="px-2 py-1 text-xs border border-border-tertiary rounded hover:bg-bg-secondary">✕</button>
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
          <div className="border border-border-tertiary rounded overflow-hidden max-h-48 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="bg-bg-secondary sticky top-0">
                <tr className="text-left text-text-tertiary">
                  <th className="px-2 py-1">Mês</th>
                  <th className="px-2 py-1">Valor</th>
                  <th className="px-2 py-1">Modo</th>
                </tr>
              </thead>
              <tbody>
                {preview.slice(0, 60).map(p => (
                  <tr key={p.month_index} className="border-t border-border-tertiary/50">
                    <td className="px-2 py-1">{p.month_index}</td>
                    <td className="px-2 py-1">{p.mode === 'percent' ? `${p.percent}%` : formatBRL4(p.amount)}</td>
                    <td className="px-2 py-1">{p.mode}</td>
                  </tr>
                ))}
                {preview.length > 60 && <tr><td colSpan={3} className="px-2 py-1 text-text-tertiary">... mais {preview.length - 60} meses</td></tr>}
              </tbody>
            </table>
          </div>
        )}

        <p className="text-[11px] text-text-tertiary bg-amber-50 border border-amber-200 rounded px-2 py-1">
          Labs: persistência em <code>contract_charges(month_index, mode, amount/percent)</code> via <code>expandRulesToCharges</code>. Cockpit lê <code>month_index = months_between(contract_start, ref_month)</code>.
        </p>
      </div>
    </div>
  )
}
