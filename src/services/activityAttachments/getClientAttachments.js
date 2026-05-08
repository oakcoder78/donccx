import { supabase } from '../../lib/supabaseClient'

export async function getClientAttachments(clientId) {
  if (!clientId) return { success: false, error: 'clientId obrigatório' }

  const [activitiesResult, evidenciasResult] = await Promise.all([
    supabase
      .from('activity_attachments')
      .select(`
        id, file_name, file_size, file_type, storage_path, created_at, uploaded_by,
        activities!activity_id(id, title, description, type),
        profiles!uploaded_by(id, name)
      `)
      .eq('client_id', clientId)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false }),

    supabase
      .from('onboarding_evidencias')
      .select(`
        id, file_name, file_size, file_type, storage_path, created_at, uploaded_by, fase_id, pendencia_id,
        profiles!uploaded_by(id, name),
        onboarding_fases!fase_id(
          id,
          onboarding_fase_types!fase_type_id(name),
          onboardings!onboarding_id(
            projects!project_id(id, title)
          )
        )
      `)
      .eq('client_id', clientId)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false }),
  ])

  if (activitiesResult.error) return { success: false, error: activitiesResult.error.message }
  if (evidenciasResult.error) return { success: false, error: evidenciasResult.error.message }

  const activities = (activitiesResult.data ?? []).map(r => ({ ...r, _source: 'activity' }))
  const evidencias = (evidenciasResult.data ?? []).map(r => ({ ...r, _source: 'evidencia' }))

  const merged = [...activities, ...evidencias].sort(
    (a, b) => new Date(b.created_at) - new Date(a.created_at)
  )

  return { success: true, data: merged }
}
