import { useAuth } from '@/contexts/AuthContext'

// Wrapper around AuthContext impersonation for convenience
// Provides same API as before but delegates to AuthContext single source
export function useViewAsRole() {
  const { profile, effectiveRole, impersonatedRole, isImpersonating, setImpersonation, clearImpersonation, loading } = useAuth()
  const isAdmin = profile?.role === 'admin'
  return {
    isAdmin,
    impersonatedRole,
    effectiveRole,
    isImpersonating,
    loading,
    setViewAs: setImpersonation,
    clearViewAs: clearImpersonation,
    refresh: () => {},
  }
}
