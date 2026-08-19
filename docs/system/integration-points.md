# Integration Points

This document lists external integration points in the application, indicating where each integration occurs and which modules depend on it.

## Supabase

- **External system:** Supabase (PostgreSQL + Auth + Storage).
- **Purpose:** Primary database storing domain entities – clients, projects, activities, contacts and authentication‑related data.
- **Dependent modules:** Hooks such as `useClients`, `useProjects`, `useActivities`, `useContacts`, `useSegments` and `useStages`, which use the `supabaseClient` directly or via the `services` layer.
- **Communication location:** Centralized in the Supabase client defined at `src/lib/supabaseClient.js`. Hooks access this client directly or indirectly through the `services` layer.

---

## Freshdesk

- **External system:** Freshdesk – support and ticket‑management platform.
- **Purpose:** Sync ticket, group and contact data into `client_support` for monthly operational indicators and CS follow-up. Import is versioned and requires independent human approval for metrics vs contacts; ambiguous company identity blocks publication.
- **Dependent modules:** Operations Center `src/components/settings/SettingsFreshdesk.jsx` (Overview/Preflight/Mapping/Import/Review/History tabs) and review queue `src/pages/FreshdeskPendingPage.jsx`; canonical helpers `supabase/functions/_shared/freshdesk.ts`; client sync `src/lib/freshdeskSync.js` and config cache `src/lib/freshdeskConfig.js`; Edge Functions `freshdesk-proxy` (browser proxy) and `monthly-sync` (cron orchestrator).
- **Communication location:**
  - Browser → `POST /functions/v1/freshdesk-proxy` with `{ path, params }` + `Authorization: Bearer <JWT>` (`apikey: VITE_SUPABASE_ANON_KEY`); proxy validates `profiles.role` in `admin/manager/analyst`, rate-limits 30 req/min, forwards to `https://<FRESHDESK_DOMAIN>/api/v2` with `Basic <FRESHDESK_API_KEY>` and returns Freshdesk status + JSON.
  - Edge (cron) → direct `https://<FRESHDESK_DOMAIN>/api/v2` via `supabase/functions/_shared/freshdesk.ts:fdGet`.
  - Config cache → `freshdesk_config` keys `groups`, `agents`, `ticket_fields`, `last_sync`, `last_data_sync`, `freshdesk_canonical_enabled` (kill switch).
  - Persisted facts → `client_support` (`freshdesk_snapshot` + versioned columns).
- **Canonical executor:** `supabase/functions/_shared/freshdesk.ts` is the single source for ticket/SLA/group/contact rules: `withRetry` (2 retries, exponential backoff on 429/500/502/503/504/fetch failure), `fdGet`, `getGroupsMap` (resolves N1/N2/N3 by name regex), `fetchTicketsByCompany` (paginated `/tickets` with client-side `YYYY-MM` filter, up to 20 pages), `fetchContactsByCompany` (paginated `/contacts`, up to 10 pages), `processTicketsToSupport` (tickets_opened/resolved, avg `sla_first_response`, N1/N2/N3 counts), `isCanonicalEnabled` (reads `freshdesk_config.freshdesk_canonical_enabled`, default true). `src/lib/freshdeskSync.js` mirrors `fdGet`+`withRetry` for the proxy path; `supabase/functions/monthly-sync/index.ts` imports the shared helpers directly and checks the kill switch before execution.
- **Versioned import:** `supabase/migrations/20260819000000_freshdesk_phase3_versioned_import.sql` extends `client_support` with `run_id uuid` (idempotency per execution, `gen_random_uuid()`), `revision integer` (starts at 1, incremented only on reimport of a `published` month), `previous_snapshot jsonb` (preserves previous published row for rollback/comparison), `published_at timestamptz`, `metrics_status`/`contacts_status` (`pending|approved|published|rejected|error`, default `pending`), `source` (`freshdesk|manual|cron|n8n`). First import `revision=1`; reimport of a `published` month stores previous tickets/N1/N2/N3/`freshdesk_snapshot`/`published_at` in `previous_snapshot` and creates a new `pending` revision; reimport of a `pending` month overwrites in place. Backfill maps `pending=true → pending` else `published`. Indexes on `pending` (partial), `metrics_status`, `contacts_status`, `run_id`.
- **Retry & observability:** Browser and Edge both retry transient failures (429/5xx) with jittered backoff. `monthly-sync` logs per-client `run_id`/`revision` (`[freshdesk] client_id=… synced run_id=…`); canary `scripts/freshdesk-canary.js` compares `run_id`/`revision`/`metrics_status` per `ref_month` and validates `sync_log` + `audit_logs`.
- **Review & publication:** Pending queue is `client_support` where `pending=true` OR `metrics_status=pending` OR `contacts_status=pending` (RLS-scoped; service_role view via canary). `src/pages/FreshdeskPendingPage.jsx` separates metric comparison (`FIELDS`) from `new_contacts` with duplicate scoring (100 exact e-mail/`fd_id`, 60 name+domain, 0 otherwise), blocks `approve`/`merge` while unresolved groups remain, and publishes with `metrics_status`/`contacts_status=published` + `published_at` + `audit_logs` (`old_value`/`new_value`).
- **Mapping & identity:** Company mapping uses `clients.freshdesk_company_id` + `freshdesk_company_ids[]`; `computeSuggestion` scores `Nome exato` (100), `Domínio compatível` (90), `Nome parcialmente compatível` (70) with confidence `alta/média/baixa`. Multiple `freshdesk_company_ids` puts the client in `blocked` (requires classification via “Manter <id>”); suggestions require explicit Confirm/Reject/Defer. All mapping and approval actions audit to `audit_logs` (`freshdesk_mapping_saved`, `freshdesk_blocked_resolved`, `freshdesk_approved|merged|rejected`).

