import { useMemo } from 'react'
import { validateOsTiers } from '@/lib/contractRules'
import { Icons } from '@/lib/icons'

const ROW = 'grid grid-cols-[2rem_2.5rem_6rem_2.5rem_10rem_10rem_2rem] items-center gap-2 min-w-[40rem]'

/**
 * "Faixas de preço por OS" — fixed price per volume band, plus a per-OS price
 * above the last band. Parent wraps this in a <FormSection>; renders nothing
 * unless billing is por OS.
 */
export function OsTiersSection({ billingType, tiers, setTiers }) {
  const isOs = billingType === 'por_os'
  const validation = useMemo(() => validateOsTiers(tiers), [tiers])

  if (!isOs) return null

  function updateTier(idx, patch) {
    setTiers(prev => prev.map((t, i) => (i === idx ? { ...t, ...patch } : t)))
  }
  function addTier() {
    if (tiers.length >= 5) return
    const last = tiers[tiers.length - 1]
    setTiers(prev => [...prev, {
      tier_order: tiers.length + 1,
      limit_to: last ? last.limit_to + 1000 : 2000,
      fixed_value: last ? Math.round(last.fixed_value * 1.2) : 3850,
      excess_unit_price: last ? last.excess_unit_price : 0.95,
    }])
  }
  function removeTier(idx) {
    setTiers(prev => prev.filter((_, i) => i !== idx).map((t, i) => ({ ...t, tier_order: i + 1 })))
  }

  return (
    <div className="space-y-1.5 overflow-x-auto">
      {tiers.length === 0 && (
        <p className="text-xs text-text-tertiary">
          Nenhuma faixa. Ex: até 2.000 OS = R$ 3.850/mês; até 3.000 OS = R$ 4.620/mês.
        </p>
      )}

      {tiers.length > 0 && (
        <div className={`${ROW} text-[11px] font-medium uppercase tracking-wide text-text-tertiary`}>
          <span>Faixa</span>
          <span />
          <span>Até (OS)</span>
          <span />
          <span>Valor / mês</span>
          <span>Excedente / OS</span>
          <span />
        </div>
      )}

      {tiers.map((t, idx) => (
        <div key={t.tier_order} className={ROW}>
          <span className="text-xs font-medium text-text-secondary">#{t.tier_order}</span>
          <span className="text-center text-xs text-text-tertiary">até</span>
          <input
            type="number" min="1" value={t.limit_to}
            onChange={e => updateTier(idx, { limit_to: Number(e.target.value) })}
            className="input-base w-full text-center"
          />
          <span className="text-center text-xs text-text-tertiary">=</span>
          <div className="flex items-center gap-1">
            <span className="w-4 text-xs text-text-tertiary">R$</span>
            <input
              type="number" step="0.01" min="0" value={t.fixed_value}
              onChange={e => updateTier(idx, { fixed_value: Number(e.target.value) })}
              className="input-base w-full text-right"
            />
          </div>
          <div className="flex items-center gap-1">
            <span className="w-4 text-xs text-text-tertiary">R$</span>
            <input
              type="number" step="0.0001" min="0" value={t.excess_unit_price}
              onChange={e => updateTier(idx, { excess_unit_price: Number(e.target.value) })}
              className="input-base w-full text-right"
              placeholder="0.95"
            />
          </div>
          <button
            type="button" onClick={() => removeTier(idx)}
            className="inline-flex items-center justify-center h-8 w-8 rounded border border-border-tertiary text-text-tertiary hover:bg-bg-secondary hover:text-donc-red"
            aria-label="Remover faixa"
          >
            <Icons.X size={14} />
          </button>
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button
          type="button" onClick={addTier} disabled={tiers.length >= 5}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs border border-dashed border-border-secondary rounded hover:bg-bg-secondary disabled:opacity-40"
        >
          <Icons.Plus size={13} /> Adicionar faixa
        </button>
        {tiers.length > 0 && (
          <span className="text-xs text-text-tertiary">
            Franquia mínima: {tiers[0]?.limit_to || '—'} OS (faixa 1)
          </span>
        )}
      </div>

      {!validation.ok && tiers.length > 0 && (
        <p className="text-xs text-donc-red bg-donc-red/10 border border-donc-red/20 rounded px-2 py-1.5">{validation.error}</p>
      )}
    </div>
  )
}
