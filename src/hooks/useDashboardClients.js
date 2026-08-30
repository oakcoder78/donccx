import { useClients } from './useClients'
import { labsFilterFor } from './useLabsClients'

/**
 * Clients in the Dashboard v3 scope for the given profile.
 *
 * Scope (via labsFilterFor — same rule as the monolith):
 *   admin / manager / finance → all lifecycle_stage = 'cliente'
 *   sales                     → comercial_id = profile.id
 *   csm (and anything else)   → csm_id = profile.id
 *
 * RLS enforces the same boundary server-side; this only shapes the query.
 * Call ONCE in MeuDiaV3Page and pass `clients` down — do not let each block
 * call useClients (SDD gotcha A5).
 *
 * NOTE: `mrr` / `billing_*` come back here (CLIENT_SELECT = '*') but the v3 must
 * NOT read them — the finance HERO uses get_finance_summary() (SDD §4.4).
 */
export function useDashboardClients(profile, options = {}) {
  return useClients(labsFilterFor(profile), { enabled: !!profile, ...options })
}
