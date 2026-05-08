import type { GreetingFragment } from '../types'

export const OPERATIONAL_GREETINGS = {
  clean: [
    'Gestão em dia',
    'Nenhum risco crítico identificado',
    'Carteira equilibrada',
  ],
  mild: [
    'Alguns clientes merecem atenção',
    'Há acompanhamentos importantes hoje',
    'Acompanhamentos em destaque',
  ],
  attention: [
    'Há sinais importantes na carteira hoje',
    'A carteira exige atenção adicional',
    'Alguns pontos precisam de foco',
  ],
} as const

export type OperationalCategory = keyof typeof OPERATIONAL_GREETINGS

export function getOperationalFragments(
  criticalClients: number | undefined,
  seed: number = 0
): GreetingFragment[] {
  if (criticalClients === undefined || criticalClients === null) {
    return []
  }

  let category: OperationalCategory
  let weight: number

  if (criticalClients === 0) {
    category = 'clean'
    weight = 40
  } else if (criticalClients <= 2) {
    category = 'mild'
    weight = 45
  } else {
    category = 'attention'
    weight = 50
  }

  const pool = OPERATIONAL_GREETINGS[category]
  const index = seed % pool.length

  return [{
    text: pool[index],
    layer: 'operational',
    weight,
    deterministic: true,
  }]
}