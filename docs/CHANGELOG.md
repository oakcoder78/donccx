# Changelog

## 2026-05-14

### Google Calendar Sync
- **Fix:** `useGoogleCalendarStatus` uses `.maybeSingle()` to avoid crash when no `user_google_configs` row exists (PGRST116 error handled gracefully — returns `connected: false`)
- **Fix:** `ActivityModal` only syncs on relevant field changes — `shouldSyncWithCalendar()` checks `type === 'reuniao'` + changed `title | activity_date | activity_time`; guard `if (!isGoogleConnected) return`
- **Fix:** `ActivityDetailModal` `handleSyncToGoogleCalendar` guarded with `if (!isConnected) return`
- **Fix:** `isExpired` removed from hook return (unused)
- **Fix:** `Icons.Calendar` replaces direct lucide-react import in `ActivityDetailModal`

### Brief Discovery Module
- **Feature:** `BriefTemplateEditorModal` redesign — modal 1080px, 2 columns, sortable sections/questions via `@dnd-kit`, pill toggles for "Obrigatória" / "Anexo", expandable note row, add-question dock with quick-type shortcuts
- **Feature:** `BriefResponsesModal` redesign — 1000px 2-column, SVG progress rings, segmented bar, per-question CSM notes with `is_visible` toggle (navy/lime), edit mode for responses and attachments
- **Feature:** `BriefHeaderButton` added to project header — "Criar Brief" (navy) / "Editar Brief" (sky); button sizes equalized via `minWidth: 110`
- **Feature:** Visual cover page — client logo (100×100 circle), capability badges with dynamic colors, formatted date, CSM name, "Iniciar preenchimento" CTA; inline variant (80×80) for sidebar
- **Feature:** Question-level attachments — `allow_attachment` toggle in template editor; drag-drop upload/delete on public page; signed URL preview (1h expiry via `get_attachment_urls` action)
- **Feature:** `brief_csm_notes` table with per-question `question_id` — CSM internal notes (optionally visible to client via `is_visible` toggle)
- **Feature:** Question `note` field with `Icons.HelpCircle` and CSS-only tooltip
- **Feature:** Tour modal (4 steps, sessionStorage flag per instance)
- **Feature:** `operation_type` in template editor fed from `catalog_items` where `type='servico'` via `useCatalog` hook — no longer hardcoded
- **Feature:** Allow Hub users (internal profiles) to access brief via email link
- **Fix:** Cover logo circular with fixed 100×100 (CoverPage) / 80×80 (CoverInline) dimensions, `objectFit: cover`
- **Fix:** `brief-public` edge always returns client name/logo regardless of Hub user access level
- **Fix:** Capabilities colored by `catalog_items.color`; `sent_at` with `created_at` fallback; date formatted as "Mês de Ano"
- **Fix:** `brief_attachments` schema — `file_type text` + `uploaded_by uuid` columns added via migration

### Email Module
- **Feature:** `from_mode` field — CSM personal email or `noreply@donc.com.br`; admin/manager can override sender
- **Feature:** `reply_to` field in template schema; `suporte@donc.com.br` set on every send via Resend API parameter
- **Feature:** `csm_email` template variable

## 2026-05-13

*(See `docs/modules/brief.md` and `docs/modules/email.md` for full module history)*

## Migration Index

| Migration | Description |
|-----------|-------------|
| `20260513000000_project_brief.sql` | Creates brief module tables and storage bucket `project-briefs` |
| `20260514000000_brief_fix_onboarding_fk.sql` | `fase_id` → `onboarding_id` rename + FK |
| `20260515000000_add_brief_templates_flag.sql` | Adds `is_active` to `brief_templates` |
| `20260516000000_fix_brief_attachments_schema.sql` | `file_type` + `uploaded_by` on `brief_attachments` |
| `20260518000000_brief_csm_notes.sql` | Creates `brief_csm_notes` table |
| `20260519000000_brief_csm_notes_question_id.sql` | `question_id` column on `brief_csm_notes` |
| `20260512120000_user_google_configs.sql` | Google Calendar OAuth tokens table |