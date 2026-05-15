import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'
import toast from 'react-hot-toast'

export function useBrief(onboardingId, clientId) {
  const qc = useQueryClient()

  const briefInstances = useQuery({
    queryKey: ['brief_instances', onboardingId],
    enabled: !!onboardingId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('brief_instances')
        .select('*, brief_views(count)')
        .eq('onboarding_id', onboardingId)
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
    mutationFn: async ({ onboarding_id, client_id, template_id, title }) => {
      const template = briefTemplates.data?.find(t => t.id === template_id)
      if (!template) throw new Error('Template não encontrado')

      const { data, error } = await supabase
        .from('brief_instances')
        .insert({
          onboarding_id,
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
      qc.invalidateQueries({ queryKey: ['brief_instances', onboardingId] })
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
      qc.invalidateQueries({ queryKey: ['brief_instances', onboardingId] })
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

  const deleteBrief = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase
        .from('brief_instances')
        .delete()
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['brief_instances', onboardingId] })
      toast.success('Questionário removido')
    },
    onError: (e) => {
      toast.error(e.message)
    },
  })

  return {
    briefInstances: briefInstances.data || [],
    briefTemplates: briefTemplates.data || [],
    createBrief,
    updateBriefStatus,
    deleteBrief,
    copyPublicLink,
    isLoading: briefInstances.isLoading,
    isCreating: createBrief.isPending,
    isDeleting: deleteBrief.isPending,
  }
}

export function useBriefCsmNotes(instanceId) {
  const qc = useQueryClient()

  const csmNotes = useQuery({
    queryKey: ['brief_csm_notes', instanceId],
    enabled: !!instanceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('brief_csm_notes')
        .select('id, question_id, note_text, is_visible, created_by, created_at, updated_at, origin, client_email, client_name, csm_reply, replied_at, replied_by')
        .eq('instance_id', instanceId)
        .order('created_at', { ascending: true })
      if (error) {
        console.error('[useBriefCsmNotes] error:', error)
        return []
      }
      return data || []
    },
  })

  const clientQuestions = useQuery({
    queryKey: ['brief_client_questions', instanceId],
    enabled: !!instanceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('brief_csm_notes')
        .select('id, question_id, note_text, is_visible, client_email, client_name, csm_reply, replied_at, replied_by, created_at')
        .eq('instance_id', instanceId)
        .eq('origin', 'client')
        .order('created_at', { ascending: true })
      if (error) {
        console.error('[useBriefCsmNotes] clientQuestions error:', error)
        return []
      }
      return data || []
    },
  })

  const upsertCsmNote = useMutation({
    mutationFn: async ({ id, question_id, note_text, is_visible }) => {
      if (id) {
        const { error } = await supabase
          .from('brief_csm_notes')
          .update({ note_text, is_visible, updated_at: new Date().toISOString() })
          .eq('id', id)
        if (error) throw error
      } else {
        const { data: { user } } = await supabase.auth.getUser()
        const { error } = await supabase
          .from('brief_csm_notes')
          .insert({ instance_id: instanceId, question_id: question_id ?? null, note_text, is_visible: is_visible ?? false, created_by: user?.id })
        if (error) throw error
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['brief_csm_notes', instanceId] })
      toast.success('Nota salva')
    },
    onError: (e) => {
      console.error('[useBriefCsmNotes] upsert error:', e)
      toast.error(e.message)
    },
  })

  const deleteCsmNote = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase
        .from('brief_csm_notes')
        .delete()
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['brief_csm_notes', instanceId] })
      toast.success('Nota removida')
    },
    onError: (e) => {
      console.error('[useBriefCsmNotes] delete error:', e)
      toast.error(e.message)
    },
  })

  const replyToQuestion = useMutation({
    mutationFn: async ({ id, csm_reply }) => {
      const { data: { user } } = await supabase.auth.getUser()
      const { error } = await supabase
        .from('brief_csm_notes')
        .update({
          csm_reply,
          replied_at: new Date().toISOString(),
          replied_by: user?.id ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['brief_csm_notes', instanceId] })
      qc.invalidateQueries({ queryKey: ['brief_client_questions', instanceId] })
      toast.success('Resposta salva')
    },
    onError: (e) => {
      console.error('[useBriefCsmNotes] replyToQuestion error:', e)
      toast.error(e.message)
    },
  })

  return {
    csmNotes: csmNotes.data || [],
    clientQuestions: clientQuestions.data || [],
    upsertCsmNote,
    deleteCsmNote,
    replyToQuestion,
    isLoading: csmNotes.isLoading,
    isUpsertingNote: upsertCsmNote.isPending,
    isReplying: replyToQuestion.isPending,
  }
}

export function useBriefViews(instanceId) {
  return useQuery({
    queryKey: ['brief_views', instanceId],
    enabled: !!instanceId,
    queryFn: async () => {
      const { data } = await supabase
        .from('brief_views')
        .select('email, viewed_at')
        .eq('instance_id', instanceId)
        .order('viewed_at', { ascending: false })
      return data || []
    },
  })
}

export function useBriefUnansweredCount(instanceIds) {
  return useQuery({
    queryKey: ['brief_unanswered_count', instanceIds],
    enabled: Array.isArray(instanceIds) && instanceIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from('brief_csm_notes')
        .select('id')
        .in('instance_id', instanceIds)
        .eq('origin', 'client')
        .is('csm_reply', null)
      return data?.length ?? 0
    },
  })
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