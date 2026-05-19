# Changelog

## 2026-05-18

### Refactoring — Fase 1 (Cleanup & Quick Wins)
- **Path Alias:** Added `@/` alias in `vite.config.js` + `jsconfig.json` — migrated 55 files from deep relative imports (`../../../../lib/icons`) to absolute (`@/lib/icons`)
- **Dead files:** Deleted empty migration `20260503032657_test_post_baseline.sql`
- **Dead files:** Deleted greeting-engine wrapper files (`identity.ts`, `temporal.ts`, `operational.ts`) — `compose.ts` now imports directly from `content/*`
- **Console.logs:** Removed 12 debug `console.log` statements from production code (`compose.ts`, `ActivityDetailModal.jsx`, `SettingsFreshdesk.jsx`, `SettingsDoncAPI.jsx`)
- **Build:** Verified clean build after all changes

## 2026-05-16

### Email Module
- **Feature:** WYSIWYG editor (`EmailEditor`) replaces textarea — TipTap v2 with Bold, Italic, Underline, H1-H3, lists, alignment, link, remove formatting toolbar
- **Feature:** ✨ Reescrever button in editor toolbar — calls `openrouter-proxy` with configurable prompt (`email_rewrite_prompt` in `freshdesk_config`)
- **Fix:** Email templates `<p>{{corpo_mensagem}}</p>` → `<div>` to avoid nested `<p>`
- **Fix:** `supabase/config.toml` — `[functions.openrouter-proxy] verify_jwt = false` (fixes error 546)
- **Dependency:** Added `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-underline`, `@tiptap/extension-link`, `@tiptap/extension-text-align`

### Settings
- **Refactor:** `SettingsDonkie.jsx` deleted — Donkie configuration consolidated into `SettingsAI.jsx` (4 sections: Models+Debug, WhatsApp Prompt, Donkie, Email)
- **Refactor:** Menu "Donkie" + "IA" merged into single "Donkie IA" entry gated by `ai` feature flag

## 2026-05-15

### Email Module
- **Feature:** Email attachments — upload to `activity-attachments` bucket, edge downloads+base64, sends via Resend, persisted as `activity_attachments` records (visible in ActivityDetailModal, ClientSubAnexos, ClientTabActivities)
- **Refactor:** EmailComposerModal redesigned — single-screen composer with chips "Para:" input (Gmail-style), company swap icon (`RefreshCw`), preview opens optional Modal (not a required step)
- **Fix:** Domain validation — CSM sender requires `@donc.com.br`, radio button disabled + warning shown, edge function returns 400 on invalid domain
- **Fix:** Storage download URL corrected — bucket name `activity-attachments` added to download path
- **Feature:** Email button in ClientTabContatos replaces `mailto:` link — opens composer with preselected contact and company

### Brief Module
- **Feature:** Delete questionnaire — `Trash2` icon per card with response count warning, confirmation dialog, audit log entry (`action='deleted', entity_type='questionnaire'`)

### Client Usage
- **Feature:** Per-row toggle for OS type chips — `Eye`/`EyeOff` icon per month in actions column, independent expand/collapse via `Set`

## 2026-05-14

### Brief Discovery Module
- **Feature:** Header button renamed from "Brief" / "Editar Brief" to **"Questionários"** — opens `BriefPanelModal` containing `BriefPanel`
- **Feature:** `BriefPanel` — modal listing all brief instances per onboarding, supports multiple briefs per project
- **Feature:** `BriefViewsModal` — shows who viewed each brief (email, viewed_at, resolved contact name via `contact_links`)
- **Feature:** Export MD — "Exportar MD" button in `BriefResponsesModal` header downloads responses as formatted Markdown
- **Feature:** Badge on "Questionários" button shows count of unanswered client questions across all briefs for the onboarding
- **Fix:** Back button navigation from project details properly returns to onboarding cover

### Clients / Contacts
- **Feature:** ClientTabContatos now shows badges and action buttons per contact (edit, delete, send email)
- **Feature:** Contact list uses CSS grid with 3 fixed columns, vertical action alignment with self-center
- **Feature:** Contact drawer enlarged for better UX

