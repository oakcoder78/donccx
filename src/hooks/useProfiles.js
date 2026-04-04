import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'
import { useAuditLog } from './useAuditLog'
import toast from 'react-hot-toast'

export function useProfiles() {
  return useQuery({
    queryKey: ['profiles'],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('*').order('name')
      if (error) { console.error('[useProfiles] query error:', error); return [] }
      return data ?? []
    },
    retry: 0,
  })
}

export function useProfilesMutations() {
  const qc = useQueryClient()
  const { logAction } = useAuditLog()
  const invalidate = () => qc.invalidateQueries({ queryKey: ['profiles'] })

  const updateStatus = useMutation({
    mutationFn: async ({ id, status, name }) => {
      const { data, error } = await supabase.from('profiles').update({ status }).eq('id', id).select().single()
      if (error) throw error
      const action = status === 'blocked' ? 'deactivate_user' : status === 'active' ? 'activate_user' : 'update_user_status'
      await logAction(action, 'user', id, name || String(id), null, { status })
      return data
    },
    onSuccess: () => { invalidate(); toast.success('Status atualizado') },
    onError: (e) => toast.error(e.message),
  })

  const updateRole = useMutation({
    mutationFn: async ({ id, role, name }) => {
      const { data, error } = await supabase.from('profiles').update({ role }).eq('id', id).select().single()
      if (error) throw error
      await logAction('change_user_role', 'user', id, name || String(id), null, { role })
      return data
    },
    onSuccess: () => { invalidate(); toast.success('Perfil atualizado') },
    onError: (e) => toast.error(e.message),
  })

  const updateProfile = useMutation({
    mutationFn: async ({ id, name, avatar_url, email_secondary, phone, phone_is_whatsapp }) => {
      const fields = {}
      if (name !== undefined) fields.name = name
      if (avatar_url !== undefined) fields.avatar_url = avatar_url
      if (email_secondary !== undefined) fields.email_secondary = email_secondary
      if (phone !== undefined) fields.phone = phone
      if (phone_is_whatsapp !== undefined) fields.phone_is_whatsapp = phone_is_whatsapp

      const { data, error } = await supabase.from('profiles').update(fields).eq('id', id).select().single()
      if (error) throw error
      await logAction('update_user', 'user', id, name || String(id), null, fields)
      return data
    },
    onSuccess: () => { invalidate(); toast.success('Usuário atualizado') },
    onError: (e) => toast.error(e.message),
  })

  return { updateStatus, updateRole, updateProfile }
}
