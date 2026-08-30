import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabaseClient'
import { ymOffset, fmtMonthShort, fmtMonthLong } from '@/lib/scoring'

// Month-over-month operational variation — company-wide for EVERY role, via the
// get_operational_deltas() SECURITY DEFINER RPC (migration 20260830000004).
// Previously a direct client_usage query that RLS scoped to the carteira for
// csm/sales; now uniform. Builds the 3 top-mover lists client-side.

const prevMonth = ymOffset(1)
const prevMonth2 = ymOffset(2)

// row: { clientId, name, csm_id, comercial_id, curVal, prevVal }
function buildCountRows(rows, curKey, prevKey, unit) {
  return rows
    .map(r => {
      const curVal = Number(r[curKey]) || 0
      const prevVal = Number(r[prevKey]) || 0
      if (curVal === 0 && prevVal === 0) return null
      const delta = prevVal > 0 ? Math.round(((curVal - prevVal) / prevVal) * 100) : null
      return {
        clientId: r.client_id,
        name: r.client_name || r.client_id,
        csm_id: r.csm_id,
        comercial_id: r.comercial_id,
        curVal,
        prevVal,
        absDelta: Math.abs(curVal - prevVal),
        delta,
        state: prevVal < 10 ? 'new' : (curVal - prevVal >= 0 ? 'up' : 'down'),
        unit,
      }
    })
    .filter(Boolean)
    .sort((a, b) => b.absDelta - a.absDelta)
}

export function useOperationalDeltas(options = {}) {
  const query = useQuery({
    queryKey: ['operational_deltas', prevMonth, prevMonth2],
    enabled: options.enabled ?? true,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_operational_deltas')
      if (error) throw error
      return data ?? []
    },
  })

  const rows = query.data || []

  const osRows = useMemo(() => buildCountRows(rows, 'os_cur', 'os_prev', 'OS'), [rows])
  const usersRows = useMemo(() => buildCountRows(rows, 'users_cur', 'users_prev', 'profissionais'), [rows])

  const healthRows = useMemo(() => (
    rows
      .filter(r => r.health_cur != null)
      .map(r => ({
        clientId: r.client_id,
        name: r.client_name || r.client_id,
        csm_id: r.csm_id,
        comercial_id: r.comercial_id,
        cur: r.health_cur,
        prev: r.health_prev ?? null,
        delta: r.health_prev != null ? r.health_cur - r.health_prev : 0,
      }))
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
  ), [rows])

  const hasData = rows.some(r => Number(r.os_cur) > 0 || Number(r.users_cur) > 0 || r.health_cur != null)

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

// 3-month per-client history for the op-* drawer. Stays RLS-scoped — only the
// clients a csm/sales owns are drill-in-able, so this is only ever called for
// clients the user can read.
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
