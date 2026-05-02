import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import toast from 'react-hot-toast'

export function useProjects(clientId) {
  return useQuery({
    queryKey: ['projects', clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('projects')
        .select('*, responsible:profiles(id, name), onboarding:onboardings!onboarding_id(id, situacao_geral)')
        .eq('client_id', clientId)
        .order('created_at')
      if (error) { console.error('[useProjects]', error); return [] }

      if (!data?.length) return data ?? []

      const onbIds = data.filter(p => p.onboarding_id).map(p => p.onboarding_id)
      if (onbIds.length) {
        const { data: fases } = await supabase
          .from('onboarding_fases')
          .select('*')
          .in('onboarding_id', onbIds)
        const fasesMap = {}
        for (const f of fases ?? []) {
          if (!fasesMap[f.onboarding_id]) fasesMap[f.onboarding_id] = []
          fasesMap[f.onboarding_id].push(f)
        }
        return data.map(p => ({ ...p, onboarding_fases: fasesMap[p.onboarding_id] ?? [] }))
      }
      return data
    },
    retry: 0,
  })
}

export function useAllProjects() {
  return useQuery({
    queryKey: ['projects_all'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('projects')
        .select('*, client:clients(id, name, fantasy_name), responsible:profiles(id, name), onboarding:onboardings!onboarding_id(id, situacao_geral)')
        .order('created_at', { ascending: false })
      if (error) { console.error('[useAllProjects]', error); return [] }

      if (!data?.length) return data ?? []

      const onbIds = data.filter(p => p.onboarding_id).map(p => p.onboarding_id)
      if (onbIds.length) {
        const { data: fases } = await supabase
          .from('onboarding_fases')
          .select('*')
          .in('onboarding_id', onbIds)
        const fasesMap = {}
        for (const f of fases ?? []) {
          if (!fasesMap[f.onboarding_id]) fasesMap[f.onboarding_id] = []
          fasesMap[f.onboarding_id].push(f)
        }
        return data.map(p => ({ ...p, onboarding_fases: fasesMap[p.onboarding_id] ?? [] }))
      }
      return data
    },
    retry: 0,
  })
}

export function useUpdateProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, client_id, title, description, responsible_id, start_date, end_date, status }) => {
      const payload = { title, status }
      payload.description    = description    || null
      payload.responsible_id = responsible_id || null
      payload.start_date     = start_date     || null
      payload.end_date       = end_date       || null
      const { error } = await supabase.from('projects').update(payload).eq('id', id)
      if (error) throw error
    },
    onSuccess: (_, { client_id }) => {
      qc.invalidateQueries({ queryKey: ['projects', client_id] })
      qc.invalidateQueries({ queryKey: ['projects_all'] })
      toast.success('Projeto atualizado')
    },
    onError: (e) => toast.error(e.message),
  })
}

export function useUpdateProjectStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, status }) => {
      const { error } = await supabase.from('projects').update({ status }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects_all'] })
      qc.invalidateQueries({ queryKey: ['projects'] })
    },
    onError: (e) => toast.error(e.message),
  })
}

export function useProjectMutations(clientId) {
  const qc = useQueryClient()
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['projects', clientId] })
    qc.invalidateQueries({ queryKey: ['projects_all'] })
    qc.invalidateQueries({ queryKey: ['client', String(clientId)] })
  }

  const createProject = useMutation({
    mutationFn: async (payload) => {
      const { data, error } = await supabase
        .from('projects')
        .insert({ ...payload, client_id: clientId })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => { invalidate(); toast.success('Projeto criado') },
    onError: (e) => toast.error(e.message),
  })

  const updateProject = useMutation({
    mutationFn: async ({ id, ...payload }) => {
      const { data, error } = await supabase
        .from('projects')
        .update(payload)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => { invalidate(); toast.success('Projeto atualizado') },
    onError: (e) => toast.error(e.message),
  })

  const removeProject = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('projects').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => { invalidate(); toast.success('Projeto removido') },
    onError: (e) => toast.error(e.message),
  })

  return { createProject, updateProject, removeProject }
}

export function useDeleteProject() {
  const qc       = useQueryClient()
  const navigate = useNavigate()

  return useMutation({
    mutationFn: async ({ id, onboarding_id, title }) => {
      const { error: projErr } = await supabase.from('projects').delete().eq('id', id)
      if (projErr) throw projErr

      if (onboarding_id) {
        const { error: onbErr } = await supabase.from('onboardings').delete().eq('id', onboarding_id)
        if (onbErr) throw onbErr
      }

      await supabase.from('audit_logs').insert({
        entity_type: 'project',
        action:      'deleted',
        entity_name: title,
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects_all'] })
      qc.invalidateQueries({ queryKey: ['projects'] })
      qc.invalidateQueries({ queryKey: ['onboardings_all'] })
      toast.success('Projeto excluído')
      navigate('/projetos')
    },
    onError: (e) => toast.error(e.message),
  })
}
