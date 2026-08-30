// The "geral" blocks (Saúde, Projetos, Operacional) show company-wide aggregates
// to every role, but csm/sales can only open the detail/drawer for clients in
// their own carteira (RLS). Non-owned rows render display-only.
export function canDrillIn(row, effectiveRole, profileId) {
  if (effectiveRole === 'admin' || effectiveRole === 'manager') return true
  if (!row || !profileId) return false
  return row.csm_id === profileId || row.comercial_id === profileId
}
