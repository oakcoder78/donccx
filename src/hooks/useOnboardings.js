import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'
import toast from 'react-hot-toast'

export function useOnboardings(clientId) {
  return useQuery({
    queryKey: ['onboardings', clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const { data: onbs, error } = await supabase
        .from('onboardings')
        .select('*, csm:profiles(id, name), onboarding_capabilities(*, capability_type:onboarding_capability_types(*))')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false })
      if (error) { console.error('[useOnboardings]', error); return [] }
      if (!onbs?.length) return []
      const ids = onbs.map(o => o.id)
      const { data: fases } = await supabase
        .from('onboarding_fases')
        .select('*, onboarding_fase_types(*)')
        .in('onboarding_id', ids)
        .order('display_order')
      const fasesMap = {}
      for (const f of fases ?? []) {
        if (!fasesMap[f.onboarding_id]) fasesMap[f.onboarding_id] = []
        fasesMap[f.onboarding_id].push(f)
      }
      return onbs.map(o => ({ ...o, onboarding_fases: fasesMap[o.id] ?? [] }))
    },
    retry: 0,
  })
}

export function useAllOnboardings() {
  return useQuery({
    queryKey: ['onboardings_all'],
    queryFn: async () => {
      const { data: onbs, error } = await supabase
        .from('onboardings')
        .select('*, client:clients(id, name, fantasy_name), csm:profiles(id, name)')
        .order('created_at', { ascending: false })
      if (error) { console.error('[useAllOnboardings]', error); return [] }
      if (!onbs?.length) return []
      const ids = onbs.map(o => o.id)
      const { data: fases } = await supabase
        .from('onboarding_fases')
        .select('*, onboarding_fase_types(*)')
        .in('onboarding_id', ids)
        .order('display_order')
      const fasesMap = {}
      for (const f of fases ?? []) {
        if (!fasesMap[f.onboarding_id]) fasesMap[f.onboarding_id] = []
        fasesMap[f.onboarding_id].push(f)
      }
      return onbs.map(o => ({ ...o, onboarding_fases: fasesMap[o.id] ?? [] }))
    },
    retry: 0,
  })
}

export function useOnboarding(onboardingId) {
  return useQuery({
    queryKey: ['onboarding', onboardingId],
    enabled: !!onboardingId,
    queryFn: async () => {
      const { data: onb, error } = await supabase
        .from('onboardings')
        .select('*, csm:profiles(id, name), onboarding_capabilities(id, catalog_item_id, catalog_item:catalog_items(id, name, type))')
        .eq('id', onboardingId)
        .single()
      if (error) { console.error('[useOnboarding]', error); return null }
      const { data: fases, error: fasesError } = await supabase
        .from('onboarding_fases')
        .select('*, onboarding_fase_types(*)')
        .eq('onboarding_id', onboardingId)
        .order('display_order')
      
      if (fasesError) console.error('[useOnboarding] fases', fasesError)
      return { ...onb, onboarding_fases: fases ?? [] }
    },
    retry: 0,
  })
}

export function useOnboardingCapabilities(onboardingId) {
  return useQuery({
    queryKey: ['onboarding_caps', onboardingId],
    enabled: !!onboardingId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('onboarding_capabilities')
        .select('catalog_item_id')
        .eq('onboarding_id', onboardingId)
        .not('catalog_item_id', 'is', null)
      if (error) { console.error('[useOnboardingCapabilities]', error); return [] }
      return (data ?? []).map(r => r.catalog_item_id).filter(Boolean)
    },
    retry: 0,
  })
}

export function useOnboardingConfig() {
  return useQuery({
    queryKey: ['onboarding_config'],
    queryFn: async () => {
      const { data, error } = await supabase.from('onboarding_config').select('*')
      if (error) { console.error('[useOnboardingConfig]', error); return {} }
      const cfg = {}
      for (const row of data ?? []) cfg[row.key] = parseInt(row.value, 10)
      return cfg
    },
    staleTime: 5 * 60 * 1000,
    retry: 0,
  })
}

