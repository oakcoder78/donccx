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
| `BriefResponsesModal` | `src/components/brief/BriefResponsesModal.jsx` | Hub CSM view: read responses, attachments, add/edit CSM notes, send to client, import/export responses |
| `BriefHeaderButton` | `src/pages/OnboardingDetailPage.jsx` | Header button: "Questionários" (navy), opens BriefPanel modal; badge shows unanswered clientQuestions count |
| `BriefTemplateEditorModal` | `src/components/brief/BriefTemplateEditorModal.jsx` | Full editor modal: sections/questions CRUD, DnD sort, allow_attachment toggle |
| `BriefPanel` | `src/components/brief/BriefPanel.jsx` | Brief listing panel in onboarding tab |
| `BriefPublicPage` | `src/pages/BriefPublicPage.jsx` | Public page at `/brief/:token` with cover, form, attachments, tour |
| `brief-public` | `supabase/functions/brief-public/index.ts` | Edge function: validate, get, save_response, complete, submit_question, get_client_questions |
| `useBrief` | `src/hooks/useBrief.js` | Hook: briefInstances, createBrief, updateBriefStatus, deleteBrief, copyPublicLink, useBriefCsmNotes (csmNotes, clientQuestions, replyToQuestion) |
| `useBriefTemplates` | `src/hooks/useBriefTemplates.js` | Hook: CRUD for templates |
| `useBriefResponses` | `src/hooks/useBriefResponses.js` | Hook: responses and attachments for an instance |
| `useBriefViews` | `src/hooks/useBrief.js` | Hook: briefViews (who viewed each brief instance), tracked via `BriefViewsModal` |
| `BriefViewsModal` | `src/components/brief/BriefPanel.jsx` | Modal showing who viewed each brief: email, viewed_at, link to contact |
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
| `brief_views` | Tracks who viewed each brief instance. Columns: `id`, `instance_id`, `email`, `viewed_at`. RLS: select=authenticated, insert=service role only. |

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
          "allow_attachment": false,
          "support_url": "https://external-hosted-support-material.example (optional)"
        }
      ]
    }
  ]
}
```

`support_url` is an optional external link per question to help the client fill it in (spreadsheet, video, PDF, presentation). It is configured in the template editor (`BriefTemplateEditorModal`) and frozen into `structure_snapshot` when a brief is created. For briefs already `in_progress` (or `draft`), the CSM can also add/edit/remove `support_url` directly in `BriefResponsesModal` without recreating the brief — inline edit on the question card, persisted via `structure_snapshot` update (`Salvar alterações`, `updateStructureMutation`) with `hasChanges` flag; empty input deletes the key. Validation is centralized in `src/lib/briefSupportUrl.js` (`normalizeSupportUrl(raw): { valid, url, hostname, error }`): trimmed empty is valid (optional → `url: null`), max 2000 chars, must parse as `new URL(value)`, only `https:` allowed, no embedded credentials (`username`/`password`), requires `hostname`; valid returns normalized `parsed.href` + `hostname` for display. The value is validated on save in the template editor (blocks save with toast naming the question) and on blur/Enter in `BriefResponsesModal` (inline `#c44` error + toast), and re-validated before rendering in `BriefPublicPage` and `BriefResponsesModal`; the link opens in a new tab (`target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer"`) with a fixed label ("Abrir material de apoio") plus the hostname. Existing briefs keep their own snapshot.

`structure_snapshot` in `brief_instances` is a frozen copy of the template at creation time — preserves the brief content even if the template is later edited or deleted.

---

## UI Behavior

### Hub Side — OnboardingDetailPage Header

`BriefHeaderButton` in the project header:
- **Button "Questionários"** — navy background (`#173557`), white text, `Icons.FileQuestion` icon, minWidth 110
- **Badge:** red circular badge (18px, `#c44444`, white border) on top-right corner showing count of `clientQuestions` with `csm_reply: null` from any brief instance for this onboarding
- Clicking "Questionários" opens `BriefPanelModal` which contains `BriefPanel`
- Admin users see delete icon (`Icons.Trash2` in `S.iconBtn` style, red `#c44`) next to "Editar projeto"

### BriefPanel (`BriefPanelModal`)