---

## Donc API

- **External system:** External API of the Donc platform, used for integration with partner systems.
- **Purpose:** Enable communication with external services related to operations, such as data synchronization or external information lookup.
- **Dependent modules:** Components and hooks that need to access external data configured through the Settings module.
- **Communication location:** Implemented via utility functions in the `lib` layer, configured through the Settings module and used by hooks or components that depend on external data.

---

## n8n (Operational Reports)

- **External system:** n8n — workflow automation platform.
- **Purpose:** Receive monthly operational data synced from DONC webhub (OS, problemas, produtividade) and upsert into `client_operational_reports`.
- **Dependent modules:** Edge Function `operational-report-sync` decodes the payload, resolves `client_id` via `client_donc_instances.contrato_saas_id`, and upserts into `client_operational_reports`.
- **Communication location:** POST → `https://etfeqblaeuhaobefxilp.supabase.co/functions/v1/operational-report-sync` with header `x-webhook-secret: <SYNC_WEBHOOK_SECRET>` (dedicated webhook secret; the service_role key is no longer accepted). Body: `{ saas_id, period, data_os, data_problemas, data_produtividade }`.
- **Identity rule:** `saas_id` is an external contract identifier, never a `clients.id`. Resolution must return exactly one `client_donc_instances` row; missing or ambiguous mappings are rejected instead of selecting an arbitrary row.
- **Legacy reconciliation:** `client_id_reconciliation` tracks historical rows created from SaaS IDs and their canonical CRM client. Legacy rows remain preserved until their dependent data is reviewed and migrated.
- **Migration:** `20260528000000_client_operational_reports.sql`
- **Reconciliation migration:** `20260816210000_reconcile_legacy_saas_client_ids.sql`

---

## OpenRouter (Donkie)

- **External system:** OpenRouter – AI service providing language models (ChatGPT, Claude, etc.).
- **Purpose:** Power assisted features, text generation and intelligent automation within the application.
- **Dependent modules:** The *Donkie* sub‑module (`src/donkie/`) contains wrappers that call the OpenRouter API; some *services* that need AI responses and *hooks* that manage the call state.
- **Communication location:** Implemented in `src/lib/openrouterService.js` (or similar) inside the *Donkie* layer; AI services import this client.
- **Fallback behavior:** If a model returns HTTP 200 with non‑JSON content (e.g., HTML error page, empty body), or an empty `content` field (string `''`), the proxy automatically tries the next configured model. The frontend also retries up to 3 attempts total across all models before showing an error.
- **JSON extraction:** The frontend uses a multi‑strategy `extractJSON()` helper to handle non‑standard AI responses — markdown code blocks with preamble text, embedded JSON in larger text, and schema validation after parse.

---

## File Storage (Attachments)

- **External system:** Supabase Storage (or configured bucket for file storage).
- **Purpose:** Store files attached to activities, such as documents, images and operational evidence.
- **Dependent modules:** Services located in `src/services/activityAttachments/`, used by hooks and components responsible for displaying, creating or removing activity attachments.
- **Communication location:** Implemented through the `services/activityAttachments/` layer, which uses the `supabaseClient` to upload, download and delete stored files.

---

**Summary:** External integrations are centralized in the `lib`, `services` and `hooks` layers, with global configurations stored in *settings*. Each integration point has a clear purpose and provides data or functionality consumed by various parts of the application, ensuring a coherent and decoupled data flow.
