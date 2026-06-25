# Test Plan — Security Remediation Phases 0-3

## Prerequisites

```bash
npm run dev           # Frontend dev server (local)
# Supabase is production-only — no local stack.
# Edge Functions tested via curl against production URL.
```

## 1. Build verification

- [ ] `npm run build` succeeds (no TS/import errors)
- [ ] `supabase functions deploy` succeeds for all 12 functions (prod only)

## 2. RLS — Role-based access (Phase 1.1)

Test each role against key tables. Use Supabase SQL editor or `psql` with different service keys.

**Admin role:**
- [ ] Can SELECT/INSERT/UPDATE/DELETE on `profiles`, `clients`, `onboardings`, `activities`
- [ ] Can SELECT/INSERT/UPDATE/DELETE on reference tables (`catalog_items`, `segments`, etc.)

**Manager role:**
- [ ] Same as admin for all CRUD operations

**CSM role:**
- [ ] Can SELECT own client rows (`csm_id = auth.uid()`) in `clients`, `onboardings`, `activities`
- [ ] Cannot SELECT rows belonging to another CSM's clients
- [ ] Cannot INSERT/UPDATE/DELETE on any client table (SELECT only)

**Analyst role:**
- [ ] Can SELECT all rows in client tables
- [ ] Cannot INSERT/UPDATE/DELETE on any table

## 3. RLS — Specific policy fixes (Phase 2.5)

- [ ] `email_logs`: only admin/manager can SELECT (CSM/analyst get empty set)
- [ ] `ai_model_logs`: only admin can INSERT (manager/CSM/analyst get 403)
- [ ] `milestones`: service_role can access; authenticated users cannot
- [ ] `brief_csm_notes`: CSM sees only `is_visible = true` OR own notes; admin/manager see all
- [ ] `freshdesk_config`: only admin/manager can SELECT
- [ ] `client_donc_instances`: only admin/manager can SELECT

## 4. Edge Functions — Input validation (Phase 2.2)

**donkie-chat:**
- [ ] Valid request with `messages[{role, content}]` returns 200
- [ ] Empty `messages` array returns 400
- [ ] `role` other than user/assistant/function returns 400
- [ ] `content` > 50000 chars returns 400
- [ ] `system` > 5000 chars returns 400

**send-email:**
- [ ] Valid request (template_id + recipients + sent_by UUID) returns 200
- [ ] Invalid `sent_by` (not a UUID) returns 400
- [ ] Empty `recipients` array returns 400
- [ ] Recipient without `email` field returns 400
- [ ] More than 100 recipients returns 400
- [ ] More than 10 attachments returns 400

**brief-public:**
- [ ] Missing `token` returns 400
- [ ] Invalid `action` value returns 400
- [ ] `submit_question` without `note` returns 400
- [ ] `save_response` without `response_text` returns 400
- [ ] `upload_attachment` with `file_size` > 10MB returns 400
- [ ] `delete_attachment` without `attachment_id` returns 400
- [ ] `get_attachment_urls` with empty `paths` array returns 400

## 5. Edge Functions — Rate limiting (Phase 2.1)

- [ ] `donkie-chat`: 11 requests in 60s → request 11 returns 429
- [ ] `send-email`: 31 requests in 60s → request 31 returns 429
- [ ] `create-user`: 6 requests in 60s → request 6 returns 429
- [ ] `invite-user`: 21 requests in 60s → request 21 returns 429
- [ ] `freshdesk-proxy`: 31 requests in 60s → request 31 returns 429

Wait 60s, verify normal requests resume.

## 6. Edge Functions — Error leakage (Phase 1.3)

- [ ] `brief-public`: trigger internal error → response body has `Erro interno` (no stack trace)
- [ ] `create-user`: trigger internal error → response body has `Internal server error`
- [ ] `invite-user`: trigger internal error → response body has `Internal server error`
- [ ] `health-recalc`: trigger internal error → response body has `Internal error`
- [ ] `monthly-sync`: trigger internal error → response body has `Internal error`
- [ ] `operational-report-sync`: trigger internal error → response body has `Internal server error`

## 7. Edge Functions — CORS (Phase 1.4)

- [ ] `brief-public`: request from unknown origin → `Access-Control-Allow-Origin` is NOT `*`
- [ ] `brief-public`: request from Vercel production URL → CORS header matches origin
- [ ] `brief-public`: request without Origin header → no CORS error

## 8. Migration verification

- [ ] `supabase migration list` shows both new migrations
- [ ] `supabase db diff` produces no unexpected changes
- [ ] Run `psql $DATABASE_URL -f supabase/tests/rls_policies.sql` — all 9 tests PASS

## 9. Frontend smoke test

- [ ] Login page loads and accepts credentials
- [ ] Dashboard loads without 403/500 errors
- [ ] Client list shows correct role-based data
- [ ] Onboarding flow works (create, view phases, upload evidence)
- [ ] Email logs page accessible only by admin/manager
- [ ] Freshdesk page accessible only by admin/manager
- [ ] Donkie chat works (send message, receive response)
- [ ] Brief/public client flow: token entry → view questions → submit question → upload attachment

## Notes

- All tests run directly against production (https://donccx-donccx.vercel.app) — no local Supabase
- RLS tests depend on having users with each role in the database
- Rate limiting tests require serial requests — use curl in a loop, not browser
- Edge Function validation tests use curl against production URL with valid bearer token
