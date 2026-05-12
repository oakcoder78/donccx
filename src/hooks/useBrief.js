import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'
import toast from 'react-hot-toast'

export function useBrief(faseId, clientId) {
  const qc = useQueryClient()

  const briefInstances = useQuery({
    queryKey: ['brief_instances', faseId],
    enabled: !!faseId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('brief_instances')
        .select('*')
        .eq('fase_id', faseId)
        .order('created_at', { ascending: false })
      if (error) {
        console.error('[useBrief] brief_instances error:', error)
        return []
      }
      return data || []
    },
  })

  const briefTemplates = useQuery({
    queryKey: ['brief_templates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('brief_templates')
        .select('id, name, operation_type, structure, is_active')
        .eq('is_active', true)
        .order('name')
      if (error) {
        console.error('[useBrief] brief_templates error:', error)
        return []
      }
      return data || []
    },
  })

  const createBrief = useMutation({
    mutationFn: async ({ fase_id, client_id, template_id, title }) => {
      const template = briefTemplates.data?.find(t => t.id === template_id)
      if (!template) throw new Error('Template não encontrado')

      const { data, error } = await supabase
        .from('brief_instances')
        .insert({
          fase_id,
          client_id,
          template_id,
          title,
          status: 'draft',
          structure_snapshot: template.structure,
          access_token: crypto.randomUUID(),
        })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['brief_instances', faseId] })
      toast.success('Brief criado com sucesso')
    },
    onError: (e) => {
      console.error('[useBrief] createBrief error:', e)
      toast.error(e.message)
    },
  })

  const updateBriefStatus = useMutation({
    mutationFn: async ({ id, status }) => {
      const updates = { status }
      if (status === 'sent') {
        updates.sent_at = new Date().toISOString()
      }
      if (status === 'completed') {
        updates.completed_at = new Date().toISOString()
      }
      const { error } = await supabase
        .from('brief_instances')
        .update(updates)
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['brief_instances', faseId] })
      toast.success('Status atualizado')
    },
    onError: (e) => {
      console.error('[useBrief] updateBriefStatus error:', e)
      toast.error(e.message)
    },
  })

  const copyPublicLink = async (access_token) => {
    const origin = window.location.origin
    const url = `${origin}/brief/${access_token}`
    try {
      await navigator.clipboard.writeText(url)
      toast.success('Link copiado para a área de transferência')
    } catch (e) {
      console.error('[useBrief] copyPublicLink error:', e)
      toast.error('Erro ao copiar link')
    }
  }

  return {
    briefInstances: briefInstances.data || [],
    briefTemplates: briefTemplates.data || [],
    createBrief,
    updateBriefStatus,
    copyPublicLink,
    isLoading: briefInstances.isLoading,
    isCreating: createBrief.isPending,
  }
}

export function useBriefResponses(instanceId) {
  const responses = useQuery({
    queryKey: ['brief_responses', instanceId],
    enabled: !!instanceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('brief_responses')
        .select('*')
        .eq('instance_id', instanceId)
      if (error) {
        console.error('[useBriefResponses] error:', error)
        return []
      }
      return data || []
    },
  })

  const attachments = useQuery({
    queryKey: ['brief_attachments', instanceId],
    enabled: !!instanceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('brief_attachments')
        .select('*')
        .eq('instance_id', instanceId)
      if (error) {
        console.error('[useBriefAttachments] error:', error)
        return []
      }
      return data || []
    },
  })

  return {
    responses: responses.data || [],
    attachments: attachments.data || [],
    isLoading: responses.isLoading,
  }
}