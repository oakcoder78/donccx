import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabaseClient'

export function useNotifications() {
  const { profile } = useAuth()
  const [unreadCount, setUnreadCount] = useState(0)

  useEffect(() => {
    if (profile?.role !== 'admin') {
      setUnreadCount(0)
      return
    }

    let cancelled = false

    async function fetchUnread() {
      const { count } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('read', false)
      if (!cancelled) setUnreadCount(count ?? 0)
    }

    fetchUnread()
    const interval = setInterval(fetchUnread, 30_000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [profile?.role])

  const markAsRead = useCallback(async () => {
    if (profile?.role !== 'admin') return
    await supabase
      .from('notifications')
      .update({ read: true })
      .eq('read', false)
    setUnreadCount(0)
  }, [profile?.role])

  return { unreadCount, markAsRead }
}
