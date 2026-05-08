import type { GreetingFragment } from './types'
import { getOperationalFragments } from './content/operational'

export function provideOperationalLayer(
  criticalClients: number | undefined,
  seed: number = 0
): GreetingFragment[] {
  return getOperationalFragments(criticalClients, seed)
}