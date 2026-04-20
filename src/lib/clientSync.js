import { supabase } from './supabaseClient'
import { syncCompanySupport } from './freshdeskSync'
import { recalculateAndSave } from '../hooks/useHealthScore'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

export async function syncClient(client) {
  const results = { donc: null, freshdesk: null, healthScore: null, errors: [] }
  const refMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`

  // 1. Sync DONC — apenas se tiver instâncias
  const { data: instances } = await supabase
    .from('client_donc_instances')
    .select('id')
    .eq('client_id', client.id)
    .eq('active', true)

  if (instances?.length > 0) {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`${SUPABASE_URL}/functions/v1/donc-api-sync`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'apikey': SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ trigger: 'manual', month: refMonth, client_id: client.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)

      // auto-aprovar via merge todos os pendentes deste cliente
      const { data: pending } = await supabase
        .from('client_usage')
        .select('id, donc_snapshot, os_created, active_users, profissionais_inativos, os_finalizadas, os_abertas, os_canceladas, unidades, os_por_tipo, partial_day')
        .eq('client_id', client.id)
        .eq('pending', true)

      for (const row of pending ?? []) {
        const snap = row.donc_snapshot
        if (!snap) continue
        const apiVals = {
          os_created:             snap.totalOs                  ?? null,
          active_users:           snap.profissionais?.ativos    ?? null,
          profissionais_inativos: snap.profissionais?.inativos  ?? null,
          os_finalizadas:         snap.osPorStatus?.finalizadas ?? null,
          os_abertas:             snap.osPorStatus?.abertas     ?? null,
          os_canceladas:          snap.osPorStatus?.canceladas  ?? null,
          unidades:               snap.unidades                 ?? null,
        }
        const patch = { pending: false, partial_day: row.partial_day ?? null }
        for (const [k, v] of Object.entries(apiVals)) {
          const cur = row[k]
          if (cur === null || cur === undefined || cur === 0) patch[k] = v
        }
        if (!row.os_por_tipo && snap?.osPorTipo) patch.os_por_tipo = snap.osPorTipo
        await supabase.from('client_usage').update(patch).eq('id', row.id)
      }

      results.donc = data.synced ?? 0
    } catch (e) {
      results.errors.push(`DONC: ${e.message}`)
    }
  }

  // 2. Sync Freshdesk — apenas se tiver freshdesk_company_id
  if (client.freshdesk_company_id) {
    try {
      await syncCompanySupport(client.id, refMonth)
      results.freshdesk = true
    } catch (e) {
      results.errors.push(`Freshdesk: ${e.message}`)
    }
  }

  // 3. Recalcular health score
  try {
    const scores = await recalculateAndSave(client)
    results.healthScore = scores.total
  } catch (e) {
    results.errors.push(`Health Score: ${e.message}`)
  }

  return results
}
