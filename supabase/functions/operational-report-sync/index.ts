/**
 * operational-report-sync — Supabase Edge Function
 *
 * Recebe dados operacionais do n8n e faz upsert em client_operational_reports.
 *
 * Body: { saas_id: number, period: string, data_os: object, data_problemas: object, data_produtividade: object }
 *
 * Exemplo:
 *   { "saas_id": 1004, "period": "2026-04", "data_os": {...}, "data_problemas": {...}, "data_produtividade": {...} }
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { authorizeRequest, getServiceKey } from "../_shared/auth.ts"

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function isAuthorizedByN8nKey(req: Request): boolean {
  const n8nAuth = Deno.env.get('N8N_AUTH_KEY') ?? ''
  if (!n8nAuth) return false
  const apikey = req.headers.get('apikey')
  const bearer = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
  return apikey === n8nAuth || bearer === n8nAuth
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

  try {
    // ── Auth ─────────────────────────────────────────────────────────────────
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey  = getServiceKey()

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const authorizedByN8n = isAuthorizedByN8nKey(req)
    if (!authorizedByN8n) {
      const { authorized } = await authorizeRequest(req, admin, ['admin', 'manager'])
      if (!authorized) return json({ ok: false, error: 'Forbidden' }, 403)
    }

    // ── Parse body ───────────────────────────────────────────────────────────
    const body = await req.json() as {
      saas_id: number
      period: string
      data_os?: Record<string, unknown>
      data_problemas?: Record<string, unknown>
      data_produtividade?: Record<string, unknown>
    }

    const { saas_id, period, data_os, data_problemas, data_produtividade } = body

    if (!saas_id || !period) {
      return json({ ok: false, error: 'saas_id and period are required' }, 400)
    }

    if (!/^\d{4}-\d{2}$/.test(period)) {
      return json({ ok: false, error: `Invalid period format: "${period}". Use YYYY-MM.` }, 400)
    }

    // ── Resolver client_id a partir do saas_id ───────────────────────────────
    const { data: instances, error: instErr } = await admin
      .from('client_donc_instances')
      .select('client_id')
      .eq('contrato_saas_id', saas_id)
      .limit(1)

    if (instErr) throw new Error(`Error looking up instance: ${instErr.message}`)
    if (!instances || instances.length === 0) {
      return json({ ok: false, error: `Client not found for saas_id ${saas_id}` }, 404)
    }

    const clientId = instances[0].client_id

    // ── Upsert em client_operational_reports ─────────────────────────────────
    const now = new Date().toISOString()

    const { error: upsertErr } = await admin
      .from('client_operational_reports')
      .upsert({
        client_id: clientId,
        period,
        status: 'done',
        data_os: data_os ?? null,
        data_problemas: data_problemas ?? null,
        data_produtividade: data_produtividade ?? null,
        processed_at: now,
      }, { onConflict: 'client_id,period' })

    if (upsertErr) {
      // Salvar com status error
      await admin.from('client_operational_reports').upsert({
        client_id: clientId,
        period,
        status: 'error',
        error_message: upsertErr.message,
        processed_at: now,
        data_os: data_os ?? null,
        data_problemas: data_problemas ?? null,
        data_produtividade: data_produtividade ?? null,
      }, { onConflict: 'client_id,period' })

      throw new Error(`Upsert failed: ${upsertErr.message}`)
    }

    // ── Determinar se foi insert ou update ───────────────────────────────────
    const { data: existing } = await admin
      .from('client_operational_reports')
      .select('created_at')
      .eq('client_id', clientId)
      .eq('period', period)
      .single()

    const action = existing && new Date(existing.created_at).getTime() < new Date(now).getTime() - 1000
      ? 'updated'
      : 'inserted'

    console.log(`[operational-report-sync] ${action} client_id=${clientId} period=${period}`)

    return json({ ok: true, client_id: clientId, period, action })

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[operational-report-sync] error:', msg)
    return json({ ok: false, error: 'Internal server error' }, 500)
  }
})
