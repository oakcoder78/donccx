import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'

function getMostRelevant(projects) {
  if (projects.length === 1) return projects[0]
  const priority = { paused: 3, delayed: 2, on_time: 1 }
  return [...projects].sort((a, b) => {
    const pa = priority[a.displayStatus] || 0
    const pb = priority[b.displayStatus] || 0
    if (pa !== pb) return pb - pa
    return 0
  })[0]
}

export function useProjectCockpit() {
  const { profile } = useAuth()

  return useQuery({
    queryKey: ['projects_cockpit'],
    queryFn: async () => {
      const profileId = profile?.id
      const role = profile?.role
      if (!role || role === 'analyst') return []

      const { data: projects, error } = await supabase
        .from('projects')
        .select(`
          id, client_id, title, type, status, start_date, end_date, created_at, onboarding_id,
          client:clients!client_id(id, fantasy_name, abc_class, csm_id),
          onboarding:onboardings!onboarding_id(id, situacao_geral, fase_atual_id),
          current_phase:onboarding_fases!fase_atual_id(id, fase_type_id, status, planned_end, planned_start, display_order)
        `)
        .in('status', ['planejado', 'em_andamento'])
        .order('created_at', { ascending: false })

      if (error) throw error
      if (!projects?.length) return []

      let filtered = projects
      if (role === 'csm') {
        filtered = projects.filter(p => p.client?.csm_id === profileId)
      }
      if (!filtered.length) return []

      const onbIds = [...new Set(filtered.filter(p => p.onboarding_id).map(p => p.onboarding_id))]
      let fasesByOnboarding = {}
      let faseTypesMap = {}

      if (onbIds.length) {
        const { data: fases } = await supabase
          .from('onboarding_fases')
          .select('id, onboarding_id, fase_type_id, status, planned_start, planned_end, display_order')
          .in('onboarding_id', onbIds)
          .order('display_order')

        for (const f of fases ?? []) {
          if (!fasesByOnboarding[f.onboarding_id]) fasesByOnboarding[f.onboarding_id] = []
          fasesByOnboarding[f.onboarding_id].push(f)
        }

        const typeIds = [...new Set((fases ?? []).map(f => f.fase_type_id))]
        if (typeIds.length) {
          const { data: faseTypes } = await supabase
            .from('onboarding_fase_types')
            .select('id, name')
            .in('id', typeIds)

          for (const ft of faseTypes ?? []) {
            faseTypesMap[ft.id] = ft.name
          }
        }
      }

      let activitiesByOnboarding = {}

      if (onbIds.length) {
        const { data: activities } = await supabase
          .from('onboarding_activities')
          .select(`
            id, onboarding_id, fase_id, activity_type_id, title, status, due_date, display_order,
            activity_type:onboarding_activity_types!activity_type_id(name)
          `)
          .in('onboarding_id', onbIds)
          .in('status', ['pendente', 'em_andamento'])
          .order('due_date', { ascending: true, nullsFirst: false })

        for (const a of activities ?? []) {
          if (!activitiesByOnboarding[a.onboarding_id]) activitiesByOnboarding[a.onboarding_id] = []
          activitiesByOnboarding[a.onboarding_id].push({
            id: a.id,
            faseId: a.fase_id,
            typeName: a.activity_type?.name || null,
            title: a.title,
            status: a.status,
            dueDate: a.due_date,
            displayOrder: a.display_order,
          })
        }
      }

      const internalIds = filtered.filter(p => !p.onboarding_id).map(p => p.id)
      let milestonesByProject = {}

      if (internalIds.length) {
        const { data: milestones } = await supabase
          .from('milestones')
          .select('id, project_id, title, status, progress, due_date')
          .in('project_id', internalIds)

        for (const m of milestones ?? []) {
          if (!milestonesByProject[m.project_id]) milestonesByProject[m.project_id] = []
          milestonesByProject[m.project_id].push(m)
        }
      }

      const today = new Date().toISOString().split('T')[0]
      const projectMap = {}

      for (const p of filtered) {
        const client = p.client || {}
        const onboarding = p.onboarding || {}
        const phaseFases = fasesByOnboarding[p.onboarding_id] || []
        const projectMilestones = milestonesByProject[p.id] || []
        const projectActivities = activitiesByOnboarding[p.onboarding_id] || []

        let progress = 0
        if (p.onboarding_id && phaseFases.length) {
          const total = phaseFases.length
          const completed = phaseFases.filter(f => f.status === 'concluida').length
          const active = phaseFases.filter(f => f.status === 'ativa').length
          progress = Math.round((completed + active * 0.5) / total * 100)
        } else if (!p.onboarding_id && projectMilestones.length) {
          progress = Math.round(
            projectMilestones.reduce((s, m) => s + (m.progress || 0), 0) / projectMilestones.length
          )
        }

        let displayStatus = 'on_time'
        if (onboarding.situacao_geral === 'travado') {
          displayStatus = 'paused'
        } else if (p.onboarding_id && p.current_phase?.planned_end) {
          if (p.current_phase.planned_end < today && p.current_phase.status !== 'concluida') {
            displayStatus = 'delayed'
          }
        } else if (!p.onboarding_id && projectMilestones.length) {
          const activeMs = projectMilestones.filter(
            m => m.status === 'em_andamento' || m.status === 'planejado'
          )
          if (activeMs.some(m => m.due_date && m.due_date < today)) {
            displayStatus = 'delayed'
          }
        }

        const currentPhase = p.current_phase
          ? {
              id: p.current_phase.id,
              name: faseTypesMap[p.current_phase.fase_type_id] || null,
              status: p.current_phase.status,
              plannedEnd: p.current_phase.planned_end,
            }
          : null

        const activeProject = {
          id: p.id,
          title: p.title,
          type: p.type,
          status: p.status,
          onboardingId: p.onboarding_id,
          situation: onboarding.situacao_geral || null,
          totalPhases: phaseFases.length,
          completedPhases: phaseFases.filter(f => f.status === 'concluida').length,
          activePhases: phaseFases.filter(f => f.status === 'ativa').length,
          currentPhase,
          milestones: projectMilestones.map(m => ({
            id: m.id,
            title: m.title,
            status: m.status,
            progress: m.progress,
            dueDate: m.due_date,
          })),
          progress,
          activities: projectActivities,
          allFases: phaseFases.map(f => ({
            id: f.id,
            faseTypeId: f.fase_type_id,
            name: faseTypesMap[f.fase_type_id] || null,
            status: f.status,
            plannedStart: f.planned_start,
            plannedEnd: f.planned_end,
            displayOrder: f.display_order,
          })),
          displayStatus,
        }

        const cid = client.id
        if (!projectMap[cid]) {
          projectMap[cid] = {
            clientId: cid,
            clientName: client.fantasy_name || client.name,
            abcClass: client.abc_class || null,
            projects: [],
          }
        }
        projectMap[cid].projects.push(activeProject)
      }

      const rows = Object.values(projectMap)
      for (const row of rows) {
        const relevant = getMostRelevant(row.projects)
        row.currentPhase = relevant.currentPhase?.name || null
        row.progress = relevant.progress
        row.displayStatus = relevant.displayStatus
      }

      rows.sort((a, b) => a.clientName.localeCompare(b.clientName))
      return rows
    },
    staleTime: 30 * 1000,
    retry: 1,
    gcTime: 5 * 60 * 1000,
    enabled: !!profile?.role && profile?.role !== 'analyst',
  })
}
