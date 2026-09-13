import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '@/contexts/AuthContext'
import { useFeatureFlags } from '@/hooks/useFeatureFlags'
import { useHealthConfig } from '@/hooks/useHealthConfig'
import { useActivities } from '@/hooks/useActivities'
import { useSyncStatus } from '@/hooks/useSyncStatus'
import { useDashboardClients } from '@/hooks/useDashboardClients'
import { useDashboardClientsOverview, useOpenProjectsOverview } from '@/hooks/useDashboardOverview'
import { useDashboardYtd } from '@/hooks/useDashboardYtd'
import { useOperationalDeltas } from '@/hooks/useOperationalDeltas'
import { useActiveProfissionais } from '@/hooks/useActiveProfissionais'
import { useGreeting } from '@/lib/greeting-engine/hooks/useGreeting'

import { BlockBoundary } from '@/components/dashboard/v3/primitives'
import { DashboardHeader } from '@/components/dashboard/v3/DashboardHeader'
import { HeroBlock } from '@/components/dashboard/v3/HeroBlock'
import { MinhaAgendaBlock } from '@/components/dashboard/v3/MinhaAgendaBlock'
import { SaudeDimensaoBlock } from '@/components/dashboard/v3/SaudeDimensaoBlock'
import { ProjetosAbertosBlock } from '@/components/dashboard/v3/ProjetosAbertosBlock'
import { ForcaNumerosBlock } from '@/components/dashboard/v3/ForcaNumerosBlock'
import { EcossistemaMapBlock } from '@/components/dashboard/v3/EcossistemaMapBlock'
import { OperacionalVariacaoBlock } from '@/components/dashboard/v3/OperacionalVariacaoBlock'

// get_finance_summary() is SECURITY DEFINER with its own hardcoded guard
// (admin/manager/finance only) — NOT the financial_data flag, which now also
// includes sales for a different purpose (per-client MRR). Gating this query by
// financial_data caused a 403 for sales (flag said yes, the RPC's own check said
// no). Keep this check in sync with the RPC's guard, not with financial_data.
const FINANCE_SUMMARY_ROLES = ['admin', 'manager', 'finance']

function useFinanceSummary(effectiveRole) {
  return useQuery({
    queryKey: ['finance_summary'],
    enabled: FINANCE_SUMMARY_ROLES.includes(effectiveRole),
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
  const { flags, isEnabled } = useFeatureFlags()
  const profileId = profile?.id

  const isAdminManager = effectiveRole === 'admin' || effectiveRole === 'manager'

  // RLS-scoped: carteira for csm/sales, whole base for admin/manager. Feeds the HERO.
  const clientsQ = useDashboardClients(profile)
  const heroClients = clientsQ.data || []

  const { data: healthConfig } = useHealthConfig()
  const thresholds = healthConfig?.config ?? { threshold_healthy: 75, threshold_attention: 50 }

  const activityFilter = isAdminManager
    ? { excludeStatuses: ['concluida', 'cancelada'] }
    : { responsible_id: profileId, excludeStatuses: ['concluida', 'cancelada'] }
  const activitiesQ = useActivities(activityFilter, { enabled: !!profile })

  // Company-wide ("geral") sources — same numbers for every role (RPCs).
  const overviewQ = useDashboardClientsOverview()
  const projectsQ = useOpenProjectsOverview()
  const deltas = useOperationalDeltas()
  const ytdQ = useDashboardYtd()

  const syncQ = useSyncStatus({ enabled: !!profile })
  const financeQ = useFinanceSummary(effectiveRole)
  const ticketsQ = useAnalystTickets(effectiveRole)
  // client_usage got a global SELECT policy 2026-09-13 — filter explicitly by the
  // already carteira-scoped heroClients instead of relying on RLS to narrow rows.
  const profQ = useActiveProfissionais(
    isAdminManager ? null : heroClients.map(c => c.id),
    { enabled: !!profile && (isAdminManager || clientsQ.isSuccess) }
  )

  const healthMedia = useMemo(() => {
    const scored = heroClients.filter(c => c.health_total != null)
    if (!scored.length) return null
    return scored.reduce((s, c) => s + c.health_total, 0) / scored.length
  }, [heroClients])

  const criticalCount = useMemo(
    () => heroClients.filter(c => (c.health_total ?? 100) < thresholds.threshold_attention).length,
    [heroClients, thresholds],
  )
  const greeting = useGreeting({ profile, operational: { criticalClients: criticalCount } })

  const dateStr = useMemo(() => {
    const s = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
    return s.charAt(0).toUpperCase() + s.slice(1)
  }, [])

  const overviewClients = overviewQ.data || []

  return (
    <main className="p-6 max-w-[1120px] mx-auto flex flex-col gap-4">
      <h1 className="sr-only">Meu Dia — painel do dia a dia</h1>

      <DashboardHeader updatedAt={syncQ.data?.finished_at || syncQ.data?.started_at} />

      <BlockBoundary>
        <HeroBlock
          effectiveRole={effectiveRole}
          profile={profile}
          greeting={greeting}
          dateStr={dateStr}
          clientCount={heroClients.length}
          profissionaisAtivos={profQ.data}
          healthMedia={healthMedia}
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
              clients={overviewClients}
              effectiveRole={effectiveRole}
              profileId={profileId}
              loading={overviewQ.isLoading}
              error={overviewQ.error}
              onRetry={overviewQ.refetch}
              canSeeHealth={(() => {
                const hasFlag = flags.some(f => f.key === 'health_cockpit')
                return hasFlag ? isEnabled('health_cockpit', effectiveRole) : isEnabled('health', effectiveRole)
              })()}
            />
          </BlockBoundary>
        </div>

        <div className="lg:col-span-5">
          <BlockBoundary>
            <ProjetosAbertosBlock
              rows={projectsQ.data || []}
              effectiveRole={effectiveRole}
              profileId={profileId}
              loading={projectsQ.isLoading}
              error={projectsQ.error}
              onRetry={projectsQ.refetch}
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
              clients={overviewClients}
              loading={overviewQ.isLoading}
              error={overviewQ.error}
              onRetry={overviewQ.refetch}
              effectiveRole={effectiveRole}
              profileId={profileId}
            />
          </BlockBoundary>
        </div>

        <div className="lg:col-span-12">
          <BlockBoundary>
            <OperacionalVariacaoBlock
              deltas={deltas}
              effectiveRole={effectiveRole}
              profileId={profileId}
              syncStatus={syncQ.data}
            />
          </BlockBoundary>
        </div>
      </div>
    </main>
  )
}
