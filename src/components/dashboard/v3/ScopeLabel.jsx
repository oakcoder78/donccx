import { C } from '@/lib/scoring'

// Tiny chip that tells the reader what a block's numbers cover, so a CSM seeing
// "5 clientes" in the HERO next to an "18 clientes" company block doesn't read
// the numbers as broken (SDD §1.1).
//
// scope: 'user' | 'carteira' | 'base'
const LABELS = {
  user: 'meus dados',
  carteira: 'minha carteira',
  base: 'toda a base',
}

export function ScopeLabel({ scope }) {
  const text = LABELS[scope] || scope
  return (
    <span
      style={{
        fontSize: '0.625rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
        color: C.ink2, background: C.bg, borderRadius: 999, padding: '3px 8px', whiteSpace: 'nowrap',
      }}
    >
      {text}
    </span>
  )
}

/**
 * For company-wide blocks whose data is actually RLS-scoped for csm/sales
 * (useOperationalDeltas): show "toda a base" for the roles that see everything,
 * "minha carteira" for the two that don't.
 */
export function scopeForRole(effectiveRole) {
  return effectiveRole === 'csm' || effectiveRole === 'sales' ? 'carteira' : 'base'
}
