import type { GreetingFragment } from '../types'

export const TEMPORAL_GREETINGS = {
  morning: [
    'Bom dia',
    'Bom dia!',
  ],
  afternoon: [
    'Boa tarde',
    'Boa tarde!',
  ],
  evening: [
    'Boa noite',
  ],
  weekday: [
    'Uma semana produtiva',
    'Dia de ação',
  ],
  weekend: [
    'Fim de semana',
    'Final de semana',
  ],
} as const

export type TemporalCategory = keyof typeof TEMPORAL_GREETINGS

export function getTemporalFragments(hour: number, dayOfWeek: number): GreetingFragment[] {
  const fragments: GreetingFragment[] = []

  let timeCategory: 'morning' | 'afternoon' | 'evening'
  if (hour < 12) {
    timeCategory = 'morning'
  } else if (hour < 18) {
    timeCategory = 'afternoon'
  } else {
    timeCategory = 'evening'
  }

  const greeting = TEMPORAL_GREETINGS[timeCategory][0]
  fragments.push({
    text: greeting,
    layer: 'temporal',
    weight: 10,
    deterministic: true,
  })

  if (dayOfWeek >= 1 && dayOfWeek <= 5) {
    const weekdayFragment = TEMPORAL_GREETINGS.weekday[0]
    fragments.push({
      text: weekdayFragment,
      layer: 'temporal',
      weight: 5,
      deterministic: true,
    })
  }

  return fragments
}