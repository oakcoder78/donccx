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
| `BriefResponsesModal` | `src/components/brief/BriefResponsesModal.jsx` | Hub CSM view: read responses, attachments, add/edit CSM notes, send to client |
| `BriefHeaderButton` | `src/pages/OnboardingDetailPage.jsx` | Header button: "Criar Brief" (navy) / "Editar Brief" (sky), equalized size |
| `BriefTemplateEditorModal` | `src/components/brief/BriefTemplateEditorModal.jsx` | Full editor modal: sections/questions CRUD, DnD sort, allow_attachment toggle |
| `BriefPanel` | `src/components/brief/BriefPanel.jsx` | Brief listing panel in onboarding tab |
| `BriefPublicPage` | `src/pages/BriefPublicPage.jsx` | Public page at `/brief/:token` with cover, form, attachments, tour |
| `brief-public` | `supabase/functions/brief-public/index.ts` | Edge function: validate, get, save_response, complete, submit_question, get_client_questions |
| `useBrief` | `src/hooks/useBrief.js` | Hook: briefInstances, createBrief, updateBriefStatus, copyPublicLink, useBriefCsmNotes (csmNotes, clientQuestions, replyToQuestion) |
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
| `brief_csm_notes` | CSM internal notes (`origin='csm'`) and client questions (`origin='client'`). Client questions include `client_email`, `client_name`, `csm_reply`, `replied_at`, `replied_by`. Index on `(instance_id, origin)`. |

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

Wide (max 1000px) two-column modal — Hub CSM view with internal notes layer:
- **Header:** eyebrow + title + status badge + "Copiar link" + "Enviar para cliente" + close
- **Segmented progress bar:** one segment per section, width ∝ question count; green=complete, sky gradient=partial
- **Left rail (240px):** section list with SVG circular progress rings (gray track, sky fill, green+✓ at 100%); active = sky border + shadow; **edit mode** via "Editar Brief" button
- **Right panel:** sticky section header (eyebrow, title, deliverable, callout if present); per-question cards:
  - hint box (sky, if `question.note`)
  - client response (read-only in view mode; editable textarea in edit mode, lime tinted)
  - attachments with signed URL download (edit mode: drag-drop upload zone)
  - CSM note area
- **CSM note area** per question (from `brief_csm_notes` where `question_id` matches):
  - Collapsed: ghost "+ Adicionar nota interna" button
  - Expanded: textarea + visibility pill toggle (`is_visible: false` → navy "Apenas interno" + `Icons.EyeOff`; `true` → lime "Visível ao cliente" + `Icons.Eye`) + Salvar/Cancelar
  - Saved note: box with left border (navy if visible, lime if internal), label + text + edit/remove buttons
- **Footer (view mode):** "Salvo automaticamente" dot + relative timestamp + Anterior/Próxima seção buttons
- **Footer (edit mode):** Salvar respuestas button → calls `update_response` action for each changed answer
- `useBriefCsmNotes(instance.id)` provides `csmNotes`, `upsertCsmNote({ id, question_id, note_text, is_visible })`, `deleteCsmNote`
- Attachments: signed URL generated via `supabase.storage.from('project-briefs').createSignedUrl(path, 3600)` on click
- Response field: `response_text` column (not `answer`)

### Public Side — BriefPublicPage (`/brief/:token`)

Public page without Supabase JWT. Email-authenticated access:

**Phase flow:** `auth → validating → cover → loading → form → thanks`

1. User enters email → `brief-public` (action `validate`) validates against `contacts.client_id` OR `profiles.email`
2. On success: shows **Cover Page** (visual intro) before loading the form
   - Cover data from `validate`: `client_name`, `client_logo_url` (public URL, company-logos bucket), `csm_name`, `operation_capabilities` (`[{name, color}]`), `sent_at` (falls back to `created_at`)
   - CoverPage: client logo as circle (100×100px fixed, `objectFit: cover`), capability badges with dynamic colors, formatted date, CSM name, "Iniciar preenchimento" button — navy/lime/sky palette
   - CoverInline: compact version (80×80px logo) for sidebar when `activeIdx === -1`
   - If session stored (page reload): cover skipped, goes straight to form
3. User clicks "Iniciar preenchimento" → calls `get` action, loads responses + attachments
4. Auto-save with 1500ms debounce per question (`save_response` action)
5. Status triggers: `sent → in_progress` only for contacts, **not** for internal Hub users
6. Sidebar shows section progress: empty (gray) / partial (sky) / done (lime) + "Apresentação" item when `activeIdx === -1`
7. **Deliverable** per section: left border `#d3da47`, lime background tint, "✓ Entregável:" prefix
8. **Question notes** (`question.note`): `Icons.HelpCircle` icon (sky, 15px) inline with label; CSS-only tooltip on hover (navy bg, max-width 280px)
9. **Tour modal** on first visit (sessionStorage key `brief_tour_seen_{instance_id}`): 4 steps — navigation, deliverable highlight, hint tooltips, autosave confirmation
10. **Attachment support:** drag-drop upload zone per question (when `allow_attachment: true`), file list with preview/download via signed URLs (`get_attachment_urls` action, 1h expiry), delete action
11. `complete` action locks form, marks as `completed`, creates activity (contacts only)
12. After completion: shows "thanks" screen

