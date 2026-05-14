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
- **Left rail (240px):** section list with SVG circular progress rings (gray track, sky fill, green+✓ at 100%); active = sky border + shadow; below sections: separator + **"Dúvidas" item** (`Icons.MessageCircle`, sky ring bg when active) with red badge counting unanswered `clientQuestions`
- **Navigation state:** `activeView: 'section' | 'doubts'` + `activeSectionIdx`. Clicking a section sets `activeView='section'`; clicking "Dúvidas" sets `activeView='doubts'`. Footer Anterior/Próxima disabled when `activeView='doubts'`.
- **Right panel — section view:** sticky section header (eyebrow, title, deliverable); per-question cards:
  - hint box (sky, if `question.note`)
  - client response (read-only)
  - attachments with signed URL download
  - **client doubts indicator:** amber box + `Icons.MessageCircle` below response if `clientQuestions` has entries for that `question_id`; clicking navigates to doubts view scrolled to that question's doubt
  - CSM note area
- **Right panel — doubts view (`activeView='doubts'`):** sticky header "Dúvidas do cliente"; `ClientDoubtsPanel` component:
  - Empty state: `Icons.MessageCircle` large, gray text
  - Each doubt card: contact name + date + badge (amber=awaiting, green=replied+visible, gray=replied+internal); doubt text; linked question tag (first 64 chars); reply area
  - **Awaiting reply:** amber border/bg, "Responder" navy button → opens textarea → calls `replyToQuestion({ id, csm_reply })`
  - **Replied (is_visible=true):** green border/bg, reply text, "Tornar interno" + "Editar resposta" buttons
  - **Replied (is_visible=false):** gray border/bg, "Tornar visível" + "Editar resposta" buttons; visibility toggle calls `upsertCsmNote` + manual invalidation of `brief_client_questions`
- **CSM note area** per question (from `brief_csm_notes` where `question_id` matches and `origin='csm'`):
  - Collapsed: ghost "+ Adicionar nota interna" button
  - Expanded: textarea + visibility pill toggle (`is_visible: false` → navy "Apenas interno" + `Icons.EyeOff`; `true` → lime "Visível ao cliente" + `Icons.Eye`) + Salvar/Cancelar
  - Saved note: box with left border (navy if visible, lime if internal), label + text + edit/remove buttons
- **Footer:** "Salvo automaticamente" dot + relative timestamp + Anterior/Próxima seção buttons (disabled in doubts view)
- `useBriefCsmNotes(instance.id)` provides `csmNotes`, `clientQuestions`, `upsertCsmNote`, `deleteCsmNote`, `replyToQuestion`, `isReplying`
- Attachments: signed URL generated via `supabase.storage.from('project-briefs').createSignedUrl(path, 300)` on click
- Response field: `response_text` column (not `answer`)
- **`BriefHeaderButton` badge:** `useBriefCsmNotes(instance?.id)` in `BriefHeaderButton` — red circular badge (18px, `#c44444`, white border) on button top-right corner showing count of `clientQuestions` with `csm_reply: null`

### Public Side — BriefPublicPage (`/brief/:token`)

Public page without Supabase JWT. Email-authenticated access:

**Phase flow:** `auth → validating → cover → loading → form → thanks`

1. User enters email → `brief-public` (action `validate`) validates against `contacts.client_id` OR `profiles.email`
2. On success: shows **Cover Page** (fullscreen dark gradient) before loading the form
   - Cover data from `validate`: `client_name`, `client_logo_url` (public URL, company-logos bucket), `csm_name`, `operation_capabilities` (`[{name, color}]`), `sent_at` (falls back to `created_at`)
   - Cover card: 720px centered, dark navy gradient background with radial sky+lime overlays, gradient top bar, client logo 64×64px circular (fallback: initials on `#0c1626`, lime text), `dl` metadata grid, lime CTA button
   - If session stored (page reload): cover skipped, goes straight to form
3. User clicks "Iniciar preenchimento" → calls `get` action, loads responses + attachments + client_questions + csm_notes
4. Auto-save with 1500ms debounce per question (`save_response` action)
5. Status triggers: `sent → in_progress` only for contacts, **not** for internal Hub users
6. **Cover overlay** within form: "Capa" button in appbar re-shows cover on top of the app (fade transition via `coverLeaving` state). Completed state shows "Brief enviado" banner instead of CTA.
7. **Rail (280px):** section list with SVG circular progress rings (32×32, same geometry as BriefResponsesModal); section sub-label from `audience` field; X/Y badge; "Salvo automaticamente" pill; "Fale com a Donc" link → opens **QuestionDrawer** (slide panel inside rail)
8. **Appbar:** 3-column grid — Left (Capa btn + DONC logo 40×40 lime + breadcrumb), Center (segmented progress bar per section), Right (Baixar PDF → window.print(), Help → toast)
9. **Section header:** eyebrow + step dots (14×3px bars, sky_deep=current, green=done, muted=rest) + h1 (26px/700) + deliverable block (sky border-left 3px, sky soft bg) + persona pill (dashed, audience field)
10. **Question cards:** grid `26px 1fr auto` — num badge (color by state), label+asterisk, "Respondida" badge; helper box (Info icon, sky bg) when `note`; textarea/input (13.5px); save indicator; attach chip (compact, dashed→solid when files present); "Dúvida?" ghost button
11. **Per-question doubt:** clicking "Dúvida?" expands inline textarea → `submit_question` action with `question_id`; shows existing client_questions + CSM replies; auto-closes after 2s
12. **QuestionDrawer:** slide panel inside rail for general questions (question_id: null); shows history with CSM replies
13. **CSM notes visible to client:** box with navy left border (3px), "Nota da equipe Donc" label, sourced from `csm_notes` (origin=csm, is_visible=true) from `get` action
14. **Footer (sticky):** answered count + amber missing count; ← Anterior, Salvar e sair, Próxima seção → / Concluir e enviar (disabled if missing required)
15. **Tour modal** on first visit (sessionStorage key `brief_tour_seen_{instance_id}`): 5 steps — LayoutList, Target, Info, Save, MessageCircle
16. **Attachment support:** compact chip per question (when `allow_attachment: true`), file list with signed URL download, delete; upload via hidden file input
17. `complete` action → confirm modal → locks form, marks as `completed`, phase=thanks
18. **Print (`@media print`):** hides `.no-print` (appbar, footer, rail); renders `.print-section` (all sections with responses, page-break between)
19. After completion (readOnly): shows completed banner, fields disabled

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