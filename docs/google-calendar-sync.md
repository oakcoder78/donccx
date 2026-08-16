# Google Calendar Sync

## Overview

Bi-directional sync between dontCX Hub activities and Google Calendar. Users authorize via OAuth2; activities can be created/updated/deleted from Google Calendar automatically.

## Architecture

```
Browser → Google OAuth → google-calendar-callback (Edge Function) → user_google_configs
Browser → google-calendar-event (Edge Function) → Google Calendar API → activities.google_event_id
```

## Database

### `user_google_configs` — OAuth tokens per user

| Column | Type | Description |
|---|---|---|
| `id` | uuid | PK |
| `user_id` | uuid | FK → `profiles.id`, UNIQUE |
| `access_token` | text | Google access token |
| `refresh_token` | text | Google refresh token (offline access) |
| `tokenexpiry` | timestamptz | When the access token expires |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

RLS: user can only read/write their own row (`user_id = auth.uid()`).

### `activities` and `onboarding_activities`

```sql
ALTER TABLE activities ADD COLUMN google_event_id text;
ALTER TABLE onboarding_activities ADD COLUMN google_event_id text;
ALTER TABLE activities ADD COLUMN meet_link text;
ALTER TABLE onboarding_activities ADD COLUMN meet_link text;
```

`google_event_id` — `null` = not synced. Contains Google Calendar `eventId` when synced.

`meet_link` — `null` = no Meet link. Contains the Google Meet `hangoutLink` URL when the activity was created/updated with `conferenceData`. Cleared on DELETE (event cancellation).

## Edge Functions

### `google-calendar-callback`

- **Method:** `GET` (OAuth callback from Google)
- **verify_jwt:** `false` (Google sends `?code=&state=`)
- **Redirect URI:** `https://etfeqblaeuhaobefxilp.supabase.co/functions/v1/google-calendar-callback`
- **Frontend redirect:** `https://donccx.vercel.app/?google=success` (or `?google=error=...`)
- **Flow:** exchanges auth code for tokens → upserts `user_google_configs`

### `google-calendar-event`

- **Method:** `POST` (muxed via `body.method`)
- **Auth:** Bearer token (Supabase JWT validated via `getUser`)
- **Supabase secrets:** `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`

| `body.method` | Action | Response |
|---|---|---|
| `POST` (default) | Create event | `{ id, htmlLink, summary, hangoutLink }` |
| `PATCH` | Update existing event | `{ id, htmlLink, summary, hangoutLink }` |
| `DELETE` | Fetch event (to notify attendees) + remove + clear `google_event_id` and `meet_link` | `{ deleted: true }` |

Body fields for POST/PATCH:
```json
{
  "method": "POST|PATCH|DELETE",
  "google_event_id": "string (required for PATCH/DELETE)",
  "summary": "Event title",
  "start": "2025-05-12T10:00:00.000Z",
  "end": "2025-05-12T10:50:00.000Z",
  "description": "Activity description",
  "attendees": ["contact@example.com", "other@example.com"],
  "conferenceData": { "createRequest": { "requestId": "...", "conferenceSolutionKey": { "type": "hangoutsMeet" } } },
  "timeZone": "America/Sao_Paulo",
  "linkedActivity": { "table": "activities", "id": "123" }
}
```

- `attendees` — `string[]` of email addresses. Trimmed, deduplicated, and validated before sending. Omitted from the Calendar API payload if empty. When non-empty, `?sendUpdates=all` is appended to the request so attendees receive native Google Calendar invites.
- `conferenceData` — Object with `createRequest` to generate a Google Meet link, or `null` to remove an existing conference from the event. When present, `?conferenceDataVersion=1` is appended to the request. The response includes `hangoutLink` with the Meet URL.
- `linkedActivity` — When provided, the function persists `google_event_id` and (on create/update with `conferenceData`) `meet_link` on the linked row. On DELETE, both are set to `null`.

Event duration: **50 minutes**. Default reminders: email at 60min + popup at 15min.

Token refresh is automatic when `tokenexpiry` is in the past. If the refresh token is expired or revoked, the function returns `{ error, code: 'TOKEN_EXPIRED' }` with status 401 so the frontend can show a reconnect prompt instead of a raw error.

#### Attendees normalization

The `attendees` string array is normalized before being sent to the Calendar API:
1. Each entry is trimmed of whitespace.
2. Empty strings are discarded.
3. Duplicates are removed (case-insensitive comparison).
4. Invalid email format is silently skipped.
5. If the resulting array is empty, `attendees` is omitted entirely (no empty array sent to Google).

#### Meet link lifecycle

