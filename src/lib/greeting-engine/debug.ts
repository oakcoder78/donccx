export interface GreetingDebugContext {
  enabled: boolean
  operational?: {
    criticalClients?: number
  }
  identity?: {
    isBirthday?: boolean
    isAnniversary?: boolean
  }
  temporal?: {
    hour?: number
    dayOfWeek?: number
  }
}

export const GREETING_DEBUG: GreetingDebugContext | null =
  process.env.NODE_ENV === 'development'
    ? {
        enabled: false,
        operational: {
          criticalClients: 0,
        },
      }
    : null