/**
 * asana-proxy — Supabase Edge Function
 *
 * Proxia chamadas à API do Asana para evitar expor o PAT no frontend.
 * Requer secret configurado no projeto Supabase:
 *   ASANA_PAT  (Personal Access Token de conta dedicada/bot)
 *
 * Body esperado: { path: string, method?: string, body?: object, params?: Record<string, string> }
 *
 * Rotas suportadas (paths da API do Asana):
 *   GET  /workspaces                      → lista workspaces (opt_fields=name)
 *   GET  /workspaces/{gid}/projects       → lista projetos do workspace
 *   GET  /projects/{gid}/sections         → lista seções do projeto
 *   POST /tasks                           → cria tarefa
 */

// @ts-ignore
// supabase-edge-runtime: verify_jwt=false
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { getServiceKey, createRateLimiter } from "../_shared/auth.ts"

const asanaLimiter = createRateLimiter(60_000, 30)
const ASANA_BASE = "https://app.asana.com/api/1.0"

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
      getServiceKey(),
      { auth: { autoRefreshToken: false, persistSession: false } },
    )

    const { data: { user }, error: authErr } = await admin.auth.getUser(token)
    if (authErr || !user) return json({ error: 'Invalid token' }, 401)

    if (!asanaLimiter(user.id)) {
      return json({ error: 'Too many requests. Try again later.' }, 429)
    }

    const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).maybeSingle()
    if (!['admin', 'manager', 'analyst'].includes(profile?.role ?? '')) return json({ error: 'Forbidden' }, 403)

    // ── Parse body ──────────────────────────────────────────────────────────
    const { path, params = {}, method = 'GET', body: asanaBody } = await req.json()
    if (!path || typeof path !== 'string') return json({ error: '"path" is required' }, 400)

    const pat = Deno.env.get('ASANA_PAT')
    if (!pat) {
      console.error('asana-proxy: secret ausente — ASANA_PAT:', !!pat)
      return json({ error: 'Asana not configured on server (missing ASANA_PAT)' }, 500)
    }

    // ── Forward to Asana ────────────────────────────────────────────────────
    const qs = Object.keys(params).length
      ? '?' + new URLSearchParams(params as Record<string, string>).toString()
      : ''
    const url = `${ASANA_BASE}${path}${qs}`

    const httpMethod = (method ?? 'GET').toUpperCase()
    console.log('asana-proxy:', httpMethod, url)

    const fetchOptions: RequestInit = {
      method: httpMethod,
      headers: {
        Authorization: `Bearer ${pat}`,
        'Content-Type': 'application/json',
      },
    }
    if (asanaBody && ['POST', 'PUT', 'PATCH'].includes(httpMethod)) {
      fetchOptions.body = JSON.stringify(asanaBody)
    }

    const asanaRes = await fetch(url, fetchOptions)

    console.log('asana-proxy: response', asanaRes.status, path)
    const data = await asanaRes.json().catch(() => null)
    return json(data, asanaRes.status)

  } catch (err) {
    console.error('asana-proxy:', err)
    return json({ error: String(err) }, 500)
  }
})