**`validate` action expanded payload:**
```json
{
  "contact_name": "...",
  "client_name": "...",              // fantasy_name || name
  "client_logo_url": "...",          // full public URL from company-logos bucket
  "csm_name": "...",                 // from profiles (created_by)
  "operation_capabilities": [{"name": "...", "color": "#59c2ed"}],
  "sent_at": "2026-05-...",         // sent_at with created_at fallback
  "instance": { "id", "title", "status", "sent_at", "structure_snapshot" }
}
```

### Settings Side — `/config/brief-templates`

Accessible to admin/manager only:
- Template list with cards: name, `operation_type` badge (catalog service name), section/question counts, rascunho/publicado badge, active toggle, Editar/Excluir buttons
- "Novo template" button opens `BriefTemplateEditorModal`
- **Editor modal** (`src/components/brief/BriefTemplateEditorModal.jsx`) — wide (max 1080px), two columns:
  - **Header:** eyebrow (FileQuestion icon + label), template name, rascunho/publicado badge, subtitle, close button
  - **Basics row:** name input (required) + operation_type select (fed from `catalog_items` where `type='servico'`, via `useCatalog` hook — not hardcoded)
  - **Left rail (260px):** sortable section list via `@dnd-kit/sortable`; each item shows index badge, title, question count; active item has sky border
  - **Right editor panel:** sticky section header (inline title input, question count, duplicate/remove buttons), deliverable inline input (sky tinted row), sortable question cards
  - **Question card controls:** select (Texto curto/Texto longo), pill toggles for Obrigatória (navy) and Anexo (sky), "+ Orientação" button expands note row (Info icon, sky dashed border); duplicate/remove buttons
  - **Add question dock:** dashed border, "+ Adicionar pergunta", quick-type shortcuts "Texto curto" / "Texto longo"
  - **Footer:** relative updated_at timestamp (left), Cancel / Salvar rascunho / Publicar template buttons (right)
- **Draft vs Publish:** "Salvar rascunho" → `is_active: false`; "Publicar template" → `is_active: true`
- DnD: sections (rail) and questions (editor) each have their own `DndContext` — reuses `@dnd-kit` already installed for `ReportEditorPage`

---

## Dependencies

- `supabaseClient` — database queries and storage
- `useBrief`, `useBriefTemplates`, `useBriefResponses` hooks
- `Icons` registry — `Icons.FileQuestion`, `Icons.Pencil`, `Icons.Paperclip`, `Icons.ClipboardList`, `Icons.Send`, `Icons.Trash2`, `Icons.GripVertical`, `Icons.Copy`, `Icons.Info`, `Icons.HelpCircle`, `Icons.Eye`, `Icons.EyeOff`, `Icons.GripVertical` (no direct lucide-react imports)
- `react-hot-toast` — feedback on save/upload/errors
- Storage bucket `project-briefs` with path prefix `brief-attachments/` (public bucket, signed URLs via service role)

### Supabase Migrations

| File | Description |
|------|-------------|
| `20260513000000_project_brief.sql` | Creates: `brief_templates`, `brief_instances`, `brief_responses`, `brief_attachments`, RLS policies, storage bucket `project-briefs` |
| `20260514000000_brief_fix_onboarding_fk.sql` | Renames `brief_instances.fase_id` → `onboarding_id`, adds FK to `onboardings`, drops old `fase_id` |
| `20260515000000_add_brief_templates_flag.sql` | Adds `is_active` flag to `brief_templates` |
| `20260516000000_fix_brief_attachments_schema.sql` | Adds `file_type text` and `uploaded_by uuid` to `brief_attachments` |
| `20260518000000_brief_csm_notes.sql` | Creates `brief_csm_notes` table (RLS, updated_at trigger) for internal CSM notes |
| `20260519000000_brief_csm_notes_question_id.sql` | Adds `question_id text` column to `brief_csm_notes` for per-question notes |
| `20260520000000_brief_csm_notes_client_questions.sql` | Extends `brief_csm_notes` with `origin`, `client_email`, `client_name`, `csm_reply`, `replied_at`, `replied_by`; index on `(instance_id, origin)` |

> **After deploy of `brief-public`:** disable "Verify JWT" in Dashboard → Edge Functions → brief-public → Settings.