Modal panel (max 900px) listing all brief instances for the onboarding:
- **Header:** "Questionários" title + status filter tabs (Todos, Rascunho, Enviado, Em progresso, Concluído, Arquivado) + "Criar novo" button (opens `BriefCreateModal`)
- **Instance cards:** Each card shows: title, status badge, progress (X/Y answered), dates (created, sent, completed), view count + "Ver visualizações" link, action buttons (copy link, send to client, open responses, archive/delete)
- **Card click:** Opens `BriefResponsesModal` for that specific instance
- **Delete:** `Trash2` icon right-aligned in card action row — counts responses, warns if data will be lost, calls `deleteBrief` mutation, logs to `audit_logs` (`action='deleted', entity_type='questionnaire'`)
- **BriefViewsModal:** Triggered by "Ver visualizações" link — shows table of who viewed: contact name (resolved via `contact_links`), email, viewed_at timestamp
- **Multi-brief support:** Multiple brief instances can exist per onboarding (one per project/fase)

### BriefResponsesModal

Wide (max 1000px) two-column modal — Hub CSM view with internal notes layer:
- **Header:** eyebrow + title + status badge + "Copiar link" + "Enviar para cliente" + "Ajuda" (tour) + close
- **Segmented progress bar:** one segment per section, width ∝ question count; green=complete, sky gradient=partial
- **Left rail (240px):** section list with SVG circular progress rings (gray track, sky fill, green+✓ at 100%); active = sky border + shadow; below sections: separator + action buttons:
  - **"Importar Respostas"** (`Icons.Upload`, `Button variant="primary"` navy) — opens hidden file input (`.md`, `.json`), parses uploaded file, shows preview modal, bulk upserts matched responses
  - **"Exportar Respostas"** (`Icons.Download`, `Button variant="primary"` navy) — downloads all responses as a Markdown file with sections, questions, and client answers formatted as headings and blockquotes
  - **"Dúvidas"** (`Icons.MessageCircle`, `Button variant="lime"`) — always lime; red notification badge (18px, `#E24B4A`, white border) on top-right corner counting unanswered `clientQuestions`; badge disappears when count is zero
