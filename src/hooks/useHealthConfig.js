import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'
import toast from 'react-hot-toast'

export function useHealthConfig() {
  return useQuery({
    queryKey: ['health_config'],
    queryFn: async () => {
      const [{ data: config, error: configError }, { data: rules, error: rulesError }] = await Promise.all([
        supabase.from('health_config').select('*').single(),
        supabase.from('health_rules').select('*').order('dimension').order('label'),
      ])
      if (configError) { console.error('[useHealthConfig] health_config error:', configError); throw configError }
      if (rulesError) { console.error('[useHealthConfig] health_rules error:', rulesError); throw rulesError }
      return { config, rules }
    },
  })
}

export function useHealthConfigMutations() {
  const qc = useQueryClient()
  const invalidate = () => qc.invalidateQueries({ queryKey: ['health_config'] })

  const updateConfig = useMutation({
    mutationFn: async ({ id, ...payload }) => {
      const { data, error } = await supabase.from('health_config').update(payload).eq('id', id).select().single()
      if (error) throw error
      return data
    },
    onSuccess: () => { invalidate(); toast.success('Configuração salva') },
    onError: (e) => toast.error(e.message),
  })

  const updateRule = useMutation({
    mutationFn: async ({ id, points }) => {
      const { data, error } = await supabase.from('health_rules').update({ points }).eq('id', id).select().single()
      if (error) throw error
      return data
    },
    onSuccess: () => { invalidate(); toast.success('Regra atualizada') },
    onError: (e) => toast.error(e.message),
  })

  return { updateConfig, updateRule }
}
