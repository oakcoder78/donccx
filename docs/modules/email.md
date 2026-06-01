# Module — Email

## Purpose

The Email module provides transactional email delivery and mass email campaigns from within the CRM. CSMs can compose and send templated emails to client contacts individually or in bulk via the mass send page. Templates are managed in Settings by administrators.

## Responsibilities

- **Template management** — CRUD interface for HTML email templates with variable support, image upload, and live preview. Admin-only.
- **Email composition** — single-screen composer with chips-style recipient input (Gmail-like), template/subject/body fields, attachment upload, optional preview modal.
- **Delivery** — sends via Resend API through a Supabase Edge Function.
- **Logging** — every send attempt is recorded in `email_logs` for auditability.
- **Activity creation** — successful sends generate a `type=email` activity on the client timeline.
- **Mass send** — bulk email sender in Settings with recipient auto-selection (champion, técnico, has activity), per-client expand/collapse, and per-recipient merge variables (`nome_contato`, `nome_empresa`). Safety limit of 100 recipients per batch enforced in the UI.
- **Role-based sender** — `from_mode` controls whether the email appears to come from the CSM or from `noreply@donc.com.br`.
- **Domain validation** — CSM sender requires profile email ending in `@donc.com.br`. Invalid domain disables the radio button, auto-selects noreply, and shows a warning. Edge function returns 400 on invalid domain.
- **Reply-to** — all emails include `reply_to: suporte@donc.com.br` set via Resend API parameter.
- **Attachments** — files up to 5 MB each (max 5) uploaded to `activity-attachments` bucket, sent via Resend, and persisted as `activity_attachments` records linked to the auto-created activity. Reuses the existing activity attachment system — files appear in `ActivityDetailModal`, `ClientSubAnexos`, and the client timeline. Allowed types: PDF, DOC/DOCX, XLS/XLSX, JPEG, PNG, GIF, WebP, and HTML/HTM.

## Key Components

| File | Role |
|------|------|
| `src/components/email/EmailTemplatesManager.jsx` | Settings page — template list, HTML editor, variable management, preview |
| `src/components/email/EmailComposerModal.jsx` | Composer — single-screen: chips Para:, company swap, template, attachments, preview modal |
| `src/components/clients/ClientDetail.jsx` | Integrates the send button and modal |
| `src/components/clients/tabs/ClientTabContatos.jsx` | Email button per contact — opens composer with preselected contact |
| `src/components/contacts/ContactPanel.jsx` | Email button in contact side panel |
| `src/components/contacts/ContactsPage.jsx` | Email button in contacts table |
| `src/components/settings/SettingsEmailBlast.jsx` | Mass send page — recipient selector + composer + send (Settings menu) |
| `src/hooks/useEmailBlastRecipients.js` | Hook — parallel queries for active clients + activity contacts |
| `supabase/functions/send-email/index.ts` | Edge Function — Resend API, template merge, logging, activity creation, attachment download+base64 |

## Data Interaction

### Mass Send Queries (`useEmailBlastRecipients`)

Two parallel queries on mount:

```javascript
// Query A: all active clients with ALL their contact_links
const { data: clientsData } = await supabase
  .from('clients')
  .select(`
    id, name, fantasy_name,
    contact_links(
      contact_id, papel, champion,
      contacts(
        id, name, email,
        contact_emails(email, is_primary)
      )
    )
  `)
  .eq('contract_active', true)
  .order('name')

// Query B: all contact IDs that appear in any activity
const { data: activityRows } = await supabase
  .from('activities')
  .select('contact_id')
  .not('contact_id', 'is', null)
```

### Tables

| Table | Access | Purpose |
|-------|--------|---------|
| `email_templates` | R: all authenticated / W: admin only | Template storage |
| `email_logs` | R/W: all authenticated | Send audit trail |
| `contacts` | R: via join | Contact lookup for recipients |
| `contact_links` | R: via join | Client-contact relationship |
| `clients` | R: via join | Client context for activity |
| `profiles` | R: service role | CSM identity for `from` address |
| `activities` | W: service role | Auto-created activity per send |
| `profiles` | W: DDL | `cargo` column added to store CSM role title |

