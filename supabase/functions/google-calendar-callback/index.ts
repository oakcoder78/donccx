/**
 * google-calendar-callback — Supabase Edge Function
 *
 * OAuth2 callback: receives the authorization code from Google,
 * exchanges it for tokens, and saves them in user_google_configs.
 *
 * Redirect flow:
 *   Browser → Google (authorize) → Google GET here ?code=...&state=user_id
 *   → exchanges code → upserts tokens → 302 redirects to frontend
 *
 * No JWT auth needed (code + state arrive from Google).
 * verify_jwt = false is intentional.
 */

// @ts-ignore
// supabase-edge-runtime: verify_jwt=false
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const FRONTEND_BASE = 'https://donccx.vercel.app'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface GoogleTokenResponse {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  error?: string
  error_description?: string
}

async function exchangeCode(
  clientId: string,
  clientSecret: string,
  code: string,
  redirectUri: string,
): Promise<{ accessToken: string; refreshToken: string; expiryDate: number }> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    }),
  })

  const data = await res.json() as GoogleTokenResponse
  if (!res.ok) {
    throw new Error(`Token exchange failed: ${data.error_description ?? data.error ?? JSON.stringify(data)}`)
  }

  return {
    accessToken: data.access_token!,
    refreshToken: data.refresh_token ?? '',
    expiryDate: Date.now() + (data.expires_in ?? 3600) * 1000,
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS })
  }

  try {
    const url = new URL(req.url)
    const code = url.searchParams.get('code')
    const rawState = url.searchParams.get('state') || ''
    const [userId, frontendOrigin] = rawState.split('|')
    const error = url.searchParams.get('error')
    const errorDescription = url.searchParams.get('error_description')
    const redirectBase = frontendOrigin || FRONTEND_BASE

    if (error) {
      const msg = encodeURIComponent(errorDescription ?? error)
      return new Response(null, {
        status: 302,
        headers: { Location: `${redirectBase}/?google=error=${msg}` },
      })
    }

    if (!code || !userId) {
      return new Response(JSON.stringify({ error: 'Missing code or state' }), {
        status: 400,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    const clientId = Deno.env.get('GOOGLE_CLIENT_ID')
    const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')
    if (!clientId || !clientSecret) {
      return new Response(null, {
        status: 302,
        headers: { Location: `${redirectBase}/?google=error=server_not_configured` },
      })
    }

    const redirectUri = `${Deno.env.get('SUPABASE_URL')}/functions/v1/google-calendar-callback`
    const tokens = await exchangeCode(clientId, clientSecret, code, redirectUri)

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    )

    const { error: upsertErr } = await admin
      .from('user_google_configs')
      .upsert({
        user_id: userId,
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken,
        tokenexpiry: new Date(tokens.expiryDate).toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' })

    if (upsertErr) {
      console.error('google-calendar-callback: upsert failed', upsertErr)
      return new Response(null, {
        status: 302,
        headers: { Location: `${redirectBase}/?google=error=db_save_failed` },
      })
    }

    return new Response(null, {
      status: 302,
      headers: { Location: `${redirectBase}/?google=success` },
    })

  } catch (err) {
    console.error('google-calendar-callback:', err)
    return new Response(null, {
      status: 302,
      headers: { Location: `${redirectBase || FRONTEND_BASE}/?google=error=unknown` },
    })
  }
})
