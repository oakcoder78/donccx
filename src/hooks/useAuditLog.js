import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabaseClient'

export function useAuditLog() {
  const { user, profile } = useAuth()

  async function logAction(action, entityType, entityId, entityName, oldValue = null, newValue = null) {
    try {
      await supabase.from('audit_logs').insert({
        user_id: user?.id ?? null,
        user_name: profile?.name || user?.email || null,
        action,
        entity_type: entityType,
        entity_id: entityId != null ? String(entityId) : null,
        entity_name: entityName ?? null,
        old_value: oldValue,
        new_value: newValue,
      })
    } catch (err) {
      console.error('[useAuditLog] failed to log:', err)
    }
  }

  return { logAction }
}