### Edge Function Request

```
POST /functions/v1/send-email
Authorization: Bearer <user_token>

{
  template_id: string,
  recipients: [{ contact_id, client_id, email, variables: {} }],
  sent_by: uuid,
  from_mode?: "csm" | "noreply",   // default: "csm"
  attachments?: [{                  // optional
    storage_path: string,           // "activity-attachments/{clientId}/email_temp/{ts}_{file}"
    file_name: string,
    file_size: number,
    file_type: string
  }]
}
```

### External Integrations

- **Resend** (`api.resend.com/emails`) — transactional email delivery
  - Requires secret `RESEND_API_KEY` in Supabase Edge Function secrets
  - CORS origins: `donccx.vercel.app` and `localhost:5173`

## UI Behavior

### EmailTemplatesManager (Settings > Templates de E-mail)

- Split layout: template list on the left (256px), editor on the right
- Template list shows name and active/inactive badge
- Editor exposes: name, subject, variables (click to insert `{{var}}` into HTML), HTML textarea, image uploader, live preview toggle
- New templates get a random UUID until saved (upsert by `id`)
- Admin-only access enforced by `managerOnly` flag in `SettingsPage` menu

### EmailComposerModal — Single-Screen Composer

No stepper. All fields visible on one screen. Modal width adapts to preview state.

**Layout (top to bottom):**

1. **Empresa** — auto-selected via `preselectedClientId`, or searchable dropdown. `RefreshCw` icon button to change company.
2. **Para:** — Gmail-style chips input:
   - Selected contacts show as rounded pills with `×` remove button
   - Text input filters contacts from current company (by name or email)
   - Dropdown shows matching contacts; disabled entries indicate missing email
   - `preselectedContactId` pre-fills the chip
3. **Template** — select from active templates
4. **Assunto** — text input
5. **Mensagem** — WYSIWYG editor (EmailEditor)
6. **Anexos** — file picker (PDF/DOC/XLS/IMG, max 5 files, 5 MB each), uploaded on send
7. **Domain warning** — amber banner if profile email is not `@donc.com.br`
8. **Remetente** — radio group (admin/manager only):
   - `Meu e-mail (user@donc.com.br)` — disabled if domain invalid
   - `noreply@donc.com.br` — auto-selected when domain invalid
9. **Assinatura** — profile name, cargo, phone, email (read-only preview)
10. **Actions** — `[Preview]` (optional, opens modal) `[Enviar]`

**Preview:** Opens a `Modal` (`max-w-3xl`) showing recipients, subject, and HTML iframe. Not a required step.

**Result:** Shown inline (replaces form) after send:
- Success: green check, count, `[Fechar]` `[Enviar outro]`
- Error: red error message, `[Fechar]` `[Tentar novamente]`

`mode` prop is `individual` (default); `preselectedClientId` / `preselectedContactId` allow direct invocation from client context.

### SettingsEmailBlast — Mass Send Page

Settings page at Configurações > Comunicação > Envio em Massa. Two-column layout with recipient selector on the left and composer on the right.

**Layout (left column, top to bottom):**

1. **SummaryPill + SelectAllToggle** — total recipient/company counts with `Icons.Users` + toggle button: "Selecionar pré-selecionados" selects only champion/técnico/has-activity contacts per client; "Limpar seleção" clears all
2. **ClientSearchInput** — filters active clients by name (`fantasy_name`/`name`)
3. **ClientList** — scrollable list of client rows:
   - **ClientRow header** — click to expand/collapse, shows client name + selected count badge
   - **ContactChips** — selected contacts shown as rounded pills with reason tags (★ champion, ⚙ técnico, ● atividade) and × remove button
   - **AddContactDropdown** — lists remaining contacts for that client; filtered by email existence

**Layout (right column, top to bottom):**