export function useCatalogItems() {
  return useQuery({
    queryKey: ['catalog'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('catalog_items')
        .select('*')
        .order('type')
        .order('name')
      if (error) { console.error('[useCatalogItems]', error); return [] }
      return data ?? []
    },
    staleTime: 10 * 60 * 1000,
    retry: 0,
  })
}

function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

async function createFasesFromTemplate(onboardingId, templateId) {
  const { data: templateFases } = await supabase
    .from('project_template_fases')
    .select('*, onboarding_fase_types(*)')
    .eq('template_id', templateId)
    .order('display_order')

  for (const tf of templateFases ?? []) {
    await supabase.from('onboarding_fases').insert({
      onboarding_id:     onboardingId,
      fase_type_id:      tf.fase_type_id,
      display_order:     tf.display_order,
      status:            tf.display_order === 1 ? 'ativa' : 'pendente',
      evidence_required: tf.requires_evidence ?? false,
    })
  }

  const { data: templateActivities } = await supabase
    .from('project_template_activities')
    .select('*, onboarding_activity_types(name)')
    .eq('template_id', templateId)
    .order('display_order')

  const { data: fasesCreated } = await supabase
    .from('onboarding_fases')
    .select('id, fase_type_id, display_order')
    .eq('onboarding_id', onboardingId)

  for (const ta of templateActivities ?? []) {
    const fase = (fasesCreated ?? []).find(f => f.fase_type_id === ta.fase_type_id)
    if (!fase) continue
    await supabase.from('onboarding_activities').insert({
      onboarding_id:    onboardingId,
      fase_id:          fase.id,
      activity_type_id: ta.activity_type_id,
      title:            ta.onboarding_activity_types?.name ?? '',
      status:           'pendente',
    })
  }

  const primeiraFase = (fasesCreated ?? []).slice().sort((a, b) => a.display_order - b.display_order)[0]
  if (primeiraFase) {
    await supabase.from('onboardings').update({ fase_atual_id: primeiraFase.id }).eq('id', onboardingId)
  }
}

export function useProjectTemplates(type) {
  return useQuery({
    queryKey: ['project_templates', type],
    enabled:  !!type && type !== 'interno',
    queryFn:  async () => {
      const { data } = await supabase
        .from('project_templates')
        .select('*')
        .eq('type', type)
        .eq('active', true)
        .order('display_order')
      return data || []
    },
    staleTime: 5 * 60 * 1000,
  })
}

export function useCreateOnboardingFlow() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ clientId, type, title, csm_id, start_date, end_date, notes, capabilities, kickoff_date, templateId, status }) => {
      // 1. Fetch SLA config
      const { data: cfgRows } = await supabase.from('onboarding_config').select('key, value')
      const cfg = {}
      for (const r of cfgRows ?? []) cfg[r.key] = parseInt(r.value, 10)
      const kickoffSla = cfg.kickoff_sla_days ?? 5
      const ptSla     = cfg.projeto_tecnico_sla_days ?? 15
      const goliveSla = cfg.go_live_sla_days ?? 60

      // 2. Insert onboarding
      const { data: onb, error: onbErr } = await supabase
        .from('onboardings')
        .insert({
          client_id: clientId,
          csm_id:    csm_id    || null,
          title,
          context:   type === 'expansao' ? 'expansao' : 'implantacao_inicial',
          start_date: start_date || null,
          notes:     notes      || null,
          status:    'ativo',
        })
        .select()
        .single()
      if (onbErr) throw onbErr

      // 3. Create phases from template only — no template = no phases
      if (templateId) {
        await createFasesFromTemplate(onb.id, templateId)
      }

      // 5. Insert capabilities (catalog_item_id)
      if (capabilities?.length > 0) {
        const capPayload = capabilities.map(itemId => ({ onboarding_id: onb.id, catalog_item_id: itemId }))
        const { error: capErr } = await supabase.from('onboarding_capabilities').insert(capPayload)
        if (capErr) throw capErr
      }

      // 6. Insert linked project
      const { data: proj, error: projErr } = await supabase
        .from('projects')
        .insert({ client_id: clientId, title, type, onboarding_id: onb.id, status: status || 'em_andamento', start_date: start_date || null, end_date: end_date || null })
        .select()
        .single()
      if (projErr) throw projErr

      return { onboarding: onb, project: proj }
    },

    onSuccess: (_, { clientId }) => {
      qc.invalidateQueries({ queryKey: ['onboardings', clientId] })
      qc.invalidateQueries({ queryKey: ['onboardings_all'] })
      qc.invalidateQueries({ queryKey: ['projects', clientId] })
      qc.invalidateQueries({ queryKey: ['projects_all'] })
      toast.success('Onboarding criado')
    },
    onError: (e) => toast.error(e.message),
  })
}

