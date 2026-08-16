/**
 * google-calendar-event — Supabase Edge Function
 *
 * Manages Google Calendar events for the authenticated user.
 * Supports: CREATE, UPDATE (PATCH), DELETE
 *
 * Requires:
 *   - Client has authorized via OAuth2 (refresh_token stored in user_google_configs)
 *   - GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET secrets set in Supabase project
 *
 * Body:
 *   {
 *     "method":           "POST"|"PATCH"|"DELETE"  optional, default "POST"
 *     "google_event_id":  string                 required for PATCH/DELETE
 *     "summary":          string                 required for POST/PATCH
 *     "start":            string                 required for POST/PATCH (ISO 8601)
 *     "end":              string                 required for POST/PATCH (ISO 8601)
 *     "description":      string                 optional
 *     "location":         string                 optional
 *     "attendees":        string[]               optional  sends native invites (sendUpdates=all)
 *     "conferenceData":   object|null            optional  creates Google Meet (createRequest) or removes it (null)
 *     "timeZone":         string                 optional  default "America/Sao_Paulo"
 *     "reminders":        Reminder[]             optional
 *     "linkedActivity":   { table, id }          optional  saves/clears google_event_id and meet_link
 *   }
 *
 * Response: { id, htmlLink, summary, hangoutLink } or { deleted: true }
 */

// @ts-ignore
// supabase-edge-runtime: verify_jwt=false
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getServiceKey } from '../_shared/auth.ts'

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

interface DateTimeField {
  dateTime: string
  timeZone: string
}

interface ConferenceDataInput {
  createRequest?: { requestId: string; conferenceSolutionKey: { type: 'hangoutsMeet' } }
  status?: string
  hangoutLink?: string
  entryPoints?: unknown[]
}

interface CalendarEventInput {
  summary?: string
  description?: string
  location?: string
  start?: DateTimeField
  end?: DateTimeField
  attendees?: { email: string }[]
  conferenceData?: ConferenceDataInput | null
  reminders?: { useDefault: boolean; overrides: { method: string; minutes: number }[] }
  timeZone?: string
}

function normalizeAttendees(raw: unknown): { email: string }[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const seen = new Set<string>()
  const result: { email: string }[] = []
  for (const item of raw) {
    const email = typeof item === 'string'
      ? item.trim()
      : typeof item === 'object' && item !== null && (item as { email?: string }).email
        ? (item as { email: string }).email.trim()
        : ''
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) continue
    const lower = email.toLowerCase()
    if (seen.has(lower)) continue
    seen.add(lower)
    result.push({ email })
  }
  return result.length ? result : undefined
}

function buildQueryParams(event: CalendarEventInput): string {
  const params = new URLSearchParams()
  if (event.conferenceData !== undefined) params.set('conferenceDataVersion', '1')
  if ((event.attendees?.length ?? 0) > 0) params.set('sendUpdates', 'all')
  const qs = params.toString()
  return qs ? `?${qs}` : ''
}

async function getCalendarEvent(
  accessToken: string,
  eventId: string,
  calendarId = 'primary',
): Promise<Record<string, unknown>> {
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  )
  const data = await res.json() as Record<string, unknown>
  if (!res.ok) throw new Error(`Calendar API: ${res.status} — ${JSON.stringify(data)}`)
  return data
}

