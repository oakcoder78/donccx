import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'
import toast from 'react-hot-toast'

// ──────────────────────────────────────────────
// Lista relatórios de um cliente (autenticado)
// ──────────────────────────────────────────────
export function useClientReports(clientId) {
  return useQuery({
    queryKey: ['client_reports', clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_reports')
        .select('*, report_views(count)')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false })
      if (error) { console.error('[useClientReports]', error); return [] }
      return data ?? []
    },
    retry: 0,
  })
}

// ──────────────────────────────────────────────
// Relatório único por ID (autenticado, editor)
// ──────────────────────────────────────────────
export function useReport(reportId) {
  return useQuery({
    queryKey: ['report', reportId],
    enabled: !!reportId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_reports')
        .select('*')
        .eq('id', reportId)
        .single()
      if (error) { console.error('[useReport]', error); return null }
      return data
    },
    retry: 0,
    staleTime: 10 * 1000,
  })
}

// ──────────────────────────────────────────────
// Visualizações de um relatório
// ──────────────────────────────────────────────
export function useReportViews(reportId) {
  return useQuery({
    queryKey: ['report_views', reportId],
    enabled: !!reportId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('report_views')
        .select('*')
        .eq('report_id', reportId)
        .order('viewed_at', { ascending: false })
      if (error) { console.error('[useReportViews]', error); return [] }
      return data ?? []
    },
    retry: 0,
  })
}

// ──────────────────────────────────────────────
// Mutações: criar, salvar, publicar, deletar, autorizar e-mail
// ──────────────────────────────────────────────
export function useReportMutations(clientId) {
  const qc = useQueryClient()

  function invalidate(id) {
    qc.invalidateQueries({ queryKey: ['client_reports', clientId] })
    if (id) qc.invalidateQueries({ queryKey: ['report', id] })
  }

  const createReport = useMutation({
    mutationFn: async (payload) => {
      const { data, error } = await supabase
        .from('client_reports')
        .insert({ ...payload, client_id: clientId })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => { invalidate(); toast.success('Relatório criado') },
    onError: (e) => toast.error(e.message),
  })

  const updateReport = useMutation({
    mutationFn: async ({ id, ...payload }) => {
      const { data, error } = await supabase
        .from('client_reports')
        .update(payload)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: (_, vars) => { invalidate(vars.id); toast.success('Relatório salvo') },
    onError: (e) => toast.error(e.message),
  })

  const publishReport = useMutation({
    mutationFn: async ({ id, html_content }) => {
      const { data, error } = await supabase
        .from('client_reports')
        .update({
          status:       'published',
          published_at: new Date().toISOString(),
          html_content,
        })
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: (_, vars) => { invalidate(vars.id); toast.success('Relatório publicado!') },
    onError: (e) => toast.error(e.message),
  })

  const deleteReport = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('client_reports').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => { invalidate(); toast.success('Relatório removido') },
    onError: (e) => toast.error(e.message),
  })

  const allowEmail = useMutation({
    mutationFn: async ({ id, email, currentEmails }) => {
      const normalised = email.trim().toLowerCase()
      const updated = [...new Set([...(currentEmails || []), normalised])]
      const { data, error } = await supabase
        .from('client_reports')
        .update({ allowed_emails: updated })
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: (data) => { invalidate(data.id); toast.success('E-mail autorizado') },
    onError: (e) => toast.error(e.message),
  })

  return { createReport, updateReport, publishReport, deleteReport, allowEmail }
}
