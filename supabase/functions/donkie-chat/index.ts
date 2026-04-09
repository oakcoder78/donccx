/**
 * donkie-chat — Supabase Edge Function
 *
 * Proxia chamadas à API Anthropic para o assistente Donkie.
 * Requer secret configurado no projeto Supabase:
 *   ANTHROPIC_API_KEY
 *
 * Autentica o usuário via Bearer token antes de encaminhar.
 */

// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })

  try {
    // ── Autenticação ──────────────────────────────────────────
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
    if (!token) return json({ error: 'Unauthorized' }, 401)

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    )

    const { data: { user }, error: authErr } = await admin.auth.getUser(token)
    if (authErr || !user) return json({ error: 'Invalid token' }, 401)

    // ── Parse body ────────────────────────────────────────────
    const body = await req.json()

    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!anthropicKey) {
      console.error('donkie-chat: ANTHROPIC_API_KEY não configurada')
      return json({ error: 'AI not configured on server' }, 500)
    }

    // ── Encaminha para Anthropic ──────────────────────────────
    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    })

    const data = await anthropicRes.json().catch(() => ({ error: 'Invalid response from AI' }))
    return json(data, anthropicRes.status)

  } catch (err) {
    console.error('donkie-chat:', err)
    return json({ error: String(err) }, 500)
  }
})
