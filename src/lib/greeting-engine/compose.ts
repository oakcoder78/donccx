import type { GreetingFragment, GreetingResult, GreetingContextInput } from './types'
import { generateSeed, deterministicIndex } from './seed'
import { provideTemporalLayer } from './temporal'
import { provideIdentityLayer } from './identity'

function buildContext(profile: GreetingContextInput['profile']): GreetingContextInput['temporal'] {
  const now = new Date()
  return {
    hour: now.getHours(),
    dayOfWeek: now.getDay(),
    month: now.getMonth(),
    isBirthday: false, // Will need profile.birth_date check
    isAnniversary: false, // Will need profile.created_at check
  }
}

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

export function composeGreeting(input: GreetingContextInput): GreetingResult {
  const { profile, temporal } = input
  const now = new Date()
  const seedStr = generateSeed(profile.id, now)
  const seed = deterministicIndex(1000, seedStr)

  const temporalFragments = provideTemporalLayer(temporal.hour, temporal.dayOfWeek)

  const identityFragments = provideIdentityLayer(
    profile.role,
    profile.gender,
    isBirthday(profile.birth_date),
    isAnniversary(profile.created_at),
    seed
  )

  const allFragments = [...temporalFragments, ...identityFragments]

  if (allFragments.length === 0) {
    const fallback = temporal.hour < 12 ? 'Bom dia' : temporal.hour < 18 ? 'Boa tarde' : 'Boa noite'
    return {
      text: `${fallback}, ${profile.name.split(' ')[0]}.`,
      fragments: [],
      metadata: {
        generatedAt: now.toISOString(),
        seed: seedStr,
        layers: [],
        fallback: true,
      },
    }
  }

  allFragments.sort((a, b) => a.weight - b.weight)

  const usedTexts = new Set<string>()
  const finalFragments: GreetingFragment[] = []

  for (const fragment of allFragments) {
    if (!usedTexts.has(fragment.text)) {
      usedTexts.add(fragment.text)
      finalFragments.push(fragment)
    }
  }

  const greeting = finalFragments
    .slice(0, 2)
    .map(f => f.text)
    .join(', ')

  const name = profile.name.split(' ')[0]
  const fullGreeting = `${greeting}, ${name}.`

  return {
    text: fullGreeting,
    fragments: finalFragments,
    metadata: {
      generatedAt: now.toISOString(),
      seed: seedStr,
      layers: [...new Set(finalFragments.map(f => f.layer))],
      fallback: false,
    },
  }
}

export function buildFallback(temporal: GreetingContextInput['temporal'], name: string): GreetingResult {
  const now = new Date()
  const greeting = temporal.hour < 12 ? 'Bom dia' : temporal.hour < 18 ? 'Boa tarde' : 'Boa noite'
  return {
    text: `${greeting}, ${name}.`,
    fragments: [],
    metadata: {
      generatedAt: now.toISOString(),
      seed: 'fallback',
      layers: [],
      fallback: true,
    },
  }
}