export function useUpdateOnboardingFlow() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ project, title, csm_id, notes, start_date, end_date, capabilities, kickoff_date }) => {
      // 1. Update project title + dates
      const { error: projErr } = await supabase
        .from('projects')
        .update({ title, start_date: start_date || null, end_date: end_date || null })
        .eq('id', project.id)
      if (projErr) throw projErr

      // 2. Update onboarding
      const { error: onbErr } = await supabase
        .from('onboardings')
        .update({ title, csm_id: csm_id || null, notes: notes || null })
        .eq('id', project.onboarding_id)
      if (onbErr) throw onbErr

      // 3. Update kickoff phase planned_start if provided
      if (kickoff_date) {
        const { data: kickoffFase, error: kickoffFaseErr } = await supabase
          .from('onboarding_fases')
          .select('id')
          .eq('onboarding_id', project.onboarding_id)
          .order('display_order', { ascending: true })
          .limit(1)
          .maybeSingle()
        if (kickoffFaseErr) throw kickoffFaseErr
        if (kickoffFase?.id) {
          const { error: faseErr } = await supabase
            .from('onboarding_fases')
            .update({ planned_start: kickoff_date })
            .eq('id', kickoffFase.id)
          if (faseErr) throw faseErr
        }
      }

      // 4. Replace capabilities
      const { error: delErr } = await supabase
        .from('onboarding_capabilities')
        .delete()
        .eq('onboarding_id', project.onboarding_id)
      if (delErr) throw delErr

      if (capabilities?.length > 0) {
        const capPayload = capabilities.map(itemId => ({ onboarding_id: project.onboarding_id, catalog_item_id: itemId }))
        const { error: capErr } = await supabase.from('onboarding_capabilities').insert(capPayload)
        if (capErr) throw capErr
      }
    },

    onSuccess: (_, { project }) => {
      qc.invalidateQueries({ queryKey: ['onboardings', project.client_id] })
      qc.invalidateQueries({ queryKey: ['onboarding', project.onboarding_id] })
      qc.invalidateQueries({ queryKey: ['onboarding_caps', project.onboarding_id] })
      qc.invalidateQueries({ queryKey: ['onboardings_all'] })
      qc.invalidateQueries({ queryKey: ['projects', project.client_id] })
      qc.invalidateQueries({ queryKey: ['projects_all'] })
      toast.success('Projeto atualizado')
    },
    onError: (e) => toast.error(e.message),
  })
}

export function useCreateInternalProject() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ clientId, title, description, responsible_id, start_date, end_date, status }) => {
      const payload = { client_id: clientId, title, type: 'interno', status: status || 'em_andamento' }
      if (description)    payload.description    = description
      if (responsible_id) payload.responsible_id = responsible_id
      if (start_date)     payload.start_date     = start_date
      if (end_date)       payload.end_date       = end_date

      const { data, error } = await supabase.from('projects').insert(payload).select().single()
      if (error) throw error
      return data
    },

    onSuccess: (_, { clientId }) => {
      qc.invalidateQueries({ queryKey: ['projects', clientId] })
      qc.invalidateQueries({ queryKey: ['projects_all'] })
      toast.success('Projeto criado')
    },
    onError: (e) => toast.error(e.message),
  })
}
