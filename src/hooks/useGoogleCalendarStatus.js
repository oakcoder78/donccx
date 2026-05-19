import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabaseClient'

const SUPABASE_URL = 'https://etfeqblaeuhaobefxilp.supabase.co'
const REDIRECT_URI = `${SUPABASE_URL}/functions/v1/google-calendar-callback`
const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
].join(' ')

export function useGoogleCalendarStatus() {
  const { user } = useAuth()
  const utils = useQueryClient()

  const query = useQuery({
    queryKey: ['google-config', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_google_configs')
        .select('refresh_token, tokenexpiry')
        .eq('user_id', user.id)
        .maybeSingle()
      if (error) {
        if (error.code !== 'PGRST116') console.error('[google-config]', error.message)
        return null
      }
      return data
    },
  })

  const isConnected = !!(query.data?.refresh_token)

  function disconnectGoogleCalendar() {
    return supabase
      .from('user_google_configs')
      .delete()
      .eq('user_id', user.id)
      .then(({ error }) => {
        if (error) throw error
        invalidate()
      })
  }

  function connectGoogleCalendar() {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID
    if (!clientId) {
      return
    }
    const url = new URL('https://accounts.google.com/o/oauth2/auth')
    url.searchParams.set('client_id', clientId)
    url.searchParams.set('redirect_uri', REDIRECT_URI)
    url.searchParams.set('response_type', 'code')
    url.searchParams.set('scope', SCOPES)
    url.searchParams.set('access_type', 'offline')
    url.searchParams.set('prompt', 'consent')
    url.searchParams.set('state', `${user.id}|${window.location.origin}`)
    window.location.href = url.toString()
  }

  function invalidate() {
    utils.invalidateQueries({ queryKey: ['google-config', user?.id] })
  }

  return {
    isLoading: query.isLoading,
    isConnected,
    error: query.error,
    connectGoogleCalendar,
    disconnectGoogleCalendar,
    invalidate,
  }
}