1. **TemplatePicker** — `<select>` from active `email_templates`, auto-populates no fields
2. **SubjectInput** — text input, controlled
3. **EmailEditor** — WYSIWYG with AI Rewrite button (reuses `EmailEditor` component directly)
4. **AttachmentSection** — file picker (PDF/DOC/XLS/IMG, max 5 files, 5 MB each), uploaded to `blast_temp/` storage path on send
5. **FromModePicker** — radio csm/noreply (admin/manager only, same domain validation as individual composer)
6. **Domain warning** — amber banner if profile email is not `@donc.com.br`
7. **CSMSignaturePreview** — read-only name, cargo, phone, email
8. **ActionBar** — recipient count badge + Preview button + Send button (disabled if no recipients / no template / no subject / no body)

**Pre-selection logic (on mount):**
- Contact is auto-selected if `champion === true` OR `papel === 'Técnico'` OR contact appears in `activities` table
- All pre-selected contacts can be individually deselected
- Contacts without a resolvable email are excluded from both display and selection

**Safety limit:** Warning banner shown if recipient count exceeds 100. Send is blocked with a toast if > 100.

**Result screen** (replaces composer after send):
- Success: green `CheckCircle2`, sent count, failed count with per-recipient error list
- Error: red `XCircle`, error message, "Tentar novamente" button
- "Enviar nova campanha" button clears composer fields but preserves recipient selection

### Entry Points

## Data Flow

```
User opens modal (from ClientDetail / ContactPanel / ClientTabContatos)
       │
       ▼
Fills form: company, Para: chips, template, subject, message, attachments
       │
       ├── [Preview] optional → opens Modal with recipients, subject, iframe
       │
       ▼
handleSend() → upload attachments → fetch /functions/v1/send-email (with attachments metadata)
       │
       ▼
Edge function:
  1. Auth (user token)
  2. Fetch profile (sender name/email/role)
  3. Validate from_mode permission (admin/manager required for "noreply")
  4. Validate CSM domain: if `from_mode='csm'` and email not `@donc.com.br` → return 400
  5. Resolve from_address
  6. Fetch template from DB
  7. Download attachments from storage → base64 encode (once, before recipient loop)
  8. Loop recipients:
        a. mergeTags(template, vars)
        b. POST /emails (Resend) — includes attachments if present
        c. INSERT email_log
        d. INSERT activity — `Prefer: return=representation` to capture ID
        e. INSERT activity_attachments (if activity created + files attached)
  9. Return { sent, failed, logs }
```

### Mass Send Data Flow

```
User opens Settings > Comunicação > Envio em Massa
       │
       ▼
useEmailBlastRecipients runs Query A (clients + contact_links + contacts)
                         + Query B (activity contact_ids) in parallel
       │
       ▼
Pre-selection: champion | papel===Técnico | hasActivity
       │
       ▼
User adjusts selection (search, expand, toggle chips, add contacts)
       │
       ▼
User fills composer: template, subject, body, attachments (optional)
       │
       ├── [Preview] → Modal with iframe using mergeTags + first recipient's vars
       │
       ▼
handleSend():
  1. Validate recipient count ≤ 100
  2. Upload attachments to blast_temp/{ts}_{file}
  3. Build recipients[] array with per-recipient variables (nome_contato, nome_empresa, CSM vars)
  4. POST /functions/v1/send-email (same endpoint as individual send)
  5. Show result screen (sent/failed counts)
  6. "Enviar nova campanha" → resetComposer() clears form, keeps recipient selection
```

## Dependencies

- `useAuth` — user identity, role check for `from_mode`
- `supabaseClient` — template/contact/client queries
- `@tanstack/react-query` — template list caching (`useTemplates`, `useSaveTemplate`)
- `react-hot-toast` — success/error feedback
- `SettingsSectionHeader` — consistent settings header
- `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-underline`, `@tiptap/extension-link`, `@tiptap/extension-text-align` — WYSIWYG editor (`EmailEditor`)
- `useEmailBlastRecipients` — parallel queries for mass send recipient data

## Main User Flows

