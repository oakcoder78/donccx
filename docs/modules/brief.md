# Brief Discovery Module

## Purpose

Questionnaire linked to an onboarding. CSM creates an instance from a JSONB template, generates a public link, and sends it to the client. The client fills it in via email-authenticated link. Responses are stored and visible to the CSM inside `OnboardingDetailPage`.

---

## Responsibilities

- Manage brief templates (create, edit, activate/inactivate, delete) via Settings
- Create brief instances linked to an onboarding
- Generate and share public access links
- Allow clients to fill responses via `/brief/{token}`
- Allow Hub users (profiles) to access and edit responses
- Support file attachments per question
- Track lifecycle: `draft → sent → in_progress → completed / archived`
- Display brief status and responses in `OnboardingDetailPage`

---

## Key Components

| Component | File | Responsibility |
|-----------|------|----------------|
| `BriefCreateModal` | `src/components/brief/BriefCreateModal.jsx` | Create instance: template selection, title, save |
| `BriefResponsesModal` | `src/components/brief/BriefResponsesModal.jsx` | View/edit responses, attachments, send to client |
| `BriefHeaderButton` | `src/pages/OnboardingDetailPage.jsx` | Header button: "Criar Brief" (navy) / "Editar Brief" (sky) |
| `BriefPanel` | `src/components/brief/BriefPanel.jsx` | Brief listing panel in onboarding tab |
| `BriefPublicPage` | `src/pages/BriefPublicPage.jsx` | Public page at `/brief/:token` |
| `brief-public` | `supabase/functions/brief-public/index.ts` | Edge function: validate, get, save_response, complete |
| `useBrief` | `src/hooks/useBrief.js` | Hook: briefInstances, createBrief, updateBriefStatus, copyPublicLink |
| `useBriefTemplates` | `src/hooks/useBriefTemplates.js` | Hook: CRUD for templates |
| `useBriefResponses` | `src/hooks/useBriefResponses.js` | Hook: responses and attachments for an instance |
| `SettingsBriefTemplates` | `src/components/settings/SettingsBriefTemplates.jsx` | Settings page: `/config/brief-templates` |

---

## Data Interaction

| Table | Role |
|-------|------|
| `brief_templates` | Catalog of JSONB templates by operation_type |
| `brief_instances` | One per onboarding. FK: `client_id → clients`, `onboarding_id → onboardings` |
| `brief_responses` | One row per question (`question_id` from JSONB). Upsert on conflict |
| `brief_attachments` | Optional files per question or general. Storage bucket `activity-attachments`, path: `brief-attachments/{instance_id}/{question_id}/{filename}` |

Edge function uses `SUPABASE_SERVICE_ROLE_KEY`. `verify_jwt = false` (configured in `supabase/config.toml` and verified in Dashboard).

### Template JSONB Schema

```json
{
  "sections": [
    {
      "id": "string",
      "order": 1,
      "title": "Section name",
      "deliverable": "What will be delivered in this section",
      "callout": "Special notice or note (optional)",
      "audience": "Who this section is intended for",
      "questions": [
        {
          "id": "q1",
          "order": 1,
          "text": "Question text",
          "type": "text | textarea | select | multiselect | date | boolean",
          "required": true,
          "note": "Help text for the respondent (optional)",
          "allow_attachment": false
        }
      ]
    }
  ]
}
```

`structure_snapshot` in `brief_instances` is a frozen copy of the template at creation time — preserves the brief content even if the template is later edited or deleted.

---

## UI Behavior

### Hub Side — OnboardingDetailPage Header

`BriefHeaderButton` in the project header:
- **No instance exists:** Button "Criar Brief" — navy background (`#173557`), white text, `Icons.FileQuestion` icon
- **Instance exists:** Button "Editar Brief" — sky background (`#0a6a96`), white text, `Icons.Pencil` icon
- Both buttons have `minWidth: 110` to match the "Editar projeto" button size
- Admin users see delete icon (`Icons.Trash2` in `S.iconBtn` style, red `#c44`) next to "Editar projeto"
- Clicking "Criar Brief" opens `BriefCreateModal` (template selector)
- Clicking "Editar Brief" opens `BriefResponsesModal`

