import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'
import toast from 'react-hot-toast'

export function useBriefTemplates() {
  const qc = useQueryClient()

  const briefTemplates = useQuery({
    queryKey: ['brief_templates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('brief_templates')
        .select('*')
        .order('name')
      if (error) {
        console.error('[useBriefTemplates] error:', error)
        return []
      }
      return data || []
    },
  })

  const createTemplate = useMutation({
    mutationFn: async ({ name, operation_type, structure, is_active = false }) => {
      const { data, error } = await supabase
        .from('brief_templates')
        .insert({ name, operation_type, structure, is_active })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['brief_templates'] })
      toast.success('Template criado com sucesso')
    },
    onError: (e) => {
      console.error('[useBriefTemplates] create error:', e)
      toast.error(e.message)
    },
  })

  const updateTemplate = useMutation({
    mutationFn: async ({ id, name, operation_type, structure, is_active }) => {
      const updates = { name, operation_type, structure }
      if (is_active !== undefined) updates.is_active = is_active
      const { error } = await supabase
        .from('brief_templates')
        .update(updates)
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['brief_templates'] })
      toast.success('Template atualizado')
    },
    onError: (e) => {
      console.error('[useBriefTemplates] update error:', e)
      toast.error(e.message)
    },
  })

  const toggleActive = useMutation({
    mutationFn: async ({ id, is_active }) => {
      const { error } = await supabase
        .from('brief_templates')
        .update({ is_active })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['brief_templates'] })
    },
    onError: (e) => {
      console.error('[useBriefTemplates] toggle error:', e)
      toast.error(e.message)
    },
  })

  const deleteTemplate = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase
        .from('brief_templates')
        .delete()
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['brief_templates'] })
      toast.success('Template removido')
    },
    onError: (e) => {
      console.error('[useBriefTemplates] delete error:', e)
      toast.error(e.message)
    },
  })

  return {
    briefTemplates: briefTemplates.data || [],
    createTemplate,
    updateTemplate,
    toggleActive,
    deleteTemplate,
    isLoading: briefTemplates.isLoading,
    isSaving: createTemplate.isPending || updateTemplate.isPending,
  }
}