1. **CSM sends email** — clicks "Enviar e-mail" → composer opens → selects/confirms company → types contact name in "Para:" (chips) → picks template → writes subject + body → attaches files (optional) → [Preview] (optional) → [Enviar] → activity + attachments appear on client timeline
2. **Manager sends mass email** — navigates to Settings > Comunicação > Envio em Massa → recipients auto-selected (champion, técnico, has activity) → adjusts selection → picks template → writes subject + body → attaches files (optional) → [Preview] (optional) → [Enviar] → sent/failed result screen → "Enviar nova campanha" to reset
3. **Admin manages templates** — navigates to Settings > Templates de E-mail → creates or edits template → inserts variables → uploads images → previews → saves

## Attachments

### File restrictions

| Rule | Value |
|------|-------|
| Max per file | 5 MB |
| Max files | 5 |
| Allowed types | PDF, DOC/DOCX, XLS/XLSX, JPEG, PNG, GIF, WebP, HTML/HTM |

### Upload flow

1. User selects files in Step 2 (Mensagem) — validated client-side (type, size, count)
2. On send click, files upload to bucket `activity-attachments/{clientId}/email_temp/{timestamp}_{filename}`
3. Edge function downloads from storage (service role), base64-encodes, sends via Resend
4. On send success: edge function creates `activity_attachments` records linked to the auto-created activity
5. On close/cancel: orphaned files (uploaded but not linked to an activity) are cleaned up from storage

### UI display

No changes needed — the existing `activity_attachments` infrastructure renders attachments in:
- `ActivityDetailModal` — preview/download/delete
- `ClientTabActivities` — Paperclip icon on email activities  
- `ClientSubAnexos` — unified attachments table
- `ActivitiesPage` — attachment count per activity

## Edge Cases

### Individual send

- Contact without email registered: shows amber warning in step 1, blocked from selecting
- `from_mode=noreply` by non-admin/manager: edge function returns `403`
- CSM without `@donc.com.br` email: radio "Meu e-mail" disabled, "noreply" auto-selected, amber warning shown. Edge function returns `400` if `from_mode='csm'` with invalid domain
- Resend API failure: email logged as `failed`, error message stored, `result.failed` incremented, activity NOT created
- Template not found (404): edge function returns error before any send
- `cargo` field null on profile: `csm_cargo` variable defaults to empty string
- Image upload: stores in `report-images` bucket; returns `publicUrl` embedded as `<img src>`
- Attachments: files uploaded to storage before send. Orphaned files (uploaded but send failed) cleaned up on modal close

### Mass send

- **100-recipient limit:** Supabase edge function timeout (~60s) limits safe throughput to ~100 recipients. UI warns with banner if count exceeds 100 and blocks send with toast error.
- **`blast_temp/` storage path:** Mass send uses `blast_temp/{ts}_{file}` instead of `{client.id}/email_temp/{ts}_{file}` — no single client context exists in the mass send flow.
- **Per-recipient merge:** `nome_contato` and `nome_empresa` are injected per recipient, not globally. Edge function loops recipients and performs individual `mergeTags()`.
- **`nome_empresa` resolution:** Derived from `clients.fantasy_name || clients.name` for each recipient's client.
- **Pre-selection is mutable:** Auto-selected contacts (champion, técnico, has activity) can all be individually deselected. No locked selections.
- **No pagination:** Current volume (<200 active clients) fits a single query. If it scales, virtualized list needed.
- **Reset preserves selection:** "Enviar nova campanha" clears composer fields (template, subject, body, attachments) but keeps the recipient selection intact.

## Recent Changes