### Email Module
- **Feature:** `EmailComposerModal` integrated into ContactPanel — "Enviar e-mail" button per contact in ClientTabContatos

### Settings
- **Fix:** Manager role now allowed to edit settings components (previously admin-only)

### Google Calendar Sync
- **Fix:** `useGoogleCalendarStatus` uses `.maybeSingle()` to avoid crash when no `user_google_configs` row exists (PGRST116 error handled gracefully — returns `connected: false`)
- **Fix:** `ActivityModal` only syncs on relevant field changes — `shouldSyncWithCalendar()` checks `type === 'reuniao'` + changed `title | activity_date | activity_time`; guard `if (!isGoogleConnected) return`
- **Fix:** `ActivityDetailModal` `handleSyncToGoogleCalendar` guarded with `if (!isConnected) return`
- **Fix:** `isExpired` removed from hook return (unused)
- **Fix:** `Icons.Calendar` replaces direct lucide-react import in `ActivityDetailModal`

### Projects
- **Refactor:** Simplified `ProjectModal` — removed redundant fields for onboarding/expansao projects (kickoff_date, start_date, end_date are now managed via onboarding detail page; removed `FASE_LABELS` import and `useOnboardingConfig` dependency)
- **Fix:** Restored missing mutation hooks in `ProjectModal` — `useCreateOnboardingFlow`, `useUpdateOnboardingFlow`, `useCreateInternalProject`, `useUpdateProject` were missing after refactor

## 2026-05-13

*(See `docs/modules/brief.md` and `docs/modules/email.md` for full module history)*

## Migration Index

| Migration | Description |
|-----------|-------------|
| `20260522000000_brief_views.sql` | Creates `brief_views` table for tracking who viewed each brief |
| `20260521000000_brief_csm_notes_allow_reply_to_client_questions.sql` | Broadens RLS to allow CSM reply on client questions |
| `20260520000000_brief_csm_notes_client_questions.sql` | Adds `origin`, `client_email`, `client_name`, `csm_reply`, `replied_at`, `replied_by` to `brief_csm_notes` |
| `20260519000000_brief_csm_notes_question_id.sql` | Adds `question_id` column to `brief_csm_notes` for per-question notes |
| `20260518000000_brief_csm_notes.sql` | Creates `brief_csm_notes` table for CSM internal notes |
| `20260517000000_fix_brief_attachments_schema.sql` | `file_type` + `uploaded_by` columns on `brief_attachments` |
| `20260516000000_fix_email_module.sql` | Adds `from_mode` column to `email_logs` (`csm` or `noreply`) |
| `20260515000000_add_brief_templates_flag.sql` | Adds `is_active` flag to `brief_templates` |
| `20260514000000_brief_fix_onboarding_fk.sql` | Renames `brief_instances.fase_id` to `onboarding_id` + adds FK |
| `20260513000000_project_brief.sql` | Creates brief module tables and storage bucket `project-briefs` |
| `20260512120000_user_google_configs.sql` | Creates `user_google_configs` table for Google Calendar OAuth tokens |
| `20260512000000_add_email_templates_feature_flag.sql` | Adds `email_templates` feature flag (enabled for admin/manager) |
| `20260511120000_fix_email_template_signature.sql` | Resizes signature columns to 60%/20%/20%; fixes font sizes |
| `20260511000000_email_module.sql` | Creates `email_templates` and `email_logs` tables; adds `cargo` to profiles; seeds templates |
| `20260509000000_add_allows_attachments.sql` | Adds `allows_attachments` column to `onboarding_fase_types` and `onboarding_fases`; updates `create_default_fases` function |
| `20260508120000_trigger_situacao_geral_on_fases.sql` | Creates trigger to recalculate `situacao_geral` on fase status/planned_end changes |
| `20260508000000_profiles_birth_date.sql` | Adds `birth_date` column to `profiles` table |
| `20260506000101_add_monthly_sync_cron.sql` | Adds monthly sync cron job |
| `20260505115123_add_health_snapshot_column.sql` | Adds `health_snapshot` column to `client_usage` table |