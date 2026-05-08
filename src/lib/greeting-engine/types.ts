export interface OperationalContext {
  criticalClients?: number
}

export interface GreetingContext {
  profile: {
    id: string
    name: string
    role: 'admin' | 'manager' | 'csm' | 'analyst'
    gender?: 'male' | 'female' | 'other'
    birth_date?: string
    created_at: string
  }
  operational?: OperationalContext
  temporal: {
    hour: number
    dayOfWeek: number
    month: number
    isBirthday: boolean
    isAnniversary: boolean
  }
}

export interface GreetingFragment {
  text: string
  layer: 'temporal' | 'identity' | 'operational'
  weight: number
  deterministic: boolean
}

export interface GreetingResult {
  text: string
  extra?: string
  fragments: GreetingFragment[]
  metadata: {
    generatedAt: string
    seed: string
    layers: string[]
    fallback: boolean
  }
}

export type GreetingContextInput = Pick<GreetingContext, 'profile' | 'temporal' | 'operational'>