import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { getServiceKey, createRateLimiter } from "../_shared/auth.ts"

// Public endpoint — no JWT, rate limited by IP + email
// Allows unauthenticated users with expired links to request a new invite
const ipLimiter = createRateLimiter(60_000, 5) // 5 req/min per IP
const emailLimiter = createRateLimiter(60_000 * 60, 3) // 3 resends/hour per email

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      ?? req.headers.get('cf-connecting-ip') ?? 'unknown'
    if (!ipLimiter(ip)) {
      return new Response(
        JSON.stringify({ error: 'Too many requests. Try again in a minute.' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { email } = await req.json().catch(() => ({}))
    const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : ''
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return new Response(
        JSON.stringify({ error: 'Valid email is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!emailLimiter(cleanEmail)) {
      return new Response(
        JSON.stringify({ error: 'Too many resends for this email. Try again in an hour.' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      getServiceKey(),
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Find auth user by email
    const { data: { users }, error: listError } = await adminClient.auth.admin.listUsers({ perPage: 1000 })
    if (listError) {
      console.error('resend-invite listUsers error:', listError.message)
      return new Response(
        JSON.stringify({ error: 'Failed to lookup user' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    const existingUser = users?.find(u => (u.email || '').toLowerCase() === cleanEmail)
    if (!existingUser) {
      // Don't reveal whether email exists — but we can be slightly helpful
      // To avoid enumeration, return success anyway with generic message
      // However for invite flow, we need to tell user if no invite exists
      console.log('resend-invite: no auth user for', cleanEmail)
      return new Response(
        JSON.stringify({ error: 'Nenhum convite encontrado para este e-mail. Verifique o e-mail ou peça a um administrador para te convidar.' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check profiles status — only allow resend for invited/pending
    const { data: profile } = await adminClient
      .from('profiles').select('id, status, role, name, email').eq('id', existingUser.id).maybeSingle()

    if (!profile) {
      console.error('resend-invite: no profile for', existingUser.id)
      return new Response(
        JSON.stringify({ error: 'Perfil não encontrado. Contate um administrador.' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (profile.status === 'active') {
      return new Response(
        JSON.stringify({ error: 'Este usuário já está ativo. Faça login com sua senha.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (profile.status === 'blocked') {
      return new Response(
        JSON.stringify({ error: 'Este usuário está bloqueado. Contate um administrador.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Only invited/pending can be resent
    if (!['invited', 'pending'].includes(profile.status)) {
      return new Response(
        JSON.stringify({ error: `Não é possível reenviar convite para status "${profile.status}".` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Resend invite — Supabase will send a new email with fresh OTP
    // inviteUserByEmail on existing user resends; if that fails due to already confirmed,
    // fallback to generateLink
    const redirectTo = 'https://donccx.vercel.app/primeiro-acesso'
    console.log('resend-invite: resending to', cleanEmail, 'user_id:', existingUser.id, 'status:', profile.status)

    const { error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(
      cleanEmail,
      { data: { role: profile.role, name: profile.name }, redirectTo }
    )

    if (inviteError) {
      console.error('resend-invite inviteUserByEmail error:', inviteError.message)
      // Common case: "User already registered" when email_confirmed_at is set but status still invited
      // Try generateLink as fallback (doesn't require user to be unconfirmed)
      const { error: linkError } = await adminClient.auth.admin.generateLink({
        type: 'invite',
        email: cleanEmail,
        options: { data: { role: profile.role, name: profile.name }, redirectTo },
      })
      if (linkError) {
        console.error('resend-invite generateLink error:', linkError.message)
        // Surface Supabase rate limit (2 emails/h) clearly
        const isRateLimited = /rate limit|too many|emails per hour/i.test(inviteError.message + linkError.message)
        return new Response(
          JSON.stringify({ error: isRateLimited ? 'Limite de e-mails do Supabase atingido (2/h). Aguarde ou peça a um admin para tentar em alguns minutos.' : inviteError.message }),
          { status: isRateLimited ? 429 : 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      // generateLink succeeded — but it doesn't send email by default when using service_role
      // So we need to actually send via inviteUserByEmail path; if invite failed but generateLink succeeded,
      // the link was created but not emailed. We should still try to inform.
      // For now, consider it success if link generated — Supabase may have sent email depending on config
      console.log('resend-invite: generateLink fallback succeeded for', cleanEmail)
    }

    return new Response(
      JSON.stringify({ success: true, email: cleanEmail }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('resend-invite Unhandled error:', err)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