- **Navigation state:** `activeView: 'section' | 'doubts'` + `activeSectionIdx`. Clicking a section sets `activeView='section'`; clicking "Dúvidas" sets `activeView='doubts'`. Footer Anterior/Próxima disabled when `activeView='doubts'`.
- **Right panel — section view:** sticky section header (eyebrow, title, deliverable); per-question cards:
  - Section title inline edit: pencil icon → input field → Enter/blur saves, Escape cancels (`editingSectionTitle` state)
  - Section deliverable ("Entregável") inline edit: same pattern as title, pencil → input → save
  - Section delete: Trash2 icon → confirm if section has any responses, otherwise removes immediately; `handleRemoveSection` checks `getResponse(q.id)` per question
   - Question text inline edit: pencil on question label → input → blur/Enter saves to `question.text` in `structure` state; `handleUpdateQuestion(sIdx, qIdx, { text: ... })`
   - Question note inline edit: pencil on hint box → input → blur/Enter saves to `question.note`; inline (doesn't expand note area)
   - **Material de apoio (`support_url`) inline edit:** when `support_url` present shows navy row (`Icons.Link`, `background: ${NAVY}0a`, `border: ${NAVY}25`) with `supportLink` (`normalizeSupportUrl` re-validated) — "Abrir material de apoio" link + `hostname` (hidden on `sm`), pencil (`Icons.Pencil`, title "Editar material de apoio") toggles inline input (`ref=supportRef`, `placeholder "https://… (planilha, vídeo, PDF)"`, `borderColor: SKY`), X (`Icons.X`, title "Remover material de apoio") deletes via `onUpdateQuestion({ support_url: null })` (key deleted in `updateQuestion`); when absent shows ghost "+ Adicionar material de apoio" button (`Icons.Plus`, `11px`, `hover:text-[#0a6a96]`); editing state `editingSupport`/`draftSupport`/`supportTouched`, focus on open, sync via `useEffect` on `question.support_url`; validation on blur/Enter via `normalizeSupportUrl(draftSupport)` — inline `#c44` error when `supportTouched && !valid`, toast on invalid (`toast.error(res.error)`), Escape cancels; empty input deletes key; changes set `hasChanges=true` → persist via `updateStructureMutation` (`supabase.from('brief_instances').update({ structure_snapshot: { sections } })`) on "Salvar alterações"
   - **Pre-fill answers:** CSM can type directly in the response textarea when no client response exists (checked via `responded_by_email !== 'csm'`). Auto-saves with 1.2s debounce via `upsertResponse` mutation → `brief_responses` with `responded_by_email: 'csm'`. On the public page, client sees pre-fill as editable and can overwrite.
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
   - If session stored (page reload): cover skipped, goes straight to form; `refreshCover()` re-runs `validate` on mount to keep cover data (e.g. `operation_capabilities`) in sync with project changes
3. User clicks "Iniciar preenchimento" → calls `get` action, loads responses + attachments + client_questions + csm_notes
4. Auto-save with 1500ms debounce per question (`save_response` action)
5. Status triggers: `sent → in_progress` only for contacts, **not** for internal Hub users
6. **Cover overlay** within form: "Capa" button in appbar re-shows cover on top of the app (fade transition via `coverLeaving` state), calling `refreshCover()` so capabilities reflect live project state. Completed state shows "Brief enviado" banner instead of CTA.
7. **Rail (280px):** section list with SVG circular progress rings (32×32, same geometry as BriefResponsesModal); section sub-label from `audience` field; X/Y badge; "Salvo automaticamente" pill; "Fale com a Donc" link → opens **QuestionDrawer** (slide panel inside rail)
8. **Appbar:** 3-column grid — Left (Capa btn + DONC logo 40×40 lime + breadcrumb), Center (segmented progress bar per section), Right (Baixar PDF → window.print(), Help → toast)
9. **Section header:** eyebrow + step dots (14×3px bars, sky_deep=current, green=done, muted=rest) + h1 (26px/700) + deliverable block (sky border-left 3px, sky soft bg) + persona pill (dashed, audience field)
10. **Question cards:** grid `26px 1fr auto` — num badge (color by state), label+asterisk, "Respondida" badge; helper box (Info icon, sky bg) when `note`; **support link row** (`normalizeSupportUrl(question.support_url)` re-validated, `supportLink` null skips rendering, otherwise navy-sky row `background: rgba(89,194,237,0.06)` `border: rgba(89,194,237,0.16)` with `Icons.Link` sky_deep, link "Abrir material de apoio" `href={supportLink.url}` `target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer"` + hostname `· abre em nova aba`); textarea/input (13.5px); save indicator; attach chip (compact, dashed→solid when files present); "Dúvida?" ghost button
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
   - **Question card controls:** select (Texto curto/Texto longo), pill toggles for Obrigatória (navy) and Anexo (sky), "+ Orientação" button expands note row (`Icons.Info`, sky dashed `background: ${SKY}08`, `borderColor: ${SKY}40`, placeholder "Orientação opcional para o cliente…"); "+ Material de apoio" button expands URL row (`Icons.Link`, navy dashed `background: ${NAVY}06`, `borderColor: ${NAVY}30`, input `placeholder "https://… (planilha, vídeo, PDF, apresentação)"`, `onBlur` sets `supportTouched=true`, inline `#c44` error when `!supportRes.valid`, hint "Material externo aberto em nova aba como “Abrir material de apoio”"); duplicate (`Icons.Copy`)/remove (`Icons.X`) buttons; per-question `showNote`/`showSupport` + `supportTouched` state, `normalizeSupportUrl(question.support_url)` for display
   - **Add question dock:** dashed border, "+ Adicionar pergunta", quick-type shortcuts "Texto curto" / "Texto longo"
   - **Footer:** relative updated_at timestamp (left), Cancel / Salvar rascunho / Publicar template buttons (right)
- **Draft vs Publish:** "Salvar rascunho" → `is_active: false`; "Publicar template" → `is_active: true`
- **Validation on save (`handleSave`):** name required, at least one section, each `support_url` re-validated via `normalizeSupportUrl(q.support_url)` — invalid shows `toast.error('URL de apoio inválida em “${q.text || 'Pergunta sem texto'}”')` and blocks save; valid URLs normalized to `parsed.href` (`cleaned.support_url = normalizeSupportUrl(...).url`), empty trimmed values have key deleted (`delete cleaned.support_url`); structure rebuilt with `order: si+1` / `qi+1`
- DnD: sections (rail) and questions (editor) each have their own `DndContext` — reuses `@dnd-kit` already installed for `ReportEditorPage`

---

## Dependencies

- `supabaseClient` — database queries and storage
- `useBrief`, `useBriefTemplates`, `useBriefResponses` hooks
- `Icons` registry — `Icons.FileQuestion`, `Icons.Pencil`, `Icons.Paperclip`, `Icons.ClipboardList`, `Icons.Send`, `Icons.Trash2`, `Icons.GripVertical`, `Icons.Copy`, `Icons.Info`, `Icons.HelpCircle`, `Icons.Eye`, `Icons.EyeOff`, `Icons.MessageCircle` (no direct lucide-react imports)
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
| `20260521000000_brief_csm_notes_allow_reply_to_client_questions.sql` | Broadens `brief_csm_notes_update` RLS policy to allow CSM reply on client questions (`created_by = null`) |
| `20260522000000_brief_views.sql` | Creates `brief_views` table for tracking who opened each brief (email + viewed_at); RLS: select=authenticated, insert=service |

> **After deploy of `brief-public`:** disable "Verify JWT" in Dashboard → Edge Functions → brief-public → Settings.