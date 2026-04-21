/**
 * calcGravidade — pontuação de urgência de atenção CSM para um cliente.
 * Quanto maior o número, mais urgente a atenção.
 * Recebe o objeto cliente completo e retorna um número (0–200).
 */
export function calcGravidade(client) {
  const health = client.health_total ?? 0

  // Base invertida: clientes com health 0 = gravidade 100, health 100 = gravidade 0
  let score = 100 - health

  // Bônus de tier de risco
  if (health < 50) score += 30
  else if (health < 75) score += 10

  // Temperatura CSM: clientes Críticos e Frios sobem na fila
  const temp = client.csm_temperature ?? 0
  const updatedAt = client.temperature_updated_at
  const tempValid = updatedAt
    ? (Date.now() - new Date(updatedAt).getTime()) / (1000 * 60 * 60 * 24) <= 30
    : false

  if (tempValid) {
    if (temp === -7) score += 20      // Crítico
    else if (temp === -3) score += 10 // Frio
    else if (temp === 5) score -= 5   // Quente: reduz levemente urgência
  }

  // Atraso financeiro
  const days = client.delay_days ?? 0
  if (days > 60) score += 15
  else if (days > 30) score += 8
  else if (days > 0) score += 3

  // Clientes A com problemas recebem bump extra de visibilidade
  if (client.abc_class === 'A' && health < 75) score += 5

  return Math.min(200, Math.max(0, Math.round(score)))
}
