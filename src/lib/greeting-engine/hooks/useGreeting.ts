import { useMemo } from 'react'
import type { GreetingContextInput, GreetingResult } from '../types'
import { composeGreeting, buildFallback } from '../compose'

export function useGreeting(profile?: GreetingContextInput['profile']): GreetingResult {
  const result = useMemo(() => {
    if (!profile) {
      return {
        text: 'Olá.',
        extra: '',
        fragments: [],
        metadata: {
          generatedAt: new Date().toISOString(),
          seed: 'no-profile',
          layers: [],
          fallback: true,
        },
      }
    }

    const temporal = {
      hour: new Date().getHours(),
      dayOfWeek: new Date().getDay(),
      month: new Date().getMonth(),
      isBirthday: false,
      isAnniversary: false,
    }

    try {
      return composeGreeting({ profile, temporal })
    } catch {
      return buildFallback(temporal, profile.name.split(' ')[0])
    }
  }, [profile?.id, profile?.name, profile?.role, profile?.gender, profile?.birth_date, profile?.created_at])

  return result
}