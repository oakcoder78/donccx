import type { GreetingContextInput, GreetingFragment } from './types'

export interface GreetingObservabilityData {
  seed: string
  context: {
    hour: number
    dayOfWeek: number
    role?: string
    criticalClients: number
    isBirthday: boolean
    isAnniversary: boolean
  }
  allFragments: GreetingFragment[]
  finalFragments: GreetingFragment[]
  selected: {
    primary: string
    extra: string
  }
}

export function observeGreeting(data: GreetingObservabilityData): void {
  // DEV mode detection: use import.meta.env.DEV or fallback to localhost detection
  const isDev = import.meta.env.DEV || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'

  if (!isDev) {
    return
  }

  const { seed, context, allFragments, finalFragments, selected } = data

  const layers = [...new Set(allFragments.map(f => f.layer))]
  const selectedLayers = [...new Set(finalFragments.map(f => f.layer))]

  const fragmentsByLayer = (layer: string) =>
    allFragments.filter(f => f.layer === layer).map(f => f.text)

  const discardedFragments = allFragments.filter(
    af => !finalFragments.some(ff => ff.text === af.text)
  )
  const discardedByLayer = [...new Set(discardedFragments.map(f => f.layer))]

  console.group(
    `%c[GreetingEngine] %c${new Date().toISOString().slice(11, 19)}`,
    'color: #6366f1; font-weight: bold',
    'color: #94a3b8'
  )

  const maskedSeed = seed.includes(':')
    ? `[masked]:${seed.split(':')[1]}`
    : seed

  console.log('%c--- CONTEXT ---', 'color: #64748b; font-weight: 600')
  console.log(`seed: ${maskedSeed}`)
  console.log(`role: ${context.role || 'unknown'}`)
  console.log(`criticalClients: ${context.criticalClients}`)
  console.log(`isBirthday: ${context.isBirthday}`)
  console.log(`isAnniversary: ${context.isAnniversary}`)
  console.log(`hour: ${context.hour}, dayOfWeek: ${context.dayOfWeek}`)

  console.log('%c--- LAYERS ---', 'color: #64748b; font-weight: 600')
  console.log(`available: ${layers.join(', ')}`)
  console.log(`selected: ${selectedLayers.join(', ')}`)
  if (discardedByLayer.length > 0) {
    console.log(`discarded: ${discardedByLayer.join(', ')}`)
  }

  if (fragmentsByLayer('temporal').length > 0) {
    console.log('%c--- TEMPORAL ---', 'color: #64748b; font-weight: 600')
    console.log(fragmentsByLayer('temporal').join(' | '))
  }

  if (fragmentsByLayer('identity').length > 0) {
    console.log('%c--- IDENTITY ---', 'color: #64748b; font-weight: 600')
    const identityTexts = fragmentsByLayer('identity')
    const used = finalFragments.filter(f => f.layer === 'identity').map(f => f.text)
    const unused = identityTexts.filter(t => !used.includes(t))
    if (used.length > 0) console.log(`selected: ${used.join(' | ')}`)
    if (unused.length > 0) console.log(`discarded: ${unused.join(' | ')}`)
  }

  if (fragmentsByLayer('operational').length > 0) {
    console.log('%c--- OPERATIONAL ---', 'color: #64748b; font-weight: 600')
    const operationalTexts = fragmentsByLayer('operational')
    const used = finalFragments.filter(f => f.layer === 'operational').map(f => f.text)
    const unused = operationalTexts.filter(t => !used.includes(t))
    if (used.length > 0) console.log(`selected: ${used.join(' | ')}`)
    if (unused.length > 0) console.log(`discarded: ${unused.join(' | ')}`)
  }

  console.log('%c--- OUTPUT ---', 'color: #64748b; font-weight: 600')
  console.log(`primary: "${selected.primary}"`)
  if (selected.extra) {
    console.log(`extra: "${selected.extra}"`)
  }

  console.groupEnd()
}