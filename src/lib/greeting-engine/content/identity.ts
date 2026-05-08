import type { GreetingFragment } from '../types'

export const IDENTITY_GREETINGS = {
  admin: [
    'Hora de revisar o painel',
    'Gestão em dia',
  ],
  manager: [
    '时间来 gerenciar',
    'Foco nos resultados',
  ],
  csm: [
    'Hora de impactar clientes',
    'Seus clientes te esperam',
  ],
  analyst: [
    'Hora de analizar',
    'Dados te esperam',
  ],
  birthday: [
    'Feliz aniversário!',
    'Parabéns! Que dia special',
  ],
  anniversary: [
    'Já faz tempo!',
    'Bem-vindo de volta',
  ],
  neutral: [
    'Seu portfólio espera por você!',
    'Foco no cliente, sempre.',
    'Que dia produtivo te espera!',
    'Bora transformar dados em ação?',
  ],
} as const

export type IdentityCategory = keyof typeof IDENTITY_GREETINGS

const ROLE_GREETINGS: Record<string, readonly string[]> = {
  admin: IDENTITY_GREETINGS.admin,
  manager: IDENTITY_GREETINGS.manager,
  csm: IDENTITY_GREETINGS.csm,
  analyst: IDENTITY_GREETINGS.analyst,
}

export function getIdentityFragments(
  role: string,
  gender?: string,
  isBirthday?: boolean,
  isAnniversary?: boolean,
  seed: number = 0
): GreetingFragment[] {
  const fragments: GreetingFragment[] = []

  if (isBirthday) {
    fragments.push({
      text: IDENTITY_GREETINGS.birthday[0],
      layer: 'identity',
      weight: 50,
      deterministic: true,
    })
  }

  if (isAnniversary) {
    fragments.push({
      text: IDENTITY_GREETINGS.anniversary[0],
      layer: 'identity',
      weight: 30,
      deterministic: true,
    })
  }

  const rolePool = ROLE_GREETINGS[role] || IDENTITY_GREETINGS.neutral
  if (rolePool.length > 0) {
    const index = seed % rolePool.length
    fragments.push({
      text: rolePool[index],
      layer: 'identity',
      weight: 20,
      deterministic: true,
    })
  }

  return fragments
}