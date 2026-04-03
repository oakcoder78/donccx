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
export function calculateMRR(billingBaseValue, billingFloor, activeUnits, modulePricing = []) {
  const moduleTotal = modulePricing.reduce(
    (sum, mp) => sum + (mp.additional_value || 0), 0
  )
  const unitValue = (billingBaseValue || 0) + moduleTotal
  const billableUnits = Math.max(activeUnits || 0, billingFloor || 0)
  return billableUnits * unitValue
}

/**
 * Retorna o valor unitário (base + somatório de modificadores de módulo).
 *
 * @param {number} billingBaseValue
 * @param {Array}  modulePricing
 * @returns {number}
 */
export function calculateUnitValue(billingBaseValue, modulePricing = []) {
  const mods = modulePricing.reduce(
    (sum, mp) => sum + (mp.additional_value || 0), 0
  )
  return (billingBaseValue || 0) + mods
}
