/**
 * donc-api-sync — Supabase Edge Function
 *
 * Sincroniza dados de uso mensal da API DONC para client_usage.
 *
 * Body: { trigger: string, month: 'previous' | 'YYYY-MM', client_id?: number, instance_id?: number }
 *
 * Exemplos:
 *   { trigger: 'cron',   month: 'previous' }          — todos os clientes, mês anterior
 *   { trigger: 'manual', month: '2025-03', client_id: 16 } — cliente específico
 *   { trigger: 'manual', month: '2025-03', instance_id: 2 } — instância específica
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const DONC_API_BASE = 'https://webhub.donc.com.br/api/DoncCx'

// ── Helpers de data ──────────────────────────────────────────────────────────

/** Retorna 'YYYY-MM' do mês anterior ao atual (UTC). */
function previousMonthKey(): string {
  const now = new Date()
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

/**
 * Dado 'YYYY-MM', retorna dataInicio e dataFim no formato esperado pela API DONC.
 * dataInicio = primeiro dia do mês às 00:01
 * dataFim    = último dia do mês às 23:59:59
 */
function monthBounds(refMonth: string): { dataInicio: string; dataFim: string } {
  const [year, month] = refMonth.split('-').map(Number)
  const firstDay = new Date(Date.UTC(year, month - 1, 1))
  const lastDay  = new Date(Date.UTC(year, month, 0))   // dia 0 do mês seguinte = último do atual

  const pad = (n: number) => String(n).padStart(2, '0')

  const dataInicio = `${firstDay.getUTCFullYear()}-${pad(firstDay.getUTCMonth() + 1)}-${pad(firstDay.getUTCDate())} 00:01`
  const dataFim    = `${lastDay.getUTCFullYear()}-${pad(lastDay.getUTCMonth() + 1)}-${pad(lastDay.getUTCDate())} 23:59:59`

  return { dataInicio, dataFim }
}

// ── Handler ───────────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

  try {
    // ── Auth ─────────────────────────────────────────────────────────────────
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
    if (!token) return json({ error: 'Unauthorized' }, 401)

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    )

    // Aceitar service role key direto (chamada cron) ou user token (chamada manual)
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    let authorized = false

    if (token === serviceKey) {
      authorized = true
    } else {
      const { data: { user }, error: authErr } = await admin.auth.getUser(token)
      if (!authErr && user) {
        const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).maybeSingle()
        authorized = ['admin', 'manager'].includes(profile?.role ?? '')
      }
    }

    if (!authorized) return json({ error: 'Forbidden' }, 403)

    // ── Parse body ───────────────────────────────────────────────────────────
    const body = await req.json() as {
      trigger: string
      month: string
      client_id?: number
      instance_id?: number
    }

    const { trigger, month, client_id, instance_id } = body

    // Resolver ref_month
    const refMonth = (month === 'previous') ? previousMonthKey() : month
    if (!/^\d{4}-\d{2}$/.test(refMonth)) {
      return json({ error: `Formato de month inválido: "${month}". Use 'previous' ou 'YYYY-MM'.` }, 400)
    }

    const { dataInicio, dataFim } = monthBounds(refMonth)
    console.log(`donc-api-sync: trigger=${trigger} refMonth=${refMonth} dataInicio=${dataInicio} dataFim=${dataFim}`)

    // ── Buscar instâncias ─────────────────────────────────────────────────────
    let query = admin
      .from('client_donc_instances')
      .select('id, client_id, contrato_saas_id, label')

    if (instance_id !== undefined) {
      query = query.eq('id', instance_id)
    } else if (client_id !== undefined) {
      query = query.eq('client_id', client_id).eq('active', true)
    } else {
      query = query.eq('active', true)
    }

    const { data: instances, error: instErr } = await query
    if (instErr) throw new Error(`Erro ao buscar instâncias: ${instErr.message}`)
    if (!instances || instances.length === 0) {
      return json({ synced: 0, failed: 0, errors: [], message: 'Nenhuma instância encontrada.' })
    }

    // ── Sincronizar cada instância ────────────────────────────────────────────
    const errors: Array<{ instance_id: number; contrato_saas_id: number; label: string; error: string }> = []
    let synced = 0

    for (const inst of instances) {
      console.log(`donc-api-sync: sincronizando instância ${inst.contrato_saas_id} — ${inst.label} (client_id=${inst.client_id})`)

      try {
        const params = new URLSearchParams({ dataInicio, dataFim })
        const url = `${DONC_API_BASE}/${inst.contrato_saas_id}?${params}`

        const apiRes = await fetch(url, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        })

        if (!apiRes.ok) {
          const errText = await apiRes.text().catch(() => '')
          throw new Error(`HTTP ${apiRes.status}: ${errText.slice(0, 200)}`)
        }

        const apiData = await apiRes.json()

        // ── Mapear resposta ───────────────────────────────────────────────────
        const usageRow = {
          client_id:               inst.client_id,
          ref_month:               refMonth,
          instance_id:             inst.id,
          os_created:              apiData?.totalOs           ?? null,
          active_users:            apiData?.profissionais?.ativos    ?? null,
          profissionais_inativos:  apiData?.profissionais?.inativos  ?? null,
          os_finalizadas:          apiData?.osPorStatus?.finalizadas ?? null,
          os_abertas:              apiData?.osPorStatus?.abertas     ?? null,
          os_canceladas:           apiData?.osPorStatus?.canceladas  ?? null,
          unidades:                apiData?.unidades          ?? null,
          os_por_tipo:             apiData?.osPorTipo         ?? null,
          donc_snapshot:           apiData,
          pending:                 true,
        }

        // Upsert com constraint composta client_id + ref_month + instance_id
        const { error: upsertErr } = await admin
          .from('client_usage')
          .upsert(usageRow, { onConflict: 'client_id,ref_month,instance_id' })

        if (upsertErr) throw new Error(`Upsert falhou: ${upsertErr.message}`)

        synced++
        console.log(`donc-api-sync: OK instância ${inst.contrato_saas_id} — os_created=${usageRow.os_created} active_users=${usageRow.active_users}`)

      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e)
        console.error(`donc-api-sync: ERRO instância ${inst.contrato_saas_id} — ${msg}`)
        errors.push({ instance_id: inst.id, contrato_saas_id: inst.contrato_saas_id, label: inst.label, error: msg })
      }
    }

    const failed = errors.length
    console.log(`donc-api-sync: concluído — synced=${synced} failed=${failed}`)

    return json({ synced, failed, errors, refMonth, dataInicio, dataFim })

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('donc-api-sync: erro inesperado —', msg)
    return json({ error: msg }, 500)
  }
})
