import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 1. Extract Bearer token
    const authHeader = req.headers.get('Authorization') ?? ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : ''
    if (!token) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 2. Admin client (service role) — bypasses RLS
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // 3. Validate caller JWT
    const { data: { user: caller }, error: authError } = await adminClient.auth.getUser(token)
    if (authError || !caller) {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired token', detail: authError?.message }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 4. Check caller is admin or manager
    const { data: callerProfile } = await adminClient
      .from('profiles')
      .select('role')
      .eq('id', caller.id)
      .maybeSingle()

    if (!callerProfile || !['admin', 'manager'].includes(callerProfile.role)) {
      return new Response(
        JSON.stringify({ error: 'Insufficient permissions' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 5. Parse body
    const { email, role, name, redirectTo } = await req.json()
    if (!email || !role || !name) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: email, role, name' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 6. Send invite email via Supabase Auth admin
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

    return new Response(
      JSON.stringify({ success: true, user_id: data.user?.id }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('Unhandled error:', err)
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
