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

    const { action, schedule, month, datetime } = await req.json()

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

      const { data, error } = await admin.rpc('manage_cron_job', {
        p_action: 'schedule',
        p_job_name: 'monthly-sync-job',
        p_schedule: schedule,
      })
      if (error) throw error

      return new Response(JSON.stringify({ ok: true, config: data }), {
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    if (action === 'schedule-oneoff') {
      if (!datetime) throw new Error('datetime is required')

      const d = new Date(datetime)
      if (isNaN(d.getTime())) throw new Error('Invalid datetime')

      const cronExpr = `${d.getUTCMinutes()} ${d.getUTCHours()} ${d.getUTCDate()} ${d.getUTCMonth() + 1} *`

      await admin.rpc('manage_cron_job', {
        p_action: 'unschedule',
        p_job_name: 'monthly-sync-oneoff',
      })

      const { data, error } = await admin.rpc('manage_cron_job', {
        p_action: 'schedule',
        p_job_name: 'monthly-sync-oneoff',
        p_schedule: cronExpr,
      })
      if (error) throw error

      return new Response(JSON.stringify({ ok: true, config: data }), {
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    if (action === 'get-config') {
      const { data: config, error } = await admin.rpc('manage_cron_job', {
        p_action: 'get_config',
        p_job_name: 'monthly-sync-job',
      })
      if (error) throw error

      const { data: oneoff } = await admin.rpc('manage_cron_job', {
        p_action: 'get_config',
        p_job_name: 'monthly-sync-oneoff',
      })

      return new Response(JSON.stringify({ ok: true, config, oneoff }), {
        headers: { ...cors, 'Content-Type': 'application/json' },
      })
    }

    throw new Error(`Unknown action: ${action}`)
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }
})
