import type { GreetingFragment } from './types'
import { getTemporalFragments } from './content/temporal'

export function provideTemporalLayer(
  hour: number,
  dayOfWeek: number
): GreetingFragment[] {
  return getTemporalFragments(hour, dayOfWeek)
}