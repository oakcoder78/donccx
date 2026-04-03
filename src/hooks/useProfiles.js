import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'
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
  const invalidate = () => qc.invalidateQueries({ queryKey: ['profiles'] })

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }) => {
      const { data, error } = await supabase.from('profiles').update({ status }).eq('id', id).select().single()
      if (error) throw error
      return data
    },
    onSuccess: () => { invalidate(); toast.success('Status atualizado') },
    onError: (e) => toast.error(e.message),
  })

  const updateRole = useMutation({
    mutationFn: async ({ id, role }) => {
      const { data, error } = await supabase.from('profiles').update({ role }).eq('id', id).select().single()
      if (error) throw error
      return data
    },
    onSuccess: () => { invalidate(); toast.success('Perfil atualizado') },
    onError: (e) => toast.error(e.message),
  })

  return { updateStatus, updateRole }
}
