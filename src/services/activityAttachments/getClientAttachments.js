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
      .select('id, file_name, file_size, file_type, storage_path, created_at, uploaded_by, fase_id, pendencia_id, profiles!uploaded_by(id, name)')
      .eq('client_id', clientId)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false }),
  ])

  if (activitiesResult.error) return { success: false, error: activitiesResult.error.message }
  if (evidenciasResult.error) return { success: false, error: evidenciasResult.error.message }

  const evidencias = evidenciasResult.data ?? []

  // Enrich evidências: fetch fase names + project titles for unique fase_ids
  const faseIds = [...new Set(evidencias.map(e => e.fase_id).filter(Boolean))]
  let faseMap = {}

  if (faseIds.length > 0) {
    const { data: fases } = await supabase
      .from('onboarding_fases')
      .select('id, fase_type_id, onboarding_id, onboarding_fase_types!fase_type_id(name), onboardings!onboarding_id(project_id, projects!project_id(id, title))')
      .in('id', faseIds)

    if (fases) {
      fases.forEach(f => {
        faseMap[f.id] = {
          faseName: f.onboarding_fase_types?.name ?? null,
          projectTitle: f.onboardings?.projects?.title ?? null,
        }
      })
    }
  }

  const activities = (activitiesResult.data ?? []).map(r => ({ ...r, _source: 'activity' }))
  const enrichedEvidencias = evidencias.map(r => ({
    ...r,
    _source: 'evidencia',
    _faseInfo: r.fase_id ? (faseMap[r.fase_id] ?? {}) : {},
  }))

  const merged = [...activities, ...enrichedEvidencias].sort(
    (a, b) => new Date(b.created_at) - new Date(a.created_at)
  )

  return { success: true, data: merged }
}
