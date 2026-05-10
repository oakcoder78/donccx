export interface GreetingDebugContext {
  enabled: boolean
  observability?: boolean
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

const isDev = import.meta.env.DEV || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'

export const GREETING_DEBUG: GreetingDebugContext | null =
  isDev
    ? {
        enabled: false,
        observability: false,
        operational: {
          criticalClients: 0,
        },
      }
    : null