### BriefResponsesModal

Editable modal with:
- Per-question `<textarea>` with auto-save on `onBlur`
- "Salvando..." indicator during save
- Per-question attachment upload (`Icons.Paperclip` label triggering `<input type="file">`)
- Per-question attachment removal
- "Copiar link" button — copies `/brief/{access_token}` to clipboard
- "Enviar para cliente" button — marks instance as `sent`, copies link (only visible when status is `draft` or `in_progress`)

### Public Side — BriefPublicPage (`/brief/:token`)

Public page without Supabase JWT. Email-authenticated access:

**Phase flow:** `auth → validating → cover → loading → form → thanks`

1. User enters email → `brief-public` (action `validate`) validates against `contacts.client_id` OR `profiles.email`
2. On success: shows **Cover Page** (visual intro) before loading the form
   - Cover data comes from `validate` response: `client_name`, `client_logo_url`, `csm_name`, `operation_capabilities`, `sent_at`
   - If session already stored (page reload): cover is skipped, goes straight to form
3. User clicks "Iniciar preenchimento" → calls `get` action, loads responses + attachments
4. Auto-save with 1500ms debounce per question (`save_response` action)
5. Status triggers: `sent → in_progress` only for contacts, **not** for internal Hub users
6. Sidebar shows section progress: empty (gray) / partial (sky) / done (lime)
7. **Deliverable** per section is highlighted: left border `#d3da47`, lime background tint, "✓ Entregável:" prefix
8. **Question notes** (`question.note`): show `IcoHelpCircle` icon (sky, 15px) inline with question label; hover → CSS tooltip (navy bg, max-width 280px)
9. **Tour modal** shown on first visit after `get` loads (sessionStorage key `brief_tour_seen_{instance_id}`): 4 steps explaining nav, deliverable, hints, autosave
10. `complete` action locks form, marks as `completed`, creates activity (contacts only)
11. After completion: shows "thanks" screen

**`validate` action expanded payload:**
```json
{
  "contact_name": "...",
  "client_name": "...",         // fantasy_name || name
  "client_logo_url": "...",     // full public URL from company-logos bucket
  "csm_name": "...",            // from profiles (created_by)
  "operation_capabilities": [], // from onboarding_capabilities → catalog_items.name
  "instance": { "id", "title", "status", "sent_at", "structure_snapshot" }
}
```

### Settings Side — `/config/brief-templates`

Accessible to admin/manager only:
- Template list with cards: name, operation_type badge, section/question counts, active/inactive toggle
- "Novo Template" button opens editor modal
- Edit and delete buttons per template
- Editor modal: name (required), operation_type select, section builder (title, deliverable, callout, audience), question builder per section (text, type, required, allow_attachment)
- Preview of questions per section

---

## Dependencies

- `supabaseClient` — database queries and storage
- `useBrief`, `useBriefTemplates`, `useBriefResponses` hooks
- `Icons` registry — `Icons.FileQuestion`, `Icons.Pencil`, `Icons.Paperclip`, `Icons.ClipboardList`, `Icons.Send`, `Icons.Trash2` (no direct lucide-react imports)
- `react-hot-toast` — feedback on save/upload/errors
- Storage bucket `activity-attachments` with path prefix `brief-attachments/`
- Edge function `brief-public` deployed with `verify_jwt = false`

### Supabase Migrations

| File | Description |
|------|-------------|
| `20260513000000_project_brief.sql` | Creates: `brief_templates`, `brief_instances`, `brief_responses`, `brief_attachments`, RLS policies, storage bucket `project-briefs` |
| `20260514000000_brief_fix_onboarding_fk.sql` | Renames `brief_instances.fase_id` → `onboarding_id`, adds FK to `onboardings`, drops old `fase_id` |
| `20260515000000_add_brief_templates_flag.sql` | Adds `is_active` flag to `brief_templates` |

> **After deploy of `brief-public`:** disable "Verify JWT" in Dashboard → Edge Functions → brief-public → Settings.