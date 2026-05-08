import type { GreetingFragment, GreetingResult, GreetingContextInput } from './types'
import { generateSeed, deterministicIndex } from './seed'
import { provideTemporalLayer } from './temporal'
import { provideIdentityLayer } from './identity'
import { provideOperationalLayer } from './operational'

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

function mergeFragments(fragments: GreetingFragment[]): GreetingFragment[] {
  const usedTexts = new Set<string>()
  const unique: GreetingFragment[] = []
  
  for (const fragment of fragments) {
    if (!usedTexts.has(fragment.text)) {
      usedTexts.add(fragment.text)
      unique.push(fragment)
    }
  }
  
  return unique.sort((a, b) => a.weight - b.weight)
}

export function composeGreeting(input: GreetingContextInput): GreetingResult {
  const { profile, operational, temporal } = input
  const now = new Date()
  const seedStr = generateSeed(profile.id, now)
  const seed = deterministicIndex(1000, seedStr)

  const { hour, dayOfWeek } = temporal
  
  const temporalFragments = provideTemporalLayer(hour, dayOfWeek)
  
  const identityFragments = provideIdentityLayer(
    profile.role,
    profile.gender,
    isBirthday(profile.birth_date),
    isAnniversary(profile.created_at),
    seed
  )

  const criticalClients = operational?.criticalClients
  const operationalFragments = provideOperationalLayer(criticalClients, seed)
  
  const allFragments = [...temporalFragments, ...identityFragments, ...operationalFragments]
  
  if (allFragments.length === 0) {
    return buildFallback(temporal, profile.name.split(' ')[0])
  }
  
  const finalFragments = mergeFragments(allFragments)
  const activeLayers = [...new Set(finalFragments.map(f => f.layer))]
  
  const greetingFragments = finalFragments.filter(f => f.layer === 'temporal')
  const primaryText = greetingFragments[0]?.text || 'Olá'
  const name = profile.name.split(' ')[0]
  const text = `${primaryText}, ${name}.`
  
  const extraFragments = finalFragments.filter(f => f.layer !== 'temporal')
  const extra = extraFragments[0]?.text || ''

  return {
    text,
    extra,
    fragments: finalFragments,
    metadata: {
      generatedAt: now.toISOString(),
      seed: seedStr,
      layers: activeLayers,
      fallback: false,
    },
  }
}

export function buildFallback(temporal: GreetingContextInput['temporal'], name: string): GreetingResult {
  const now = new Date()
  const hour = temporal.hour
  
  let greeting = 'Olá'
  if (hour < 12) greeting = 'Bom dia'
  else if (hour < 18) greeting = 'Boa tarde'
  else greeting = 'Boa noite'

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