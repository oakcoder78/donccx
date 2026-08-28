import { useClients } from './useClients'

// Helpers for labs dashboard dual ownership
export function labsFilterFor(profile) {
  if (!profile) return {}
  const role = profile.role
  const isGlobal = role === 'admin' || role === 'manager' || role === 'finance'
  if (isGlobal) return { lifecycle_stage: 'cliente' }
  if (role === 'sales') return { comercial_id: profile.id, lifecycle_stage: 'cliente' }
  // csm and others: own portfolio via csm_id (fallback dual if needed)
  return { csm_id: profile.id, lifecycle_stage: 'cliente' }
}

export function useLabsClients(profile, options = {}) {
  return useClients(labsFilterFor(profile), { enabled: !!profile, ...options })
}

export function useComercialClients(profile, options = {}) {
  if (!profile || profile.role !== 'sales') return useClients({ lifecycle_stage: 'cliente' }, { enabled: false, ...options })
  return useClients({ comercial_id: profile.id, lifecycle_stage: 'cliente' }, { enabled: !!profile, ...options })
}

export function useCsmClients(profile, options = {}) {
  return useClients({ csm_id: profile.id, lifecycle_stage: 'cliente' }, { enabled: !!profile, ...options })
}
