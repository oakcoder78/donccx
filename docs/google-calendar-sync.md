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
```

`null` = not synced. Contains Google Calendar `eventId` when synced.

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
| `POST` (default) | Create event | `{ id, htmlLink, summary }` |
| `PATCH` | Update existing event | `{ id, htmlLink, summary }` |
| `DELETE` | Remove event + clear `google_event_id` | `{ deleted: true }` |

Body fields for POST/PATCH:
```json
{
  "method": "POST|PATCH|DELETE",
  "google_event_id": "string (required for PATCH/DELETE)",
  "summary": "Event title",
  "start": "2025-05-12T10:00:00.000Z",
  "end": "2025-05-12T10:50:00.000Z",
  "description": "Activity description",
  "attendees": [{ "email": "contact@example.com" }],
  "timeZone": "America/Sao_Paulo",
  "linkedActivity": { "table": "activities", "id": "123" }
}
```

Event duration: **50 minutes**. Default reminders: email at 60min + popup at 15min.

Token refresh is automatic when `tokenexpiry` is in the past.

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

### 2. Create activity with sync

1. Open `ActivityModal` → row with Date / Hour / Google Calendar checkbox
2. Checkbox visible only when `isGoogleConnected`
3. Checking checkbox makes hour **required** (label shows "Hora *")
4. Submit → activity created → Edge Function `POST` called
5. `google_event_id` saved to activity
6. Toast "Atividade sincronizada com Google Calendar!"

### 3. Edit synced activity

| Condition | Edge Function method |
|---|---|
| Checkbox active + activity has `google_event_id` | `PATCH` — updates time in Google |
| Checkbox **unchecked** + activity has `google_event_id` | `DELETE` — removes from Google, clears `google_event_id` |
| Checkbox active + activity has no `google_event_id` | `POST` — creates new event |

### 4. View activity details

- `!google_event_id && status !== 'concluida' && isConnected` → "Sincronizar" button in footer
- No `activity_time` → `GoogleSyncModal` opens first to capture time
- `google_event_id` exists → green "Sincronizado" link to `calendar.google.com/r/eventedit/{id}`

## Key Files

| File | Role |
|---|---|
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
| `supabase/config.toml` | `verify_jwt = false` for both Edge Functions |

## Gotchas

- **`tokenexpiry`** is lowercase in PostgreSQL (case-sensitive). All code uses `tokenexpiry` matching the column name exactly.
- **`useSessionToken`** can return `null` on first render (async). Always guard: `if (!token) return` or initialize state accordingly.
- **`ActivityModal` sync** only runs when `form.activity_time` is truthy. Hourless activities cannot be synced.
- **`ActivityDetailModal` sync button** only shows when `status !== 'concluida'`.
- **OAuth cold load**: `App.jsx` reads `window.location.search` in `useState` initializer to handle page refresh with OAuth params in URL.
- **`google-calendar-event` token updates** write `tokenExpiry` (camelCase) to DB — Supabase accepts both, PostgreSQL stores as `tokenexpiry` (lowercase).

## Future Work

- [ ] Sync `onboarding_activities` with the same logic (not yet implemented in `OnboardingDetailPage`)
- [ ] Migration file should include `access_token`, `refresh_token`, `tokenexpiry` columns (currently missing — columns exist in production DB but not in the migration file)
