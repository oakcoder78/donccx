import type { GreetingFragment } from './types'
import { getIdentityFragments } from './content/identity'

export function provideIdentityLayer(
  role: string,
  gender?: string,
  isBirthday?: boolean,
  isAnniversary?: boolean,
  seed: number = 0
): GreetingFragment[] {
  return getIdentityFragments(role, gender, isBirthday, isAnniversary, seed)
}