1. **Create:** When `conferenceData` is present, the function sends `createRequest` to Google Calendar. Google provisions the Meet link asynchronously. The function polls `getCalendarEvent` up to 10 times (1s interval) to resolve `hangoutLink`. If resolved, `meet_link` is persisted on the `linkedActivity` row alongside `google_event_id`.
2. **Update (PATCH):** When `conferenceData` is present, same poll + persist flow. When `conferenceData` is `null`, the conference is removed from the event (Google drops the Meet link). When `conferenceData` is omitted, the existing conference is preserved.
3. **DELETE:** The function first does a GET on the existing event to check for attendees. If attendees exist, `?sendUpdates=all` is appended to the DELETE request so they receive a cancellation notification. Both `google_event_id` and `meet_link` are set to `null` on the `linkedActivity`.

#### Query parameters (auto-appended)

| Parameter | Condition | Purpose |
|---|---|---|
| `conferenceDataVersion=1` | `conferenceData` is present in body | Required by Google API to create/modify conference data |
| `sendUpdates=all` | `attendees` array is non-empty | Sends native Google Calendar invites/updates to attendees |

## Environment Variables

### Frontend (`.env.local` + Vercel)

```
VITE_GOOGLE_CLIENT_ID=947552296513-ncc9jn1g4ghje3j4itps7nbm0i4ppv75.apps.googleusercontent.com
```

### Supabase Edge Function Secrets (Dashboard → Edge Functions → Secrets)

```
GOOGLE_CLIENT_ID=947552296513-...apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=<secret>
```

### GCP OAuth Client (Google Cloud Console)

Required redirect URIs:
- `https://etfeqblaeuhaobefxilp.supabase.co/functions/v1/google-calendar-callback`
- `https://donccx.vercel.app/?google=success`

Scopes requested:
- `https://www.googleapis.com/auth/calendar`
- `https://www.googleapis.com/auth/calendar.events`

