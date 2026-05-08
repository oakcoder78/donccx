import type { GreetingFragment, GreetingResult, GreetingContextInput } from './types'
import { generateSeed, deterministicIndex } from './seed'
import { provideTemporalLayer } from './temporal'
import { provideIdentityLayer } from './identity'
import { TEMPORAL_GREETINGS } from './content/temporal'
import { IDENTITY_GREETINGS } from './content/identity'

function isBirthday(birthDate?: string): boolean {
  if (!birthDate) return false
  const today = new Date()
  const birth = new Date(birthDate)
  return birth.getDate() === today.getDate() && birth.getMonth() === today.getMonth()
}

function isAnniversary(createdAt?: string): boolean {
  if (!createdAt) return false
  const today = new Date()
  const created = new Date(createdAt)
  const diffTime = today.getTime() - created.getTime()
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))
  return diffDays > 0 && diffDays % 365 < 7
}

function getTimeGreeting(hour: number): string {
  if (hour < 12) return TEMPORAL_GREETINGS.morning[0]
  if (hour < 18) return TEMPORAL_GREETINGS.afternoon[0]
  return TEMPORAL_GREETINGS.evening[0]
}

export function composeGreeting(input: GreetingContextInput): GreetingResult {
  const { profile, temporal } = input
  const now = new Date()
  const seedStr = generateSeed(profile.id, now)
  const seed = deterministicIndex(1000, seedStr)

  const { hour, dayOfWeek } = temporal

  const timeGreeting = getTimeGreeting(hour)
  const name = profile.name.split(' ')[0]

  const primaryGreeting = `${timeGreeting}, ${name}.`

  const hasBirthday = isBirthday(profile.birth_date)
  const hasAnniversary = isAnniversary(profile.created_at)

  const fragments: GreetingFragment[] = [{
    text: primaryGreeting,
    layer: 'temporal',
    weight: 10,
    deterministic: true,
  }]

  let extraText = ''

  if (hasBirthday) {
    extraText = IDENTITY_GREETINGS.birthday[0]
  } else if (hasAnniversary) {
    extraText = IDENTITY_GREETINGS.anniversary[0]
  } else if (dayOfWeek >= 1 && dayOfWeek <= 5) {
    const weekdayIndex = seed % TEMPORAL_GREETINGS.weekday.length
    extraText = TEMPORAL_GREETINGS.weekday[weekdayIndex]
  } else if (dayOfWeek === 0 || dayOfWeek === 6) {
    const weekendIndex = seed % TEMPORAL_GREETINGS.weekend.length
    extraText = TEMPORAL_GREETINGS.weekend[weekendIndex]
  }

  return {
    text: primaryGreeting,
    extra: extraText,
    fragments,
    metadata: {
      generatedAt: now.toISOString(),
      seed: seedStr,
      layers: ['temporal'],
      fallback: false,
    },
  }
}

export function buildFallback(temporal: GreetingContextInput['temporal'], name: string): GreetingResult {
  const now = new Date()
  const greeting = getTimeGreeting(temporal.hour)
  return {
    text: `${greeting}, ${name}.`,
    extra: '',
    fragments: [],
    metadata: {
      generatedAt: now.toISOString(),
      seed: 'fallback',
      layers: [],
      fallback: true,
    },
  }
}