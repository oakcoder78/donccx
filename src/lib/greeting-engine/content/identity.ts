import type { GreetingFragment } from '../types'

export const IDENTITY_GREETINGS = {
  admin: [
    'Painel administrativo',
    'Gestão em dia',
  ],
  manager: [
    'Gestão de indicadores',
    'Visão executiva',
  ],
  csm: [
    'Clientes em foco',
    'Acompanhamento ativo',
  ],
  analyst: [
    'Análise em andamento',
    'Dados consolidados',
  ],
  birthday: [
    'Feliz aniversário',
    'Dia de celebration',
  ],
  anniversary: [
    'Marca registrada',
    'Jornada em curso',
  ],
  neutral: [
    'Gestão em dia',
    'Foco no cliente',
    'Carteira ativa',
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