import { useAuth } from '../contexts/AuthContext'

export function usePermissions() {
  const { effectiveProfile } = useAuth()
  const role = effectiveProfile?.role || null

  return {
    canViewFinancial:    role === 'admin' || role === 'manager' || role === 'finance',
    canViewCSMManagement: role === 'admin' || role === 'manager',
    isSales:             role === 'sales',
    isFinance:           role === 'finance',
    canViewComercial:    role === 'admin' || role === 'manager' || role === 'sales',
  }
}
