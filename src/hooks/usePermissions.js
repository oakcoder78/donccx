import { useAuth } from '../contexts/AuthContext'

export function usePermissions() {
  const { profile } = useAuth()
  const role = profile?.role

  return {
    canManageUsers:      role === 'admin' || role === 'manager',
    canViewFinancial:    role === 'admin' || role === 'manager' || role === 'finance',
    canViewSettings:     role === 'admin' || role === 'manager',
    canViewCSMManagement: role === 'admin' || role === 'manager',
    isSales:             role === 'sales',
    isFinance:           role === 'finance',
    canViewComercial:    role === 'admin' || role === 'manager' || role === 'sales',
  }
}
