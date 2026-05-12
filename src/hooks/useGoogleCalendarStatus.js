import { useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabaseClient'
import toast from 'react-hot-toast'

const SUPABASE_URL = 'https://etfeqblaeuhaobefxilp.supabase.co'
const REDIRECT_URI = `${SUPABASE_URL}/functions/v1/google-calendar-callback`
const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
].join(' ')

export function useGoogleCalendarStatus() {
  const { user } = useAuth()
  const utils = useQueryClient()
  const wasConnectedRef = useRef(false)

  const query = useQuery({
    queryKey: ['google-config', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_google_configs')
        .select('refresh_token, tokenexpiry')
        .eq('user_id', user.id)
        .single()
      if (error) throw error
      return data
    },
  })

  useEffect(() => {
    if (query.isSuccess && query.data?.refresh_token && !wasConnectedRef.current) {
      wasConnectedRef.current = true
      toast.success('Google Calendar conectado!')
    }
  }, [query.isSuccess, query.data?.refresh_token])

  const isConnected = !!(query.data?.refresh_token)
  const isExpired = query.data?.tokenexpiry
    ? new Date(query.data.tokenexpiry).getTime() < Date.now()
    : false

  function connectGoogleCalendar() {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID
    if (!clientId) {
      toast.error('VITE_GOOGLE_CLIENT_ID não configurado')
      return
    }
    const url = new URL('https://accounts.google.com/o/oauth2/auth')
    url.searchParams.set('client_id', clientId)
    url.searchParams.set('redirect_uri', REDIRECT_URI)
    url.searchParams.set('response_type', 'code')
    url.searchParams.set('scope', SCOPES)
    url.searchParams.set('access_type', 'offline')
    url.searchParams.set('prompt', 'consent')
    url.searchParams.set('state', user.id)
    window.location.href = url.toString()
  }

  function invalidate() {
    utils.invalidateQueries({ queryKey: ['google-config', user?.id] })
  }

  return {
    isLoading: query.isLoading,
    isConnected,
    isExpired,
    error: query.error,
    connectGoogleCalendar,
    invalidate,
  }
}
