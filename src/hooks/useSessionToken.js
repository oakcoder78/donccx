import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'

export function useSessionToken() {
  const [token, setToken] = useState(null)
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setToken(session?.access_token ?? null)
    })
  }, [])
  return token
}
