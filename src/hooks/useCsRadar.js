import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'

const EXCLUDED_STAGES = ['Onboarding', 'Em espera', 'Churned']
const NOTA_RMC_EXCLUIR = { type: 'nota', title: 'RMC visualizado' }

function isoDate(d) {
  if (!d) return null
  return d instanceof Date ? d.toISOString().split('T')[0] : d
}

export function useCsRadar(filters) {
  const { dateFrom, dateTo, responsibleId, clientIds, activityTypes, segmentIds } = filters || {}

  return useQuery({
    queryKey: ['cs-radar', filters],
    queryFn: async () => {
      const df = isoDate(dateFrom)
      const dt = isoDate(dateTo)
      const now = new Date()

      // ── 1. Stages for RMC denominator ──
      const { data: allStages } = await supabase.from('stages').select('id, name')
      const excludedStageIds = (allStages || [])
        .filter(s => EXCLUDED_STAGES.includes(s.name))
        .map(s => s.id)

      // ── 2. Eligible clients (RMC denominator) ──
      let clientQuery = supabase
        .from('clients')
        .select('id, fantasy_name, health_total, abc_class, stage_id, csm_id')
        .not('stage_id', 'in', `(${excludedStageIds.join(',')})`)

      if (segmentIds?.length) {
        clientQuery = clientQuery.in('segment_id', segmentIds)
      }
      const { data: clients } = await clientQuery
      const eligibleIds = (clients || []).map(c => c.id)

      // ── 3. Activities ──
      let actQuery = supabase
        .from('activities')
        .select(`
          id, type, title, activity_date, client_id, responsible_id,
          client:clients!activities_client_id_fkey(fantasy_name, health_total, abc_class),
          responsible:profiles!activities_responsible_id_fkey(name)
        `)
        .order('activity_date', { ascending: false })

      if (df) actQuery = actQuery.gte('activity_date', df)
      if (dt) actQuery = actQuery.lte('activity_date', dt)

      if (responsibleId) actQuery = actQuery.eq('responsible_id', responsibleId)
      if (clientIds?.length) actQuery = actQuery.in('client_id', clientIds)
      if (activityTypes?.length) actQuery = actQuery.in('type', activityTypes)

      const { data: rawActivities } = await actQuery

      const activities = (rawActivities || []).filter(
        a => !(a.type === NOTA_RMC_EXCLUIR.type && a.title === NOTA_RMC_EXCLUIR.title)
      )

      // ── 4. KPIs from activities ──
      const totalActivities = activities.length
      const touchedClientIds = new Set(activities.map(a => a.client_id))
      const clientsWithTouch = touchedClientIds.size

      // ── 5. Group: byType ──
      const typeCount = {}
      for (const a of activities) {
        typeCount[a.type] = (typeCount[a.type] || 0) + 1
      }
      const byType = Object.entries(typeCount)
        .map(([type, count]) => ({ type, count }))
        .sort((a, b) => b.count - a.count)

      // ── 6. Group: byResponsible ──
      const respCount = {}
      for (const a of activities) {
        const name = a.responsible?.name || '—'
        respCount[name] = (respCount[name] || 0) + 1
      }
      const byResponsible = Object.entries(respCount)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)

      // ── 7. Heatmap ──
      const dayCount = {}
      for (const a of activities) {
        const d = a.activity_date
        dayCount[d] = (dayCount[d] || 0) + 1
      }
      const heatmap = Object.entries(dayCount)
        .map(([date, count]) => ({ date, count }))
        .sort((a, b) => a.date.localeCompare(b.date))

      // ── 8. RMCs published ──
      let rmcQuery = supabase
        .from('client_reports')
        .select('client_id, period, published_at')
        .eq('status', 'published')

      if (df) rmcQuery = rmcQuery.gte('published_at', `${df}T00:00:00Z`)
      if (dt) rmcQuery = rmcQuery.lte('published_at', `${dt}T23:59:59Z`)
      const { data: rmcs } = await rmcQuery

      const rmcPublished = (rmcs || []).length
      const rmcExpected = (clients || []).length

      // ── 9. Projects with milestone progress ──
      let msQuery = supabase
        .from('milestones')
        .select('project_id')
        .in('status', ['em_andamento', 'done'])

      if (df) msQuery = msQuery.gte('updated_at', `${df}T00:00:00Z`)
      if (dt) msQuery = msQuery.lte('updated_at', `${dt}T23:59:59Z`)
      const { data: progMilestones } = await msQuery

      const progProjectIds = new Set((progMilestones || []).map(m => m.project_id))
      const projectsWithProgress = progProjectIds.size

      // ── 10. Client rows (batched) ──
      const { data: allProjects } = await supabase
        .from('projects')
        .select('id, title, client_id, created_at')
        .in('client_id', eligibleIds)
        .in('status', ['planejado', 'em_andamento'])
        .order('created_at', { ascending: false })

      const primaryProject = {}
      const extraCount = {}
      for (const p of allProjects || []) {
        if (!primaryProject[p.client_id]) {
          primaryProject[p.client_id] = p
          extraCount[p.client_id] = 0
        } else {
          extraCount[p.client_id]++
        }
      }

      const projectIds = Object.values(primaryProject).map(p => p.id)
      const { data: allMilestones } = await supabase
        .from('milestones')
        .select('project_id, title, progress, status, due_date')
        .in('project_id', projectIds)
        .order('due_date', { ascending: true })

      const msByProject = {}
      for (const m of allMilestones || []) {
        if (!msByProject[m.project_id]) msByProject[m.project_id] = []
        msByProject[m.project_id].push(m)
      }

      function findActiveMilestone(projectId) {
        const msList = msByProject[projectId] || []
        const inProgress = msList.find(m => m.status === 'em_andamento')
        if (inProgress) return inProgress
        return msList[0] || null
      }

      const rmcByClient = {}
      for (const r of rmcs || []) {
        if (!rmcByClient[r.client_id] || new Date(r.published_at) > new Date(rmcByClient[r.client_id].published_at)) {
          rmcByClient[r.client_id] = r
        }
      }

      const activityCountByClient = {}
      const lastActByClient = {}
      for (const a of activities) {
        activityCountByClient[a.client_id] = (activityCountByClient[a.client_id] || 0) + 1
        const prev = lastActByClient[a.client_id]
        if (!prev || a.activity_date > prev.activity_date) {
          lastActByClient[a.client_id] = a
        }
      }

      const clientRows = (clients || []).map(c => {
        const lastAct = lastActByClient[c.id] || null
        const lastRmc = rmcByClient[c.id] || null
        const project = primaryProject[c.id] || null
        const milestone = project ? findActiveMilestone(project.id) : null

        const daysSinceTouch = lastAct
          ? Math.floor((now - new Date(lastAct.activity_date + 'T00:00:00')) / (1000 * 60 * 60 * 24))
          : 999

        let semaphore = 'green'
        if (daysSinceTouch > 30) semaphore = 'red'
        else if (!lastRmc) semaphore = 'yellow'
        else if (!activityCountByClient[c.id]) semaphore = 'yellow'

        return {
          id: c.id,
          fantasy_name: c.fantasy_name,
          health_total: c.health_total,
          abc_class: c.abc_class,
          last_activity_date: lastAct?.activity_date || null,
          last_activity_type: lastAct?.type || null,
          activity_count: activityCountByClient[c.id] || 0,
          last_rmc_period: lastRmc?.period || null,
          active_project_title: project?.title || null,
          active_milestone_title: milestone?.title || null,
          active_milestone_progress: milestone?.progress || null,
          extra_projects: extraCount[c.id] || 0,
          semaphore,
        }
      })

      return {
        kpis: {
          totalActivities,
          clientsWithTouch,
          rmcPublished,
          rmcExpected,
          projectsWithProgress,
        },
        byType,
        byResponsible,
        heatmap,
        clients: clientRows,
      }
    },
    enabled: true,
  })
}
