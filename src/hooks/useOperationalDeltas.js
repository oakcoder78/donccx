import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabaseClient'
import { ymOffset, fmtMonthShort, fmtMonthLong } from '@/lib/scoring'

// Month-over-month operational variation, extracted from DashboardPage.jsx FAIXA 4
// (SDD §4.3). Aggregates client_usage for the two most recent closed months and
// builds top-movers rows for OS / profissionais / health.
//
// SCOPE: this reads client_usage directly, so RLS applies —
//   admin / manager / finance / analyst → whole ecosystem
//   csm / sales                          → own carteira only
// The consuming block (OperacionalVariacaoBlock, Phase 3) must set its ScopeLabel
// from effectiveRole accordingly. The HERO "vs média 90d" uses the company-wide
// get_operational_90d_avg() RPC instead (useOperational90dAvg).

const prevMonth = ymOffset(1)
const prevMonth2 = ymOffset(2)

function buildCountRows(opsByClient, clients, valOf, unit) {
  const rows = []
  Object.entries(opsByClient).forEach(([clientId, months]) => {
    const cur = months[prevMonth]
    const prev = months[prevMonth2]
    if (!cur) return
    const curVal = valOf(cur)
    const prevVal = valOf(prev)
    if (curVal == null || prevVal == null) return
    if (curVal === 0 && prevVal === 0) return
    const delta = prevVal > 0 ? Math.round(((curVal - prevVal) / prevVal) * 100) : null
    const cl = clients.find(c => c.id === Number(clientId))
    rows.push({
      clientId,
      name: cl?.fantasy_name || cl?.name || clientId,
      curVal,
      prevVal,
      absDelta: Math.abs(curVal - prevVal),
      delta,
      state: prevVal < 10 ? 'new' : (curVal - prevVal >= 0 ? 'up' : 'down'),
      unit,
    })
  })
  return rows.sort((a, b) => b.absDelta - a.absDelta)
}

export function useOperationalDeltas(clients = [], options = {}) {
  const enabled = (options.enabled ?? true) && clients.length > 0

  const query = useQuery({
    queryKey: ['operational_deltas', prevMonth, prevMonth2],
    enabled,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_usage')
        .select('client_id, ref_month, instance_id, os_abertas, os_created, active_users, health_snapshot, donc_snapshot')
        .in('ref_month', [prevMonth, prevMonth2])
        .eq('pending', false)
      if (error) throw error
      return (data || []).filter(r => r.instance_id != null)
    },
  })

  const rows = query.data || []

  const opsByClient = useMemo(() => {
    const map = {}
    rows.forEach(r => {
      map[r.client_id] ??= {}
      const key = r.ref_month
      map[r.client_id][key] ??= { os: 0, active_users: 0, health_snapshot: null, donc_snapshot: null }
      const bucket = map[r.client_id][key]
      bucket.os += r.donc_snapshot?.totalOs ?? r.os_created ?? 0
      bucket.active_users += r.active_users ?? 0
      if (bucket.health_snapshot == null && r.health_snapshot != null) bucket.health_snapshot = r.health_snapshot
      if ((r.donc_snapshot?.totalOs ?? 0) > (bucket.donc_snapshot?.totalOs ?? 0)) bucket.donc_snapshot = r.donc_snapshot
    })
    return map
  }, [rows])

  const osRows = useMemo(() => buildCountRows(opsByClient, clients, m => m.os ?? null, 'OS'), [opsByClient, clients])
  const usersRows = useMemo(() => buildCountRows(opsByClient, clients, m => m.active_users ?? null, 'profissionais'), [opsByClient, clients])

  const healthRows = useMemo(() => {
    const out = []
    Object.entries(opsByClient).forEach(([clientId, months]) => {
      const cur = months[prevMonth]
      const prev = months[prevMonth2]
      if (!cur || cur.health_snapshot == null) return
      const prevScore = prev?.health_snapshot
      const cl = clients.find(c => c.id === Number(clientId))
      out.push({
        clientId,
        name: cl?.fantasy_name || cl?.name || clientId,
        cur: cur.health_snapshot,
        prev: prevScore ?? null,
        delta: prevScore != null ? cur.health_snapshot - prevScore : 0,
      })
    })
    return out.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
  }, [opsByClient, clients])

  const hasData = useMemo(() => rows.some(r => r.ref_month === prevMonth && r.instance_id != null), [rows])

  return {
    osRows,
    usersRows,
    healthRows,
    prevMonth,
    prevMonth2,
    prevMonthLabel: fmtMonthLong(prevMonth),
    prevMonth2Label: fmtMonthLong(prevMonth2),
    prevMonthShort: fmtMonthShort(prevMonth),
    prevMonth2Short: fmtMonthShort(prevMonth2),
    hasData,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  }
}

// 3-month per-client history for the op-* drawer (SDD §5.2 / DashboardPage.jsx op_histo).
export function useOpClientHistory(clientId, options = {}) {
  return useQuery({
    queryKey: ['op_client_history', clientId],
    enabled: (options.enabled ?? true) && !!clientId,
    staleTime: 2 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_usage')
        .select('client_id, ref_month, instance_id, donc_snapshot, health_snapshot, active_users, os_created')
        .eq('client_id', clientId)
        .order('ref_month', { ascending: false })
        .limit(3)
      if (error) throw error
      return (data || []).reverse()
    },
  })
}
