import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '@/contexts/AuthContext'
import { useFeatureFlags } from '@/hooks/useFeatureFlags'
import { useProfiles } from '@/hooks/useProfiles'
import { useHealthConfig } from '@/hooks/useHealthConfig'
import { useActivities } from '@/hooks/useActivities'
import { useSyncStatus } from '@/hooks/useSyncStatus'
import { useProjectCockpit } from '@/hooks/useProjectCockpit'
import { useDashboardClients } from '@/hooks/useDashboardClients'
import { useDashboardYtd, useOperational90dAvg } from '@/hooks/useDashboardYtd'
import { useOperationalDeltas } from '@/hooks/useOperationalDeltas'
import { useGreeting } from '@/lib/greeting-engine/hooks/useGreeting'
import { dataRefMonth as deriveRefMonth, ymOffset } from '@/lib/scoring'

import { BlockBoundary } from '@/components/dashboard/v3/primitives'
import { DashboardHeader } from '@/components/dashboard/v3/DashboardHeader'
import { HeroBlock } from '@/components/dashboard/v3/HeroBlock'
import { MinhaAgendaBlock } from '@/components/dashboard/v3/MinhaAgendaBlock'
import { SaudeDimensaoBlock } from '@/components/dashboard/v3/SaudeDimensaoBlock'
import { ProjetosAbertosBlock } from '@/components/dashboard/v3/ProjetosAbertosBlock'
import { ForcaNumerosBlock } from '@/components/dashboard/v3/ForcaNumerosBlock'
import { EcossistemaMapBlock } from '@/components/dashboard/v3/EcossistemaMapBlock'
import { OperacionalVariacaoBlock } from '@/components/dashboard/v3/OperacionalVariacaoBlock'

const MRR_ROLES = ['admin', 'manager', 'finance']

function useFinanceSummary(effectiveRole) {
  return useQuery({
    queryKey: ['finance_summary'],
    enabled: MRR_ROLES.includes(effectiveRole),
    staleTime: 5 * 60 * 1000,
    retry: 0,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_finance_summary')
      if (error) throw error
      return data?.[0] ?? null
    },
  })
}

// Analyst HERO tickets — latest ref_month aggregate from client_support.
// SDD §4.8: if a clean aggregate isn't reachable, render "—" (no block).
function useAnalystTickets(effectiveRole) {
  return useQuery({
    queryKey: ['analyst_tickets_summary'],
    enabled: effectiveRole === 'analyst',
    staleTime: 5 * 60 * 1000,
    retry: 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_support')
        .select('ref_month, tickets_opened, tickets_resolved')
        .eq('pending', false)
        .order('ref_month', { ascending: false })
      if (error) throw error
      if (!data?.length) return null
      const latest = data[0].ref_month
      const rows = data.filter(r => r.ref_month === latest)
      const opened = rows.reduce((s, r) => s + (r.tickets_opened || 0), 0)
      const resolved = rows.reduce((s, r) => s + (r.tickets_resolved || 0), 0)
      return {
        opened,
        open: Math.max(0, opened - resolved),
        rate: opened > 0 ? Math.round((resolved / opened) * 100) : null,
      }
    },
  })
}

