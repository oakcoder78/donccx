/**
 * contract-series-sync — Supabase Edge Function
 *
 * Repõe o horizonte de recorrência das séries contratuais ativas.
 *
 * Existe separado do `monthly-sync` porque `ensure_series_horizon` é idempotente
 * por design — é exatamente o perfil de algo que deve poder rodar quantas vezes
 * quiser. Preso ao orquestrador, ele só rodava uma vez por mês, herdava a falha
 * de qualquer serviço de rede externo e não podia ser disparado isolado para
 * recuperação.
 *
 * Um job do pg_cron chama esta função no dia 1, poucos minutos fora do
 * orquestrador. O botão "Repor horizonte" em Configurações também chama, para
 * quando um lançamento em lote acaba de ser feito e não se quer esperar o dia 1.
 *
 * Não escreve billing_payments de meses futuros: a folga é inerte e pré-marcar
 * um pagamento que não venceu seria errado.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2"
import { authorizeRequest, getServiceKey } from "../_shared/auth.ts"

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

/**
 * Returns how far each series reached, so the caller can tell "nothing to do"
 * from "extended by N months" — the log alone cannot distinguish them.
 */
export async function syncSeriesHorizon(admin: SupabaseClient): Promise<{
  series: number; launched: number; por_serie: Record<string, number>; erros: string[]
}> {
  const { data, error } = await admin
    .from('contract_series')
    .select('id')
    .eq('status', 'ativa')

  if (error) throw new Error(error.message)

  const launched: Record<string, number> = {}
  const erros: string[] = []
  let total = 0
  const rows = data ?? []

  for (const s of rows) {
    const { data: inserted, error: rpcErr } = await admin.rpc('ensure_series_horizon', {
      p_series_id: s.id,
    })
    if (rpcErr) {
      // Uma série ruim não pode derrubar as outras.
      erros.push(`${s.id}: ${rpcErr.message}`)
      console.error('contract-series-sync: falhou série', s.id, rpcErr.message)
      continue
    }
    const n = Number(inserted) || 0
    if (n > 0) {
      launched[s.id] = n
      total += n
      console.log(`contract-series-sync: série ${s.id} estendida +${n} meses`)
    }
  }

  return { series: rows.length, launched: total, por_serie: launched, erros }
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const admin = createClient(supabaseUrl, getServiceKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const auth = await authorizeRequest(req, admin, ['admin', 'manager'])
  if (!auth.authorized) return json({ error: 'Forbidden' }, 403)

  try {
    const result = await syncSeriesHorizon(admin)
    console.log('contract-series-sync: concluído', {
      series: result.series,
      launched: result.launched,
      erros: result.erros.length,
    })
    return json(result)
  } catch (err) {
    console.error('contract-series-sync:', err)
    return json({ error: 'Internal server error' }, 500)
  }
})