import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { authorizeRequest, getServiceKey, createCorsHeaders } from "../_shared/auth.ts"

serve(async (req) => {
  const origin = req.headers.get('origin')
  const cors = createCorsHeaders(origin)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const serviceKey = getServiceKey()
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const { authorized } = await authorizeRequest(req, admin, ['admin', 'manager'])
    if (!authorized) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403, headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    let body: Record<string, unknown>
    try {
      body = await req.json()
    } catch (e) {
      console.error('sync-schedule: invalid JSON body', e)
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
        status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }
    const { action, schedule, month, datetime } = body

    if (action === 'run-now') {
      const webhookSecret = Deno.env.get('SYNC_WEBHOOK_SECRET') ?? ''
      const body: Record<string, unknown> = { trigger: 'manual' }
      if (month) body.month = month

      const res = await fetch(`${supabaseUrl}/functions/v1/monthly-sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-webhook-secret': webhookSecret,
        },
        body: JSON.stringify(body),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || `HTTP ${res.status}`)

      return new Response(JSON.stringify({ ok: true, result }), {
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    if (action === 'set-schedule') {
      if (!schedule) throw new Error('schedule is required')

      const rpcResult = await admin.rpc('manage_cron_job', {
        p_action: 'schedule',
        p_job_name: 'monthly-sync-job',
        p_schedule: schedule,
      })
      if (rpcResult.error) throw new Error(rpcResult.error.message || JSON.stringify(rpcResult.error))

      return new Response(JSON.stringify({ ok: true, config: rpcResult.data }), {
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    if (action === 'schedule-oneoff') {
      if (!datetime) throw new Error('datetime is required')

      const d = new Date(datetime)
      if (isNaN(d.getTime())) throw new Error('Invalid datetime')

      const cronExpr = `${d.getUTCMinutes()} ${d.getUTCHours()} ${d.getUTCDate()} ${d.getUTCMonth() + 1} *`

      const unschedResult = await admin.rpc('manage_cron_job', {
        p_action: 'unschedule',
        p_job_name: 'monthly-sync-oneoff',
      })
      if (unschedResult.error) console.error('unschedule oneoff error (non-critical):', unschedResult.error)

      const schedResult = await admin.rpc('manage_cron_job', {
        p_action: 'schedule',
        p_job_name: 'monthly-sync-oneoff',
        p_schedule: cronExpr,
      })
      if (schedResult.error) throw new Error(schedResult.error.message || JSON.stringify(schedResult.error))

      return new Response(JSON.stringify({ ok: true, config: schedResult.data }), {
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    if (action === 'get-config') {
      const configResult = await admin.rpc('manage_cron_job', {
        p_action: 'get_config',
        p_job_name: 'monthly-sync-job',
      })
      if (configResult.error) throw new Error(configResult.error.message || JSON.stringify(configResult.error))

      const oneoffResult = await admin.rpc('manage_cron_job', {
        p_action: 'get_config',
        p_job_name: 'monthly-sync-oneoff',
      })
      if (oneoffResult.error) console.error('get oneoff config error (non-critical):', oneoffResult.error)

      return new Response(JSON.stringify({ ok: true, config: configResult.data, oneoff: oneoffResult.data }), {
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    throw new Error(`Unknown action: ${action}`)
  } catch (err) {
    console.error('sync-schedule error:', err)
    const message = err instanceof Error ? err.message : typeof err === 'object' && err !== null ? JSON.stringify(err) : String(err)
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }
})