API must be enabled: [Google Calendar API](https://console.developers.google.com/apis/api/calendar-json.googleapis.com/overview?project=947552296513)

## User Flows

### 1. First-time authorization

1. User opens "Minha Conta" (`UserEditModal`)
2. Badge shows "Não conectado" + button "Conectar Google Calendar"
3. Click → redirect to Google OAuth consent screen
4. User grants access → Google redirects to Edge Function callback
5. Callback exchanges code, saves tokens, redirects `/?google=success`
6. `App.jsx` detects param, auto-opens `UserEditModal`
7. Toast "Google Calendar conectado!" fires **only on !connected → connected transition**
8. Badge updates to "Conectado"

### 2. Create activity with sync (including Meet + attendees)

1. Open `ActivityModal` → row with Date / Hour / Google Calendar checkbox
2. Checkbox visible only when `isGoogleConnected`
3. Checking checkbox makes hour **required** (label shows "Hora *")
4. Checking "Gerar link do Google Meet" sub-checkbox enables attendee chip input
5. Attendee chips are pre-filled from the selected contact's `email` field; users can add/remove emails
6. Submit → activity created → Edge Function `POST` called with `conferenceData` and `attendees`
7. Edge Function polls for `hangoutLink`, persists `meet_link` + `google_event_id` on activity
8. Single unified toast: "Atividade criada e sincronizada com Google Calendar!" (no duplicate toasts)

### 3. Edit synced activity

| Condition | Edge Function method |
|---|---|
| Checkbox active + activity has `google_event_id` | `PATCH` — updates time, attendees, Meet link in Google |
| Checkbox **unchecked** + activity has `google_event_id` | `DELETE` — notifies attendees of cancellation, removes from Google, clears `google_event_id` and `meet_link` |
| Checkbox active + activity has no `google_event_id` | `POST` — creates new event with Meet + attendees |
| Meet checkbox toggled off (edit mode) | `PATCH` with `conferenceData: null` — removes conference from event |
| Attendees changed | `PATCH` with updated `attendees` — sends updated invites via `sendUpdates=all` |

### 4. View activity details

- `!google_event_id && status !== 'concluida' && isConnected` → "Sincronizar" button in footer
- No `activity_time` → `GoogleSyncModal` opens first to capture time
- `google_event_id` exists → green "Sincronizado" link to `calendar.google.com/r/eventedit/{id}`
- `meet_link` exists → clickable "Entrar na reunião" link (opens Meet in new tab)

## Key Files

| `src/hooks/useGoogleCalendarStatus.js` | Query OAuth status, `connectGoogleCalendar()` |
| `src/hooks/useSessionToken.js` | Returns Supabase `access_token` for Bearer auth |
| `src/components/ui/UserEditModal.jsx` | Account modal: badge + connect button + toast |
| `src/components/activities/ActivityModal.jsx` | Create/edit: checkbox, required hour, sync on submit |
| `src/components/activities/ActivityDetailModal.jsx` | View: sync button + "Sincronizado" link in footer |
| `src/components/activities/GoogleSyncModal.jsx` | Time confirmation mini-modal (50 min duration) |
| `src/App.jsx` | Detects `?google=success/error` at init, passes signal to Navbar |
| `src/components/layout/Navbar.jsx` | Auto-opens `UserEditModal` on OAuth callback |
| `supabase/functions/google-calendar-callback/index.ts` | OAuth code exchange, token storage |
| `supabase/functions/google-calendar-event/index.ts` | CRUD operations on Google Calendar events |
| `supabase/migrations/20260512120000_user_google_configs.sql` | DB schema: tables and RLS |
| `supabase/migrations/20260816000000_add_activities_meet_link.sql` | Adds `meet_link` column to activities and onboarding_activities |
| `supabase/config.toml` | `verify_jwt = false` for both Edge Functions |

## Gotchas

- **`tokenexpiry`** is lowercase in PostgreSQL (case-sensitive). All code uses `tokenexpiry` matching the column name exactly.
- **`useSessionToken`** can return `null` on first render (async). Always guard: `if (!token) return` or initialize state accordingly.
- **`ActivityModal` sync** only runs when `form.activity_time` is truthy. Hourless activities cannot be synced.
- **`ActivityDetailModal` sync button** only shows when `status !== 'concluida'`.
- **OAuth cold load**: `App.jsx` reads `window.location.search` in `useState` initializer to handle page refresh with OAuth params in URL.
- **`google-calendar-event` token updates** write `tokenExpiry` (camelCase) to DB — Supabase accepts both, PostgreSQL stores as `tokenexpiry` (lowercase).
- **`user_google_configs` empty result (PGRST116):** `useGoogleCalendarStatus` uses `.maybeSingle()` instead of `.single()` to avoid "JSON object expected, got null" crash when no config exists.
- **`isExpired` removed from hook:** the boolean `isExpired` was removed from the hook return object as it was not consumed anywhere. Token expiry is still checked internally.
- **GCP OAuth app must be "In production":** Apps in "Testing" mode issue refresh tokens with a 7-day TTL. After the TTL, any Calendar API call fails with "Token refresh failed: Bad Request". Fix: GCP Console → OAuth consent screen → Publishing status → "In production". Done 2026-06-11.
- **`TOKEN_EXPIRED` response code:** any failure in the refresh token exchange returns `{ error, code: 'TOKEN_EXPIRED' }` (HTTP 401) instead of a raw 500, so the frontend can show a reconnect prompt. The outer catch also maps `invalid_grant`, `401`, `expired`, and `revoked` error strings to the same code.
- **`conferenceDataVersion=1` is required:** Google Calendar API ignores `conferenceData` entirely if `conferenceDataVersion` is not set in the query string. The edge function auto-appends `?conferenceDataVersion=1` whenever `conferenceData` is present in the body.
- **`null` conferenceData removes the conference:** Sending `conferenceData: null` on PATCH tells Google to remove the Meet link from the event. This is distinct from simply omitting `conferenceData`, which preserves the existing conference (preservation by omission).
- **Attendees normalization is silent:** Invalid emails, empty strings, and duplicates are dropped without error. If all entries are invalid, `attendees` is omitted entirely — no empty array is sent to Google.
- **Meet link polling is async:** Google provisions `hangoutLink` asynchronously after event creation. The edge function polls up to 10 times (1s interval). If the link is not resolved after 10 attempts, `meet_link` is saved as `null` and the frontend shows no Meet link. This is rare in practice.
- **DELETE notifies attendees:** The edge function fetches the existing event before deletion to check for attendees. If attendees exist, `?sendUpdates=all` is appended to the DELETE request so they receive a cancellation notification. If the GET fails, the delete proceeds without `sendUpdates` (best-effort).

## Recent Changes

- **2026-08-16 (commit `33af50c`):** Google Meet links + attendees invites — edge function now accepts `conferenceData` (createRequest for Meet) and `attendees` (string[]), appends `conferenceDataVersion=1` and `sendUpdates=all` query params, polls async `hangoutLink`, persists/clears `meet_link` on `linkedActivity`. DELETE does GET first to notify attendees of cancellation. `ActivityModal` adds opt-in "Gerar link do Google Meet" checkbox with editable attendee chips prefilled from contact emails. `ActivityDetailModal` shows Meet join link. Unified toast replaces duplicate toasts.
- **2026-06-11 (commit `33e08eb`):** `google-calendar-event` — token refresh failure now returns `{ code: 'TOKEN_EXPIRED' }` (HTTP 401) instead of raw 500; outer catch also maps `invalid_grant`/`expired`/`revoked` to same code. GCP OAuth app moved to "In production" to eliminate 7-day refresh token TTL.
- **2026-05-13 (commit `6a3bd88`):** Fixed Google Calendar sync integration — `ActivityModal` now only syncs on relevant field changes (type=reuniao, title, activity_date, activity_time); `ActivityDetailModal` guards `handleSyncToGoogleCalendar` with `if (!isConnected) return`; `useGoogleCalendarStatus` handles empty config gracefully; `isExpired` removed from hook return.
- **2026-05-13 (commit `1641ccf`):** `Icons.Calendar` replaces direct lucide-react import in `ActivityDetailModal`.
