/**
 * google-calendar-event — Supabase Edge Function
 *
 * Creates a Google Calendar event for the authenticated user.
 * Requires:
 *   - Client has authorized via OAuth2 (refresh_token stored in user_google_configs)
 *   - GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET secrets set in Supabase project
 *
 * Body:
 *   {
 *     "summary":        string       required
 *     "start":          string       required  ISO 8601
 *     "end":            string       required  ISO 8601
 *     "description":    string       optional
 *     "location":       string       optional
 *     "attendees":      string[]     optional  email list
 *     "timeZone":       string       optional  default "America/Sao_Paulo"
 *     "reminders":      Reminder[]   optional
 *     "linkedActivity": { table, id } optional  saves google_event_id back
 *   }
 *
 * Response: { id, htmlLink, summary }
 */

// @ts-ignore
// supabase-edge-runtime: verify_jwt=false
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface GoogleTokens {
  access_token: string
  refresh_token: string
  expires_in: number
  tokenExpiry?: number
}

interface GoogleTokenResponse {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  error?: string
  error_description?: string
}

interface CalendarEventInput {
  summary?: string
  description?: string
  location?: string
  start: string
  end: string
  attendees?: { email: string }[]
  reminders?: { useDefault: boolean; overrides: { method: string; minutes: number }[] }
  colorId?: string
  timeZone?: string
  linkedActivity?: { table: 'activities' | 'onboarding_activities'; id: string }
}

async function refreshAccessToken(
  clientId: string,
  clientSecret: string,
  refreshToken: string,
): Promise<{ accessToken: string; newRefreshToken?: string; expiryDate: number }> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })

  const data = await res.json() as GoogleTokenResponse
  if (!res.ok) throw new Error(`Token refresh failed: ${data.error_description ?? data.error ?? JSON.stringify(data)}`)

  return {
    accessToken: data.access_token!,
    newRefreshToken: data.refresh_token,
    expiryDate: Date.now() + (data.expires_in ?? 3600) * 1000,
  }
}

async function insertCalendarEvent(
  accessToken: string,
  event: CalendarEventInput,
  calendarId = 'primary',
): Promise<{ id: string; htmlLink: string; summary: string }> {
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(event),
    },
  )

  const data = await res.json() as Record<string, unknown>
  if (!res.ok) throw new Error(`Calendar API: ${res.status} — ${JSON.stringify(data)}`)

  return {
    id: data.id as string,
    htmlLink: data.htmlLink as string,
    summary: data.summary as string,
  }
}

async function deleteCalendarEvent(accessToken: string, eventId: string, calendarId = 'primary'): Promise<void> {
  await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  )
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return json('ok')

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

    // ── Input validation ────────────────────────────────────────────────────
    const body = await req.json() as CalendarEventInput
    if (!body?.start || !body?.end) {
      return json({ error: '"start" and "end" ISO 8601 datetimes are required' }, 400)
    }

    const clientId = Deno.env.get('GOOGLE_CLIENT_ID')
    const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')
    if (!clientId || !clientSecret) {
      console.error('google-calendar-event: GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET missing')
      return json({ error: 'Google Calendar not configured on server' }, 500)
    }

    // ── Load user tokens ────────────────────────────────────────────────────
    const { data: googleConfig, error: configErr } = await admin
      .from('user_google_configs')
      .select('refresh_token, tokenExpiry')
      .eq('user_id', user.id)
      .maybeSingle()

    if (configErr) console.error('Load google config:', configErr)
    if (!googleConfig?.refresh_token) {
      return json({ error: 'User has not authorized Google Calendar. Redirect to OAuth flow.' }, 403)
    }

    // ── Token refresh ──────────────────────────────────────────────────────
    let accessToken: string
    const needsRefresh = !googleConfig.tokenExpiry || googleConfig.tokenExpiry < Date.now()

    if (needsRefresh) {
      const refreshed = await refreshAccessToken(clientId, clientSecret, googleConfig.refresh_token)
      accessToken = refreshed.accessToken

      await admin
        .from('user_google_configs')
        .update({
          access_token: refreshed.accessToken,
          tokenExpiry: refreshed.expiryDate,
          ...(refreshed.newRefreshToken ? { refresh_token: refreshed.newRefreshToken } : {}),
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', user.id)

      if (refreshed.newRefreshToken) {
        await admin
          .from('user_google_configs')
          .update({ refresh_token: refreshed.newRefreshToken })
          .eq('user_id', user.id)
      }
    } else {
      const { data: config } = await admin
        .from('user_google_configs')
        .select('access_token')
        .eq('user_id', user.id)
        .maybeSingle()
      accessToken = config?.access_token ?? ''
    }

    // ── Build event ────────────────────────────────────────────────────────
    const tz = timeZone ?? 'America/Sao_Paulo'
    const event: CalendarEventInput = {
      summary: body.summary || 'doncCX Hub Event',
      description: body.description,
      location: body.location,
      start: { dateTime: body.start, timeZone: tz } as unknown as string,
      end: { dateTime: body.end, timeZone: tz } as unknown as string,
      attendees: body.attendees,
      reminders: body.reminders ?? {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 60 },
          { method: 'popup', minutes: 15 },
        ],
      },
    }

    // ── Insert ──────────────────────────────────────────────────────────────
    const result = await insertCalendarEvent(accessToken, event)

    // ── Link back to activity ──────────────────────────────────────────────
    if (body.linkedActivity?.table && body.linkedActivity?.id) {
      await admin
        .from(body.linkedActivity.table)
        .update({ google_event_id: result.id })
        .eq('id', body.linkedActivity.id)
    }

    return json(result)

  } catch (err) {
    console.error('google-calendar-event:', err)
    return json({ error: String(err) }, 500)
  }
})