- **2026-06-01 (commit `f8b857e`):** Mass email blast — new Settings page `SettingsEmailBlast` with recipient selector (3-criteria pre-selection), full composer (reuses `EmailEditor`, `send-email` edge function), per-recipient merge tags, attachment upload (`blast_temp/`). New hook `useEmailBlastRecipients`. SDD document at `docs/sdd/email-blast-sdd.md`.
- **2026-05-16 (commits `167804e`, `797b6cd`, `8a529a4`, `84c39f2`, `2f15cd0`):** WYSIWYG editor (`EmailEditor` via TipTap v2) replaces textarea with formatting toolbar (Bold, Italic, Underline, H1-H3, lists, alignment, link, remove formatting). ✨ Reescrever button in toolbar calls `openrouter-proxy` edge function with configurable rewrite prompt (`email_rewrite_prompt` in `freshdesk_config`). `supabase/config.toml` — added `[functions.openrouter-proxy] verify_jwt = false`. Email templates: `<p>{{corpo_mensagem}}</p>` changed to `<div>` to avoid nested `<p>`.
- **2026-05-15 (multiple commits):** Email attachments — upload to storage, download+base64 in edge, send via Resend, persist as `activity_attachments`. Composer redesigned: single-screen with chips "Para:", company swap icon, preview modal (not a step). Domain validation: CSM sender requires `@donc.com.br`. Email button added to ClientTabContatos.
- **2026-05-13 (commit `0f8e363`):** `reply_to: suporte@donc.com.br` added to all outgoing emails via Resend API `reply_to` parameter
- **2026-05-13 (commit `1e7b9b9`):** `from_mode` field added to request body (`csm` | `noreply`); `reply_to` field added to email template schema; admin/manager can override sender; `csm_email` variable added to template variables

## Template Variables Reference

All templates support these variables via `{{variable}}` merge syntax:

| Variable | Source | Example |
|----------|--------|---------|
| `assunto` | User input (subject field) | "Lembrete de reunião" |
| `corpo_mensagem` | User input (body field, HTML from EmailEditor) | HTML content |
| `csm_nome` | `profiles.name` of sender | "João Silva" |
| `csm_cargo` | `profiles.cargo` of sender | "Customer Success Manager" |
| `csm_telefone` | `profiles.phone` of sender | "(11) 99999-9999" |
| `csm_email` | `profiles.email` of sender | "joao.silva@donc.com.br" |
| `reply_to` | fixed: `suporte@donc.com.br` | Set via Resend API `reply_to` param on every send |

**Mass send only:** These variables are injected per recipient (not globally) by the frontend before calling the edge function:

| Variable | Source |
|----------|--------|
| `nome_contato` | `contacts.name` |
| `nome_empresa` | `clients.fantasy_name \|\| clients.name` |

Additional variables can be defined per template in the manager (stored as JSONB array).

## Seeding

Initial templates are seeded via migration `20260511000000_email_module.sql`:

| Name | Variables | Layout |
|------|-----------|--------|
| `csm_individual` | assunto, corpo_mensagem, csm_nome, csm_cargo, csm_telefone, csm_email | Body + 3-column signature (CSM data / logo / tagline) |
| `comunicado` | assunto, corpo_mensagem | Logo header + body, no signature |

Layout was revised in migration `20260511120000_fix_email_template_signature.sql` — signature columns resized to 60%/20%/20%, font sizes adjusted.

## File Reference Map

- `src/components/email/EmailComposerModal.jsx` — composer modal entry point (single-screen)
- `src/components/email/EmailEditor.jsx` — TipTap WYSIWYG editor with toolbar and rewrite button
- `src/components/email/EmailTemplatesManager.jsx` — template CRUD manager
- `src/components/clients/tabs/ClientTabContatos.jsx` — email button per contact
- `src/components/settings/SettingsPage.jsx` — menu integration (EmailTemplatesManager + SettingsEmailBlast under "Comunicação")
- `src/components/settings/SettingsEmailBlast.jsx` — mass send page (recipient selector + composer + send)
- `src/hooks/useEmailBlastRecipients.js` — parallel queries for active clients + activity contacts
- `src/lib/icons.js` — `Mail` icon for settings section header; `Send` for mass send menu icon
- `supabase/functions/send-email/index.ts` — edge function implementation (unchanged)
- `supabase/migrations/20260511000000_email_module.sql` — initial schema + seed
- `supabase/migrations/20260511120000_fix_email_template_signature.sql` — signature fix + from_mode column
- `docs/sdd/email-blast-sdd.md` — SDD document for mass send feature

---

*Generated from source code and commit history (2026-05-13).*