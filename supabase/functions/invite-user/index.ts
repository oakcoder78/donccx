import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { getServiceKey, createRateLimiter } from "../_shared/auth.ts"

const inviteUserLimiter = createRateLimiter(60_000, 20)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 1. Validar token do chamador (precisa ser um usuário autenticado com role admin)
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
    if (!token) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 2. Admin client (secret key) — bypasses RLS
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      getServiceKey(),
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const { data: { user: caller }, error: callerErr } = await adminClient.auth.getUser(token)
    if (callerErr || !caller) {
      return new Response(
        JSON.stringify({ error: 'Invalid authorization token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    if (!inviteUserLimiter(caller.id)) {
      return new Response(
        JSON.stringify({ error: 'Too many requests. Try again later.' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { data: callerProfile } = await adminClient
      .from('profiles').select('role').eq('id', caller.id).maybeSingle()
    if (!['admin', 'manager'].includes(callerProfile?.role ?? '')) {
      return new Response(
        JSON.stringify({ error: 'Forbidden: admin or manager role required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 3. Parse body
    const { email, role, name, redirectTo } = await req.json()
    if (!email || !role || !name) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: email, role, name' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Manager cannot invite admin/manager (privilege escalation guard)
    if (callerProfile?.role === 'manager' && ['admin', 'manager'].includes(role)) {
      return new Response(
        JSON.stringify({ error: 'Forbidden: manager cannot invite admin/manager' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 4. Verificar se já existe usuário Auth com esse email
    const { data: { users }, error: listError } = await adminClient.auth.admin.listUsers({ perPage: 1000 })
    if (listError) {
      console.error('listUsers error:', listError.message)
    }
    const existingUser = users?.find(u => u.email === email)

    if (existingUser) {
      console.log('User already exists in Auth:', email, 'id:', existingUser.id)
      // Check current profile status — if invited/pending, this is a resend (admin reenviou convite expirado)
      const { data: existingProfile } = await adminClient
        .from('profiles').select('status').eq('id', existingUser.id).maybeSingle()

      if (existingProfile?.status === 'invited' || existingProfile?.status === 'pending') {
        console.log('Resending invite for existing invited/pending user:', email, 'status:', existingProfile.status)
        // Update profile to latest name/role and bump last_invite_at before resending (resets contador)
        const nowIso = new Date().toISOString()
        await adminClient.from('profiles').update({ name, role, status: 'invited', last_invite_at: nowIso }).eq('id', existingUser.id)
        const resendRedirect = redirectTo || 'https://donccx.vercel.app/primeiro-acesso'
        const { error: resendError } = await adminClient.auth.admin.inviteUserByEmail(email, {
          data: { role, name },
          redirectTo: resendRedirect,
        })
        if (resendError) {
          console.error('inviteUserByEmail resend error:', resendError.message)
          const isRateLimited = /rate limit|too many|emails per hour/i.test(resendError.message)
          return new Response(
            JSON.stringify({ error: isRateLimited ? 'Limite de e-mails do Supabase atingido (2/h). Aguarde alguns minutos.' : resendError.message }),
            { status: isRateLimited ? 429 : 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
        return new Response(
          JSON.stringify({ success: true, existing: true, resent: true, user_id: existingUser.id }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Active/blocked user — just ensure profile is active (original behavior)
      const { error: upsertErr } = await adminClient
        .from('profiles')
        .upsert({ id: existingUser.id, name, email, role, status: 'active' }, { onConflict: 'id' })
      if (upsertErr) console.error('profiles upsert (existing) error:', upsertErr.message)
      else console.log('profiles upserted active for existing user:', existingUser.id)
      return new Response(
        JSON.stringify({ success: true, existing: true, user_id: existingUser.id }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 5. Send invite email via Supabase Auth admin
    const inviteOptions: { data: Record<string, string>; redirectTo?: string } = {
      data: { role, name },
    }
    if (redirectTo) inviteOptions.redirectTo = redirectTo

    const { data, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(
      email,
      inviteOptions
    )

    if (inviteError) {
      console.error('inviteUserByEmail error:', inviteError.message)
      return new Response(
        JSON.stringify({ error: inviteError.message }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('Invite sent to:', email, 'user_id:', data.user?.id)

    // Garantir profiles com status invited (trigger handle_new_user cria pending, aqui promovemos para invited)
    if (data.user?.id) {
      const nowIso = new Date().toISOString()
      const { error: upsertErr } = await adminClient
        .from('profiles')
        .upsert({ id: data.user.id, name, email, role, status: 'invited', last_invite_at: nowIso }, { onConflict: 'id' })
      if (upsertErr) {
        console.error('profiles upsert (invited) error:', upsertErr.message)
      } else {
        console.log('profiles upserted invited for new user:', data.user.id)
      }
      // Fallback: se trigger ainda não criou, forçar update caso upsert não pegue por race
      // (upsert já cobre, mas garantir status invited mesmo se linha já existia como pending)
      await adminClient.from('profiles').update({ name, role, status: 'invited', last_invite_at: nowIso }).eq('id', data.user.id)
    }

    return new Response(
      JSON.stringify({ success: true, existing: false, user_id: data.user?.id }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('invite-user: Unhandled error:', err)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