async function resolveHangoutLink(
  accessToken: string,
  eventId: string,
  attempts = 10,
  delayMs = 1000,
): Promise<string | null> {
  for (let i = 0; i < attempts; i++) {
    const event = await getCalendarEvent(accessToken, eventId)
    const link = (event.hangoutLink as string) || (event.conferenceData as Record<string, unknown> | undefined)?.hangoutLink
    if (link) return link
    await new Promise(r => setTimeout(r, delayMs))
  }
  return null
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
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events${buildQueryParams(event)}`,
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

async function updateCalendarEvent(
  accessToken: string,
  eventId: string,
  event: CalendarEventInput,
  calendarId = 'primary',
): Promise<{ id: string; htmlLink: string; summary: string }> {
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${eventId}${buildQueryParams(event)}`,
    {
      method: 'PATCH',
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

async function deleteCalendarEvent(
  accessToken: string,
  eventId: string,
  calendarId = 'primary',
  sendUpdates = false,
): Promise<void> {
  const qs = sendUpdates ? '?sendUpdates=all' : ''
  await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${eventId}${qs}`,
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
      getServiceKey(),
      { auth: { autoRefreshToken: false, persistSession: false } },
    )

    const { data: { user }, error: authErr } = await admin.auth.getUser(token)
    if (authErr || !user) return json({ error: 'Invalid token' }, 401)

    // ── Parse body ─────────────────────────────────────────────────────────
    const body = await req.json() as Record<string, unknown>
    const method = (body.method as string)?.toUpperCase() ?? 'POST'

    const clientId = Deno.env.get('GOOGLE_CLIENT_ID')
    const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')
    if (!clientId || !clientSecret) {
      console.error('google-calendar-event: GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET missing')
      return json({ error: 'Google Calendar not configured on server' }, 500)
    }

    // ── Load user tokens ────────────────────────────────────────────────────
    const { data: googleConfig } = await admin
      .from('user_google_configs')
      .select('refresh_token, tokenexpiry')
      .eq('user_id', user.id)
      .maybeSingle()

    if (!googleConfig?.refresh_token) {
      return json({ error: 'User has not authorized Google Calendar.' }, 403)
    }

    // ── Token refresh ──────────────────────────────────────────────────────
    let accessToken: string
    const needsRefresh = !googleConfig.tokenexpiry ||
      new Date(googleConfig.tokenexpiry).getTime() < Date.now()

    if (needsRefresh) {
      try {
        const refreshed = await refreshAccessToken(clientId, clientSecret, googleConfig.refresh_token)
        accessToken = refreshed.accessToken
        const updates: Record<string, unknown> = {
          access_token: refreshed.accessToken,
          tokenexpiry: new Date(refreshed.expiryDate).toISOString(),
          updated_at: new Date().toISOString(),
        }
        if (refreshed.newRefreshToken) updates.refresh_token = refreshed.newRefreshToken
        await admin.from('user_google_configs').update(updates).eq('user_id', user.id)
      } catch (refreshErr) {
        const msg = refreshErr instanceof Error ? refreshErr.message : String(refreshErr)
        console.error('Token refresh failed:', msg)
        // Any failure exchanging the refresh token means the stored Google grant is no
        // longer usable (expired, revoked, or rejected). The only remedy is for the user
        // to reconnect, so always surface TOKEN_EXPIRED rather than a raw 500.
        return json({
          error: 'Conexão com Google Calendar expirou — reconecte em "Minha Conta".',
          code: 'TOKEN_EXPIRED',
        }, 401)
      }
    } else {
      const { data: config } = await admin
        .from('user_google_configs')
        .select('access_token')
        .eq('user_id', user.id)
        .maybeSingle()
      accessToken = config?.access_token ?? ''
      if (!accessToken) {
        return json({ error: 'No valid access token. Please re-authorize Google Calendar.', code: 'TOKEN_EXPIRED' }, 401)
      }
    }

    const tz = (body.timeZone as string) ?? 'America/Sao_Paulo'
    const linkedActivity = body.linkedActivity as { table: string; id: string } | undefined
    const ALLOWED_LINKED_TABLES = ['activities', 'onboarding_activities']
    const safeLinkedActivity = (linkedActivity && linkedActivity.table && ALLOWED_LINKED_TABLES.includes(linkedActivity.table))
      ? linkedActivity
      : undefined

    // ── DELETE ────────────────────────────────────────────────────────────
    if (method === 'DELETE') {
      const googleEventId = body.google_event_id as string
      if (!googleEventId) return json({ error: 'google_event_id required for DELETE' }, 400)

      // Fetch the event first so attendees receive the cancellation (no ghost meetings).
      let sendUpdates = false
      try {
        const event = await getCalendarEvent(accessToken, googleEventId)
        sendUpdates = Array.isArray(event.attendees) && (event.attendees as unknown[]).length > 0
      } catch (err) {
        console.error('google-calendar-event: GET before DELETE failed:', err)
      }

      await deleteCalendarEvent(accessToken, googleEventId, 'primary', sendUpdates)

      if (safeLinkedActivity) {
        await admin
          .from(safeLinkedActivity.table)
          .update({ google_event_id: null, meet_link: null })
          .eq('id', safeLinkedActivity.id)
      }

      return json({ deleted: true })
    }

    // ── POST / PATCH ──────────────────────────────────────────────────────
    if (!body.start || !body.end) {
      return json({ error: '"start" and "end" ISO 8601 datetimes are required' }, 400)
    }

    const attendees = normalizeAttendees(body.attendees)

    const eventPayload: CalendarEventInput = {
      summary: (body.summary as string) || 'doncCX Hub Event',
      description: body.description as string,
      location: body.location as string,
      start: { dateTime: body.start as string, timeZone: tz },
      end: { dateTime: body.end as string, timeZone: tz },
      reminders: body.reminders ?? {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 60 },
          { method: 'popup', minutes: 15 },
        ],
      },
    }
    if (attendees) eventPayload.attendees = attendees

    // conferenceData is only included when the client explicitly sends it.
    // null removes a conference; { createRequest } creates a Google Meet.
    const hasConferenceData = Object.prototype.hasOwnProperty.call(body, 'conferenceData')
    if (hasConferenceData) {
      const conf = body.conferenceData as unknown
      eventPayload.conferenceData = conf === null || conf === undefined
        ? null
        : (typeof conf === 'object' && conf !== null ? conf as ConferenceDataInput : undefined)
    }

    if (method === 'PATCH') {
      const googleEventId = body.google_event_id as string
      if (!googleEventId) return json({ error: 'google_event_id required for PATCH' }, 400)

      const result = await updateCalendarEvent(accessToken, googleEventId, eventPayload)
      const hangoutLink = hasConferenceData ? await resolveHangoutLink(accessToken, result.id) : null

      if (safeLinkedActivity && hasConferenceData) {
        await admin
          .from(safeLinkedActivity.table)
          .update({ meet_link: hangoutLink })
          .eq('id', safeLinkedActivity.id)
      }

      return json({ ...result, hangoutLink })
    }

    // ── POST (create) ─────────────────────────────────────────────────────
    const result = await insertCalendarEvent(accessToken, eventPayload)
    const hangoutLink = hasConferenceData ? await resolveHangoutLink(accessToken, result.id) : null

    if (safeLinkedActivity) {
      await admin
        .from(safeLinkedActivity.table)
        .update({ google_event_id: result.id, meet_link: hangoutLink })
        .eq('id', safeLinkedActivity.id)
    }

    return json({ ...result, hangoutLink })

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('google-calendar-event:', msg)
    if (msg.includes('401') || msg.includes('invalid_grant') || msg.includes('expired') || msg.includes('revoked')) {
      return json({ error: 'Conexão com Google Calendar expirou — reconecte em "Minha Conta".', code: 'TOKEN_EXPIRED' }, 401)
    }
    if (msg.includes('403')) {
      return json({ error: 'Acesso ao Google Calendar negado — reconecte em "Minha Conta".', code: 'TOKEN_EXPIRED' }, 403)
    }
    return json({ error: msg }, 500)
  }
})
