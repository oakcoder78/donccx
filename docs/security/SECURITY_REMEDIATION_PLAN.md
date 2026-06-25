# Security Remediation Plan — doncCX Hub

**Generated:** 2026-06-24
**Updated:** 2026-06-25 (Phase 1 completed)
**Audit scope:** Edge Functions (14), RLS Policies (42 migrations), Credential Scan (entire codebase)
**Classification:** Critical (6), High (6), Medium (8), Low (8+)

---

## Phase 0 — ✅ Completed 2026-06-24

### 0.1 ✅ Rotate all leaked credentials

| Credential | Location | Status |
|-----------|----------|--------|
| OpenRouter API Key | `.openclaude-profile.json:6` | Rotated by user |
| Anthropic API Key | `.env.local:9` + Supabase Secrets | Rotated by user |
| Supabase Secret Key | `.env.local:11` | Rotated by user |
| Supabase Access Token | `.env.local:12` | Rotated by user |
| Resend API Key | `.env.local:7` + Supabase Secrets | Rotated by user |
| Freshdesk API Key | `.env.local:6` + Supabase Secrets | Rotated by user (initially forgot Supabase secret, fixed after) |

**Implementation notes:**
- All 6 keys rotated manually by user via respective dashboards
- Supabase Edge Function secrets (`ANTHROPIC_API_KEY`, `RESEND_API_KEY`, `FRESHDESK_API_KEY`, `SUPABASE_SECRET_KEYS`) updated via Supabase Dashboard
- Freshdesk API key required separate update in Supabase Secrets (`.env.local` change alone doesn't affect Edge Functions)

---

### 0.2 ✅ Remove tracked credentials from git

**Done:**
- `.openclaude-profile.json` and `.openclaude/` added to `.gitignore`
- `git rm --cached .openclaude-profile.json`
- History scrubbed via `git filter-repo` (faster than `filter-branch`)
- Force pushed to origin (`main` + all branches + tags)
- Verified: `git log --all --diff-filter=A -- .openclaude-profile.json` returns empty

**Note:** `git filter-repo` used instead of `git filter-branch` (filter-branch timed out at 866 commits). filter-repo completed in 2s.

---

### 0.3 ✅ Add authentication to `donkie-chat`

**File:** `supabase/functions/donkie-chat/index.ts`

**Implementation:**
- Added `authorizeRequest` from `_shared/auth.ts` (JWT + role check)
- Added `createCorsHeaders` (restricted origins) from `_shared/auth.ts`
- Added in-memory rate limiting: 10 req/min per user
- Error handling: returns `"Internal server error"` with console.error log
- Platform-level `verify_jwt` = `true` (default, not in `config.toml`) also gates access

**Also:** Added `createCorsHeaders()` export to `_shared/auth.ts` as shared utility.

**Deployed:** ✅ `supabase functions deploy donkie-chat`

**Verification:**
- Call without JWT → `401 UNAUTHORIZED_NO_AUTH_HEADER` ✅
- Call with invalid JWT → `401 UNAUTHORIZED_INVALID_JWT_FORMAT` ✅
- UI test with valid session → works ✅

---

### 0.4 ✅ Fix REST injection in `send-email`

**File:** `supabase/functions/send-email/index.ts`

**Implementation (deviated from plan):**
- UUID validation via regex (`/^[0-9a-f]{8}-.../i`) instead of `deno.land/std/uuid` (deprecated)
- Caller identity extracted from `auth/v1/user` response (line 89: `const authUser = await authRes.json()`)
- Admin client created via `createClient(sbUrl, sbKey)` for admin SDK calls
- Profile fetch replaced with `admin.from('profiles').select(...)` — no raw REST interpolation
- Identity check: `sent_by !== callerId && !isAdminOrManager` → 403
- Error leakage fixed: `String(err)` → `"Internal server error"` with `console.error`

**Deployed:** ✅ `supabase functions deploy send-email`

**Verification:**
- UI test: email sent successfully ✅
- Invalid sent_by UUID → 400 (code-level, would need curl test with valid JWT)

---

### 0.5 ✅ Update `.env.example` with placeholders

**Done:**
- Added `VITE_ANTHROPIC_API_KEY` (was missing)
- Added `VITE_GOOGLE_CLIENT_ID` (was missing)
- All vars now documented with source comments

---

## Phase 1 — ✅ Completed 2026-06-25

### 1.1 ✅ Remove blanket RLS policies on 25+ tables

**Migration:** `supabase/migrations/20260625000000_security_phase1_rls.sql`

**What changed:**
- Dropped all 28 `"Authenticated users" FOR ALL TO authenticated USING (true) WITH CHECK (true)` policies
- `profiles` — admin/manager: ALL, user: SELECT + UPDATE own
- `clients` (has csm_id) — admin/manager: ALL, csm: SELECT own, analyst: SELECT
- `onboardings` (has csm_id + client_id) — same pattern
- 9 tables with `client_id` — admin/manager: ALL, csm: SELECT (via subquery), analyst: SELECT
- 13 reference tables — admin/manager: ALL, authenticated: SELECT
- 3 onboarding-related tables — admin/manager: ALL, authenticated: SELECT

---

### 1.2 ✅ Revoke `GRANT ALL TO anon` from most tables

**Same migration:** `supabase/migrations/20260625000000_security_phase1_rls.sql`

**Revoked from 39 tables** + removed anon from `ALTER DEFAULT PRIVILEGES`.

**Kept (4 tables):** `access_requests`, `profiles`, `client_reports`, `report_views`.

---

### 1.3 ✅ Fix error leakage in 6 Edge Functions

| Function | File | Fix |
|----------|------|-----|
| `brief-public` | `index.ts:317` | `e.message` → `'Erro interno'` |
| `create-user` | `index.ts:96` | `String(err)` → `'Internal server error'` |
| `health-recalc` | `index.ts:539,546` | `String(err)` → `'Internal error'` / `'Internal server error'` |
| `invite-user` | `index.ts:97` | `String(err)` → `'Internal server error'` |
| `monthly-sync` | `index.ts:234,276,286,301,313,319` | All `String(err)` → `'Internal error'` / `'Internal server error'` |
| `operational-report-sync` | `index.ts:119` | `msg` → `'Internal server error'` |

`send-email` and `donkie-chat` were already fixed in Phase 0.

---

### 1.4 ✅ Restrict CORS in `brief-public`

BEFORE: `'Access-Control-Allow-Origin': '*'`
AFTER: Uses `createCorsHeaders(origin)` from `_shared/auth.ts` (whitelist: Vercel prod, Vercel preview, localhost)

`donkie-chat` already used `createCorsHeaders` from Phase 0.

---

### 1.5 ✅ Fix open redirect in `google-calendar-callback`

Added `isValidOrigin()` validation. `frontendOrigin` from `state` param is validated against whitelist before redirect. Invalid origins fall back to `FRONTEND_BASE`.

---

### 1.6 ✅ Restrict `linkedActivity.table` in `google-calendar-event`

BEFORE: `body.linkedActivity.table` used directly in `.from()` call.
AFTER: Filtered through `safeLinkedActivity` — only `['activities', 'onboarding_activities']` allowed.

---

## Phase 2 — ✅ Completed 2026-06-25

### 2.1 ✅ Implement rate limiting

Added shared `createRateLimiter(windowMs, maxReqs)` to `_shared/auth.ts` (in-memory Map pattern from donkie-chat).

| Function | Limit | Key |
|----------|-------|-----|
| `send-email` | 30 req/min | per user (caller ID) |
| `create-user` | 5 req/min | per IP (`x-forwarded-for`) |
| `invite-user` | 20 req/min | per admin (caller ID) |
| `freshdesk-proxy` | 30 req/min | per user (JWT user ID) |
| `donkie-chat` | 10 req/min | per user (done Phase 0) |

---

### 2.2 ✅ Completed 2026-06-25 — Zod input validation

Added `zod@3` from esm.sh to 3 Edge Functions:

| Function | Schema | Validates |
|----------|--------|-----------|
| `donkie-chat` | Messages + system | `messages` array (role enum, content 1-50k), `system` (max 5k) |
| `send-email` | Full request body | `template_id` (string), `recipients` (1-100, email+variables), `sent_by` (uuid), `attachments` (0-10) |
| `brief-public` | Discriminated union (9 actions) | `token`, `email`, action-specific `payload` per action; replaces 3 manual validation blocks |

Error responses sanitized — returns `{ error: 'Invalid request body' }` without schema details.

---

### 2.3 ✅ Fix `brief-public` path traversal

`get_attachment_urls` action: each `path` validated with `path.startsWith(\`${instance.id}/\`)` before creating signed URL. Rejects with 403 if scoped outside the brief.

---

### 2.4 ✅ Harden SECURITY DEFINER functions

- `check_marco_evidence` — added `SET search_path = public` (was missing)
- `create_default_fases` — added `SET search_path = public` (was missing)
- `check_report_access` — already had search_path, verified
- `handle_new_user` — already had search_path, verified
- `register_report_view` — already had search_path, verified

All are trigger/callback functions that legitimately need SECURITY DEFINER (bypass RLS for anon callers). No change to INVOKER.

---

### 2.5 ✅ Fix specific permissive RLS policies

| Table | Fix |
|-------|-----|
| `email_logs` | `authenticated_read_logs` → admin/manager only |
| `ai_model_logs` | `Allow insert ai_model_logs` → admin only |
| `milestones` | `milestones_all_service` → fixed to `FOR ALL TO service_role` |
| `brief_csm_notes` | `brief_csm_notes_select` → `is_visible = true OR created_by = auth.uid()` (admin/manager see all) |
| `freshdesk_config` | `freshdesk_config_select` → admin/manager only |
| `client_donc_instances` | `authenticated read instances` → admin/manager only |

---

### 2.6 ✅ Done (pre-existing)

`client_secret_*.json` already in `.gitignore`, not tracked in git history.

---

## Phase 3 — ✅ Completed 2026-06-25

### 3.1 ✅ RLS automated test suite

Created `supabase/tests/rls_policies.sql` with **9 assertion-style tests**:

| # | Test | What it checks |
|---|------|----------------|
| 1 | Tables without RLS enabled | Ensures every `public` table has `relrowsecurity = true` |
| 2 | Tables without any policy | Ensures every table with data has ≥1 policy |
| 3 | profiles policies | 3 policies exist (admin_all, read_own, update_own) |
| 4 | clients policies | 3 policies exist (admin_all, csm_select, analyst_select) |
| 5 | Reference table pattern | All 14 reference tables have their `admin_all` policy |
| 6 | Phase 2.5 specific fixes | Verifies all 6 corrected policies (email_logs, ai_model_logs, milestones, brief_csm_notes, freshdesk_config, client_donc_instances) AND old policy names are gone |
| 7 | SECURITY DEFINER functions | `check_marco_evidence` and `create_default_fases` have explicit `search_path=public` |
| 8 | anon grants | Anon INSERT grant limited to ≤4 tables (access_requests, profiles, client_reports, report_views) |
| 9 | Blanket policies | Zero `"Authenticated users"` policies remain |

**How to run:**
```bash
psql $DATABASE_URL -f supabase/tests/rls_policies.sql
```

All tests print `PASS` or `FAIL` — they do not throw, so every test runs and results are visible at once. Ends with a full policy inventory dump.

### 3.2 ✅ PR security review checklist

Created `.github/PULL_REQUEST_TEMPLATE.md` with a dedicated security section:

```markdown
## Security Checklist
- [ ] New Edge Function includes JWT/caller verification
- [ ] New table has RLS enabled and at least one policy
- [ ] No secrets or tokens in code (use `Deno.env.get`)
- [ ] CORS restricted to known origins (use `createCorsHeaders`)
- [ ] Error messages do not leak internals (`e.message` → generic)
- [ ] Input is validated (type, length, format)
```

The template also includes: description, type of change, and migration section. Every PR must go through this checklist before merge.

### 3.3 Quarterly credential rotation

**Schedule:** First week of Mar, Jun, Sep, Dec

| Credential | Scope | Rotation action | Notes |
|-----------|-------|----------------|-------|
| `ANTHROPIC_API_KEY` | Edge Function (donkie-chat) | Generate new key in Anthropic Console | Also update Edge Function env |
| `RESEND_API_KEY` | Edge Function (send-email) | Generate new key in Resend Dashboard | Also update Edge Function env |
| `FRESHDESK_API_KEY` | Edge Function (freshdesk-proxy) + scripts | Generate new key in Freshdesk Admin | Also update `.env.local` + Edge Function |
| `SUPABASE_SERVICE_ROLE_KEY` | Local scripts + Edge Functions | Rotate in Supabase Dashboard Settings | Update `.env.local` + all Edge Functions |
| `SUPABASE_ANON_KEY` | Frontend Vite env | Rotate in Supabase Dashboard | Update local `.env` + Vercel env |
| `JWT_SECRET` (if used for custom tokens) | Auth system | Regenerate in Supabase Dashboard | Invalidates existing sessions — schedule downtime |

**Procedure:**
1. Generate new key in source console
2. Update `supabase secrets set KEY_NAME=new_value` (Edge Functions)
3. Update `.env.local` (local dev)
4. Update Vercel env vars if different from Supabase secrets
5. Verify: run health-check or test call for each affected service
6. Revoke old key in source console after 24h monitoring period

**Verification commands:**
```bash
supabase functions serve --no-verify-jwt  # test locally
curl -X POST https://<project>.supabase.co/functions/v1/send-email -H "Authorization: Bearer $SERVICE_KEY"
```

### 3.4 ✅ Covered by 2.2 — Schema validation library

Zod validation implemented for 3 Edge Functions (`donkie-chat`, `send-email`, `brief-public`). See [2.2](#22-completed-2026-06-25--zod-input-validation).

---

## Summary

| Phase | Items | Est. Effort | Priority | Status |
|-------|-------|-------------|----------|--------|
| **0 — Today** | 5 items (rotate creds, scrub git, auth donkie-chat, fix send-email, .env.example) | 4-6 hours | 🔴 Critical | ✅ Completed 2026-06-24 |
| **1 — This week** | 6 items (RLS policies, GRANT anon, error leaks, CORS, open redirect, table whitelist) | 16-24 hours | 🟠 High | ✅ Completed 2026-06-25 |
| **2 — This month** | 6 items (rate limiting, zod validation, path traversal, SECURITY DEFINER, specific RLS fixes, scrub client_secret) | 24-40 hours | 🟡 Medium | ✅ Completed 2026-06-25 |
| **3 — Ongoing** | 4 items (RLS tests, PR checklist, quarterly rotation, schema validation library) | recurring | 🟢 Low | ✅ Completed 2026-06-25 |

**Total completed:** 44-70 hours (Phase 0 + 1 + 2 + 3). **Remaining:** Recurring rotation (3.3) per quarterly calendar.
