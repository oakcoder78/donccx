import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

const AuthContext = createContext({})

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [impersonatedRole, setImpersonatedRole] = useState(null)
  const [loading, setLoading] = useState(true)

  async function fetchProfile(userId) {
    try {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle()
      setProfile(data)
      // Also fetch impersonation if admin
      if (data?.role === 'admin') {
        const { data: imp } = await supabase
          .from('role_impersonations')
          .select('target_role, expires_at')
          .eq('user_id', userId)
          .maybeSingle()
        if (imp && new Date(imp.expires_at) > new Date()) {
          setImpersonatedRole(imp.target_role)
        } else {
          setImpersonatedRole(null)
        }
      } else {
        setImpersonatedRole(null)
      }
    } catch (e) {
      setProfile(null)
    }
  }

  useEffect(() => {
    // Busca sessão inicial
    supabase.auth.getSession().then(({ data: { session } }) => {
      const u = session?.user ?? null
      setUser(u)
      if (u) {
        fetchProfile(u.id).finally(() => setLoading(false))
      } else {
        setLoading(false)
      }
    })

    // Escuta mudanças de auth (login, logout, refresh de token)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user ?? null
      setUser(u)
      if (u) {
        fetchProfile(u.id)
      } else {
        setProfile(null)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const effectiveRole = impersonatedRole || profile?.role
  const effectiveProfile = profile ? { ...profile, role: effectiveRole } : null

  const value = {
    user,
    profile,
    effectiveProfile,
    effectiveRole,
    impersonatedRole,
    isImpersonating: !!impersonatedRole,
    loading,
    isAdmin: profile?.role === 'admin',
    isManager: profile?.role === 'manager' || profile?.role === 'admin',
    isAnalyst: profile?.role === 'analyst',
    isSales: profile?.role === 'sales',
    isFinance: profile?.role === 'finance',
    // Effective (impersonated) helpers
    isEffectiveAdmin: effectiveRole === 'admin',
    isEffectiveManager: effectiveRole === 'manager' || effectiveRole === 'admin',
    signIn: (email, password) => supabase.auth.signInWithPassword({ email, password }),
    signInWithGoogle: () => supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/dashboard` },
    }),
    signOut: async () => {
      // Clear impersonation on logout — best-effort, must never block the sign-out
      try {
        if (impersonatedRole && user?.id) {
          await supabase.from('role_impersonations').delete().eq('user_id', user.id)
        }
      } catch { /* ignore — a dead session must still be able to log out */ }
      // scope: 'local' clears local storage + emits SIGNED_OUT without the
      // POST /auth/v1/logout server call, which 403s (and stalls on the lock)
      // when the access token is already expired/invalid.
      return supabase.auth.signOut({ scope: 'local' })
    },
    refreshProfile: () => user ? fetchProfile(user.id) : Promise.resolve(),
    setImpersonation: async (targetRole) => {
      if (profile?.role !== 'admin') throw new Error('Only admin can impersonate')
      if (!targetRole || targetRole === 'admin') {
        await supabase.rpc('clear_impersonation')
        setImpersonatedRole(null)
      } else {
        const { error } = await supabase.rpc('set_impersonation', { target: targetRole })
        if (error) throw error
        setImpersonatedRole(targetRole)
      }
      // Reload to apply RLS changes
      window.location.reload()
    },
    clearImpersonation: async () => {
      await supabase.rpc('clear_impersonation')
      setImpersonatedRole(null)
      window.location.reload()
    },
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
