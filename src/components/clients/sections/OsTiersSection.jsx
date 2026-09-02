import { useMemo } from 'react'
import { validateOsTiers } from '@/lib/contractRules'

export function OsTiersSection({ billingType, tiers, setTiers }) {
  const isOs = billingType === 'por_os'
  const validation = useMemo(() => validateOsTiers(tiers), [tiers])

  if (!isOs) return null

  function updateTier(idx, patch) {
    setTiers(prev => prev.map((t, i) => i === idx ? { ...t, ...patch } : t))
  }

  function addTier() {
    if (tiers.length >= 5) return
    const last = tiers[tiers.length - 1]
    const nextOrder = tiers.length + 1
    const nextLimit = last ? last.limit_to + 1000 : 2000
    const nextValue = last ? Math.round(last.fixed_value * 1.2) : 3850
    setTiers(prev => [...prev, { tier_order: nextOrder, limit_to: nextLimit, fixed_value: nextValue, excess_unit_price: 0.95 }])
  }

  function removeTier(idx) {
    setTiers(prev => prev.filter((_, i) => i !== idx).map((t, i) => ({ ...t, tier_order: i + 1 })))
  }

  return (
    <div className="border border-border-tertiary rounded-lg overflow-hidden">
      <div className="bg-bg-secondary px-3 py-2 border-b border-border-tertiary">
        <p className="text-sm font-medium text-text-primary">Faixas por OS (tiers 1..5)</p>
        <p className="text-xs text-text-tertiary">Ex: até 2.000 serviços = R$3.850/mês · excedente R$0,95 por serviço além do último tier. Franquia mínima = tier 1 (até).</p>
      </div>

      <div className="p-3 space-y-2">
        <div className="grid grid-cols-12 gap-2 text-[11px] font-semibold text-text-tertiary uppercase tracking-wider px-1">
          <span className="col-span-1">Tier</span>
          <span className="col-span-3">Até (serviços)</span>
          <span className="col-span-3">Valor R$/mês</span>
          <span className="col-span-3">Excedente R$/serviço</span>
          <span className="col-span-2">Ações</span>
        </div>

        {tiers.length === 0 && <p className="text-xs text-text-tertiary px-1">Nenhum tier. Use + Adicionar tier (exemplo do contrato: 3.850 até 2.000, 4.620 até 3.000...).</p>}

        {tiers.map((t, idx) => (
          <div key={t.tier_order} className="grid grid-cols-12 gap-2 items-center">
            <span className="col-span-1 text-xs font-medium text-text-secondary">#{t.tier_order}</span>
            <input type="number" min="1" value={t.limit_to} onChange={e => updateTier(idx, { limit_to: Number(e.target.value) })} className="input-base col-span-3 text-center" />
            <div className="col-span-3 flex items-center gap-1">
              <span className="text-xs text-text-tertiary">R$</span>
              <input type="number" step="0.01" min="0" value={t.fixed_value} onChange={e => updateTier(idx, { fixed_value: Number(e.target.value) })} className="input-base flex-1 text-right" />
            </div>
            <div className="col-span-3 flex items-center gap-1">
              <span className="text-xs text-text-tertiary">R$</span>
              <input type="number" step="0.0001" min="0" value={t.excess_unit_price} onChange={e => updateTier(idx, { excess_unit_price: Number(e.target.value) })} className="input-base flex-1 text-right" placeholder="0.95" />
            </div>
            <div className="col-span-2">
              <button type="button" onClick={() => removeTier(idx)} className="px-2 py-1 text-xs border border-border-tertiary rounded hover:bg-bg-secondary">✕</button>
            </div>
          </div>
        ))}

        <div className="flex gap-2">
          <button type="button" onClick={addTier} disabled={tiers.length >= 5} className="px-3 py-1.5 text-xs border border-dashed border-border-secondary rounded hover:bg-bg-secondary disabled:opacity-40">+ Adicionar tier</button>
          {tiers.length > 0 && <span className="text-xs text-text-tertiary self-center">Franquia mínima = Até do tier 1 ({tiers[0]?.limit_to || '—'} serviços)</span>}
        </div>

        {!validation.ok && <p className="text-xs text-donc-red bg-donc-red/10 border border-donc-red/20 rounded px-2 py-1">{validation.error}</p>}
        {validation.ok && tiers.length > 0 && <p className="text-xs text-donc-verde bg-donc-verde/10 border border-donc-verde/20 rounded px-2 py-1">Tiers crescentes ✓</p>}

      </div>
    </div>
  )
}
