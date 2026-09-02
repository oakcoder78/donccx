/**
 * Calcula o MRR de uma empresa com base no tipo de cobrança,
 * piso contratual e modificadores de módulo.
 *
 * @param {number} billingBaseValue - Valor base por licença ou OS
 * @param {number} billingFloor    - Piso mínimo garantido em contrato
 * @param {number} activeUnits     - Unidades ativas no mês (usuários ou OS)
 * @param {Array}  modulePricing   - Array de { additional_value }
 * @returns {number} MRR calculado
 */
export function calculateMRR(billingBaseValue, billingFloor, activeUnits, modulePricing = [], opts = {}) {
  const mode = opts.mode || 'legacy'
  if (mode === 'rateio') {
    const unitValue = Number(billingBaseValue) || 0
    const billableUnits = Math.max(Number(activeUnits) || 0, Number(billingFloor) || 0)
    return billableUnits * unitValue
  }
  const moduleTotal = modulePricing.reduce(
    (sum, mp) => sum + (mp.additional_value || 0), 0
  )
  const unitValue = (Number(billingBaseValue) || 0) + moduleTotal
  const billableUnits = Math.max(Number(activeUnits) || 0, Number(billingFloor) || 0)
  return billableUnits * unitValue
}

/**
 * Retorna o valor unitário.
 * - mode='legacy' (default): base + sum(mods) (comportamento antigo, soma)
 * - mode='rateio': base puro, mods são apenas rateio informativo (não somam)
 *
 * @param {number} billingBaseValue
 * @param {Array}  modulePricing
 * @param {object} opts
 * @returns {number}
 */
export function calculateUnitValue(billingBaseValue, modulePricing = [], opts = {}) {
  const mode = opts.mode || 'legacy'
  if (mode === 'rateio') return Number(billingBaseValue) || 0
  const mods = modulePricing.reduce(
    (sum, mp) => sum + (mp.additional_value || 0), 0
  )
  return (Number(billingBaseValue) || 0) + mods
}

export function validateRateio(mods, baseTotal, tolerance = 0.01) {
  const sum = mods.reduce((s, m) => s + (Number(m.additional_value) || 0), 0)
  const diff = Math.abs(sum - (Number(baseTotal) || 0))
  return { ok: diff <= tolerance, sum, diff, base: Number(baseTotal) || 0 }
}
