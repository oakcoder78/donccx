/**
 * freshdesk-proxy — Supabase Edge Function
 *
 * Proxia chamadas à API do Freshdesk para evitar CORS no browser.
 * Requer secrets configurados no projeto Supabase:
 *   FRESHDESK_API_KEY
 *   FRESHDESK_DOMAIN   (ex: donc)
 *
 * Body esperado: { path: string, params?: Record<string, string> }
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

  try {
    // ── Auth ────────────────────────────────────────────────────────────────
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
    if (!token) return json({ error: 'Unauthorized' }, 401)

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    )

    const { data: { user }, error: authErr } = await admin.auth.getUser(token)
    if (authErr || !user) return json({ error: 'Invalid token' }, 401)

    const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).maybeSingle()
    if (!['admin', 'manager'].includes(profile?.role ?? '')) return json({ error: 'Forbidden' }, 403)

    // ── Parse body ──────────────────────────────────────────────────────────
    const { path, params = {} } = await req.json()
    if (!path || typeof path !== 'string') return json({ error: '"path" is required' }, 400)

    const domain = Deno.env.get('FRESHDESK_DOMAIN')
    const apiKey = Deno.env.get('FRESHDESK_API_KEY')
    if (!domain || !apiKey) {
      console.error('freshdesk-proxy: secrets ausentes — FRESHDESK_DOMAIN:', !!domain, 'FRESHDESK_API_KEY:', !!apiKey)
      return json({ error: 'Freshdesk not configured on server (missing FRESHDESK_DOMAIN or FRESHDESK_API_KEY)' }, 500)
    }

    // ── Forward to Freshdesk ────────────────────────────────────────────────
    const qs = Object.keys(params).length
      ? '?' + new URLSearchParams(params as Record<string, string>).toString()
      : ''
    const url = `https://${domain}/api/v2${path}${qs}`
    const authHeader = 'Basic ' + btoa(`${apiKey}:X`)

    console.log('freshdesk-proxy: GET', url, '| auth prefix:', authHeader.slice(0, 12) + '...')

    const fdRes = await fetch(url, {
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
      },
    })

    console.log('freshdesk-proxy: response', fdRes.status, path)
    const data = await fdRes.json().catch(() => null)
    return json(data, fdRes.status)

  } catch (err) {
    console.error('freshdesk-proxy:', err)
    return json({ error: String(err) }, 500)
  }
})
