import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  async function fetchProfile(userId) {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()
    if (error) {
      console.error('[AuthContext] fetchProfile error:', error)
      return null
    }
    return data
  }

  useEffect(() => {
    let mounted = true

    // Timeout de segurança: desbloqueia o app após 3s mesmo sem resposta
    const timeout = setTimeout(() => {
      if (mounted) setLoading(false)
    }, 3000)

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return
      clearTimeout(timeout)
      setUser(session?.user ?? null)
      if (session) {
        fetchProfile(session.user.id)
          .then(p => { if (mounted) setProfile(p) })
          .finally(() => { if (mounted) setLoading(false) })
      } else {
        setLoading(false)
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!mounted) return
      setUser(session?.user ?? null)
      if (session) {
        const p = await fetchProfile(session.user.id)
        if (mounted) setProfile(p)
      } else {
        setProfile(null)
      }
    })

    return () => {
      mounted = false
      clearTimeout(timeout)
      subscription.unsubscribe()
    }
  }, [])

  async function signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    return data
  }

  async function signInWithGoogle() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/dashboard` }
    })
    if (error) throw error
  }

  async function signOut() {
    await supabase.auth.signOut()
    setUser(null)
    setProfile(null)
  }

  async function refreshProfile() {
    if (!user) return
    const p = await fetchProfile(user.id)
    setProfile(p)
  }

  return (
    <AuthContext.Provider value={{ user, profile, loading, signIn, signInWithGoogle, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
