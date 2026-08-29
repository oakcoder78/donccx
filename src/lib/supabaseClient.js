import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables')
}

// No-op lock — disables the Web Locks (LockManager) cross-tab coordination in
// @supabase/auth-js. That lock deadlocks for minutes when an app tab is
// backgrounded/throttled by the browser (e.g. left open behind the terminal)
// during a deploy: the throttled tab keeps the lock, and every new page load
// blocks inside GoTrueClient.initialize() waiting for it (login/logout stall for
// 4-5 min). Its only benefit is de-duping concurrent token refreshes across
// tabs, which Supabase's refresh-token reuse grace window already handles.
// See https://github.com/supabase/supabase/issues/42505
const noopLock = async (_name, _acquireTimeout, fn) => fn()

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    lock: noopLock,
  },
})
