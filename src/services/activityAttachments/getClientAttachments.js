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
  console.log('[DEBUG] evidencias:', evidencias.map(e => ({ id: e.id, fase_id: e.fase_id })))

  // Enrich evidências: fetch fase names + project titles for unique fase_ids
  const faseIds = [...new Set(evidencias.map(e => e.fase_id).filter(Boolean))]
  console.log('[DEBUG] faseIds:', faseIds)
  let faseMap = {}

  if (faseIds.length > 0) {
    // Buscar fases — sem join (evita 400 error)
    const { data: fases, error: fasesError } = await supabase
      .from('onboarding_fases')
      .select('id, fase_type_id, onboarding_id')
      .in('id', faseIds)
    
    console.log('[DEBUG] fases result:', { count: fases?.length, error: fasesError })

    // Extrair IDs únicos para buscas separadas
    const faseTypeIds = [...new Set(fases?.map(f => f.fase_type_id).filter(Boolean) ?? [])]
    console.log('[DEBUG] faseTypeIds:', faseTypeIds)

    // Buscar nomes das fases
    let faseTypeMap = {}
    if (faseTypeIds.length > 0) {
      const { data: faseTypes, error: faseTypesError } = await supabase
        .from('onboarding_fase_types')
        .select('id, name')
        .in('id', faseTypeIds)
      
      console.log('[DEBUG] faseTypes result:', { count: faseTypes?.length, error: faseTypesError })
       
      if (faseTypes) {
        faseTypeMap = Object.fromEntries(faseTypes.map(ft => [ft.id, ft.name]))
      }
    }

    console.log('[DEBUG] faseTypeMap:', faseTypeMap)

    // Popular faseMap com faseName (projectTitle removido)
    if (fases) {
      fases.forEach(f => {
        faseMap[f.id] = {
          faseName: faseTypeMap[f.fase_type_id] || null,
          projectTitle: null
        }
      })
    }
    
    console.log('[DEBUG] faseMap:', faseMap)
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