export default function MeuDiaV3Page() {
  const { profile, effectiveRole } = useAuth()
  const { isEnabled } = useFeatureFlags()
  const [selectedCsm, setSelectedCsm] = useState(null)

  const isAdminManager = effectiveRole === 'admin' || effectiveRole === 'manager'

  const clientsQ = useDashboardClients(profile)
  const allClients = clientsQ.data || []

  // admin/manager see the whole base — the carteira dropdown filters client-side.
  const scopedClients = useMemo(() => {
    if (!selectedCsm) return allClients
    return allClients.filter(c => c.csm_id === selectedCsm || c.comercial_id === selectedCsm)
  }, [allClients, selectedCsm])

  const { data: healthConfig } = useHealthConfig()
  const thresholds = healthConfig?.config ?? { threshold_healthy: 75, threshold_attention: 50 }

  const activityFilter = isAdminManager
    ? { excludeStatuses: ['concluida', 'cancelada'] }
    : { responsible_id: profile?.id, excludeStatuses: ['concluida', 'cancelada'] }
  const activitiesQ = useActivities(activityFilter, { enabled: !!profile })

  const projectsQ = useProjectCockpit()
  const ytdQ = useDashboardYtd()
  const op90dQ = useOperational90dAvg()
  const syncQ = useSyncStatus({ enabled: !!profile })
  const financeQ = useFinanceSummary(effectiveRole)
  const ticketsQ = useAnalystTickets(effectiveRole)
  const deltas = useOperationalDeltas(scopedClients, { enabled: !!profile })

  const criticalCount = useMemo(
    () => scopedClients.filter(c => (c.health_total ?? 100) < thresholds.threshold_attention).length,
    [scopedClients, thresholds],
  )
  const greeting = useGreeting({ profile, operational: { criticalClients: criticalCount } })

  const dateStr = useMemo(() => {
    const s = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
    return s.charAt(0).toUpperCase() + s.slice(1)
  }, [])

  const refMonth = deriveRefMonth(syncQ.data, ymOffset(1))

  const { data: profiles = [] } = useProfiles()
  const csmList = useMemo(
    () => profiles
      .filter(p => (p.role === 'csm' || p.role === 'manager') && p.status === 'active')
      .sort((a, b) => (a.name || '').localeCompare(b.name || '')),
    [profiles],
  )

  return (
    <main className="p-6 max-w-[1120px] mx-auto flex flex-col gap-4">
      <h1 className="sr-only">Meu Dia — painel do dia a dia</h1>

      <DashboardHeader
        updatedAt={syncQ.data?.finished_at || syncQ.data?.started_at}
        showCsmFilter={isAdminManager}
        csmList={csmList}
        selectedCsm={selectedCsm}
        onSelectCsm={setSelectedCsm}
      />

      <BlockBoundary>
        <HeroBlock
          effectiveRole={effectiveRole}
          profile={profile}
          greeting={greeting}
          dateStr={dateStr}
          dataRefMonth={refMonth}
          scopedClientCount={scopedClients.length}
          op90d={op90dQ.data}
          financeSummary={financeQ.data}
          tickets={ticketsQ.data}
        />
      </BlockBoundary>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-5">
          <BlockBoundary>
            <MinhaAgendaBlock
              activities={activitiesQ.data || []}
              effectiveRole={effectiveRole}
              loading={activitiesQ.isLoading}
              error={activitiesQ.error}
              onRetry={activitiesQ.refetch}
            />
          </BlockBoundary>
        </div>
        <div className="lg:col-span-7">
          <BlockBoundary>
            <SaudeDimensaoBlock
              clients={scopedClients}
              loading={clientsQ.isLoading}
              error={clientsQ.error}
              onRetry={clientsQ.refetch}
            />
          </BlockBoundary>
        </div>

        <div className="lg:col-span-5">
          <BlockBoundary>
            <ProjetosAbertosBlock
              rows={projectsQ.data || []}
              loading={projectsQ.isLoading}
              error={projectsQ.error}
              onRetry={projectsQ.refetch}
              canSeeCockpit={isEnabled('projects_cockpit', effectiveRole)}
            />
          </BlockBoundary>
        </div>
        <div className="lg:col-span-7">
          <BlockBoundary>
            <ForcaNumerosBlock
              ytd={ytdQ.data}
              loading={ytdQ.isLoading}
              error={ytdQ.error}
              onRetry={ytdQ.refetch}
            />
          </BlockBoundary>
        </div>

        <div className="lg:col-span-12">
          <BlockBoundary>
            <EcossistemaMapBlock
              clients={allClients}
              loading={clientsQ.isLoading}
              error={clientsQ.error}
              onRetry={clientsQ.refetch}
            />
          </BlockBoundary>
        </div>

        <div className="lg:col-span-12">
          <BlockBoundary>
            <OperacionalVariacaoBlock
              deltas={deltas}
              effectiveRole={effectiveRole}
              syncStatus={syncQ.data}
            />
          </BlockBoundary>
        </div>
      </div>
    </main>
  )
}
