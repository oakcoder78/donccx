import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabaseClient'
import toast from 'react-hot-toast'

export function useOnboardings(clientId) {
  return useQuery({
    queryKey: ['onboardings', clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('onboardings')
        .select(`
          *,
          csm:profiles(id, name),
          onboarding_fases(*),
          onboarding_milestones(*),
          onboarding_capabilities(*, capability_type:onboarding_capability_types(*))
        `)
        .eq('client_id', clientId)
        .order('created_at', { ascending: false })
      if (error) { console.error('[useOnboardings]', error); return [] }
      return data ?? []
    },
    retry: 0,
  })
}

export function useAllOnboardings() {
  return useQuery({
    queryKey: ['onboardings_all'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('onboardings')
        .select(`
          *,
          client:clients(id, name, fantasy_name),
          csm:profiles(id, name),
          onboarding_fases(*),
          onboarding_milestones(*)
        `)
        .order('created_at', { ascending: false })
      if (error) { console.error('[useAllOnboardings]', error); return [] }
      return data ?? []
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

export function useCapabilityTypes() {
  return useQuery({
    queryKey: ['onboarding_capability_types'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('onboarding_capability_types')
        .select('*')
        .eq('active', true)
        .order('display_order')
      if (error) { console.error('[useCapabilityTypes]', error); return [] }
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

// Full onboarding flow: onboarding + 3 fases + 3 milestones (with SLA) + project
export function useCreateOnboardingFlow() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ clientId, type, title, csm_id, start_date, notes, capabilities }) => {
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

      // 3. Insert 3 fases
      const { error: fasesErr } = await supabase.from('onboarding_fases').insert([
        { onboarding_id: onb.id, fase: 'definicao_escopo',     actual_start: start_date || null },
        { onboarding_id: onb.id, fase: 'preparacao_plataforma' },
        { onboarding_id: onb.id, fase: 'treinamento' },
      ])
      if (fasesErr) throw fasesErr

      // 4. Planned dates from SLA
      const base           = start_date || new Date().toISOString().slice(0, 10)
      const kickoffPlanned = addDays(base, kickoffSla)
      const ptPlanned      = addDays(kickoffPlanned, ptSla)
      const golivePlanned  = addDays(base, goliveSla)

      // 5. Insert 3 milestones
      const { error: msErr } = await supabase.from('onboarding_milestones').insert([
        { onboarding_id: onb.id, type: 'kickoff',                 planned_date: kickoffPlanned },
        { onboarding_id: onb.id, type: 'projeto_tecnico_aprovado', planned_date: ptPlanned     },
        { onboarding_id: onb.id, type: 'go_live',                 planned_date: golivePlanned  },
      ])
      if (msErr) throw msErr

      // 6. Insert capabilities
      if (capabilities?.length > 0) {
        const { error: capErr } = await supabase.from('onboarding_capabilities').insert(
          capabilities.map(ctId => ({ onboarding_id: onb.id, capability_type_id: ctId }))
        )
        if (capErr) throw capErr
      }

      // 7. Insert linked project
      const { data: proj, error: projErr } = await supabase
        .from('projects')
        .insert({ client_id: clientId, title, type, onboarding_id: onb.id, status: 'em_andamento' })
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

// Internal project — no onboarding flow
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
