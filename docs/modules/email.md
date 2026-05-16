# Module — Email

## Purpose

The Email module provides transactional email delivery from within the CRM. CSMs can compose and send templated emails to client contacts directly from the client detail page, without leaving the application. Templates are managed in Settings by administrators.

## Responsibilities

- **Template management** — CRUD interface for HTML email templates with variable support, image upload, and live preview. Admin-only.
- **Email composition** — single-screen composer with chips-style recipient input (Gmail-like), template/subject/body fields, attachment upload, optional preview modal.
- **Delivery** — sends via Resend API through a Supabase Edge Function.
- **Logging** — every send attempt is recorded in `email_logs` for auditability.
- **Activity creation** — successful sends generate a `type=email` activity on the client timeline.
- **Role-based sender** — `from_mode` controls whether the email appears to come from the CSM or from `noreply@donc.com.br`.
- **Domain validation** — CSM sender requires profile email ending in `@donc.com.br`. Invalid domain disables the radio button, auto-selects noreply, and shows a warning. Edge function returns 400 on invalid domain.
- **Reply-to** — all emails include `reply_to: suporte@donc.com.br` set via Resend API parameter.
- **Attachments** — files up to 5 MB each (max 5) uploaded to `activity-attachments` bucket, sent via Resend, and persisted as `activity_attachments` records linked to the auto-created activity. Reuses the existing activity attachment system — files appear in `ActivityDetailModal`, `ClientSubAnexos`, and the client timeline.

## Key Components

| File | Role |
|------|------|
| `src/components/email/EmailTemplatesManager.jsx` | Settings page — template list, HTML editor, variable management, preview |
| `src/components/email/EmailComposerModal.jsx` | Composer — single-screen: chips Para:, company swap, template, attachments, preview modal |
| `src/components/clients/ClientDetail.jsx` | Integrates the send button and modal |
| `src/components/clients/tabs/ClientTabContatos.jsx` | Email button per contact — opens composer with preselected contact |
| `src/components/contacts/ContactPanel.jsx` | Email button in contact side panel |
| `src/components/contacts/ContactsPage.jsx` | Email button in contacts table |
| `supabase/functions/send-email/index.ts` | Edge Function — Resend API, template merge, logging, activity creation, attachment download+base64 |

## Data Interaction

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

### Entry Points

| Entry Point | Source | Preselected |
|------------|--------|-------------|
| Client Detail | `ClientDetail.jsx` | `preselectedClientId` |
| Contact Side Panel | `ContactPanel.jsx` | Both |
| Contacts Page | `ContactsPage.jsx` | Both |
| Contacts Tab | `ClientTabContatos.jsx` | Both |

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

## Dependencies

- `useAuth` — user identity, role check for `from_mode`
- `supabaseClient` — template/contact/client queries
- `@tanstack/react-query` — template list caching (`useTemplates`, `useSaveTemplate`)
- `react-hot-toast` — success/error feedback
- `SettingsSectionHeader` — consistent settings header
- `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-underline`, `@tiptap/extension-link`, `@tiptap/extension-text-align` — WYSIWYG editor (`EmailEditor`)

## Main User Flows

1. **CSM sends email** — clicks "Enviar e-mail" → composer opens → selects/confirms company → types contact name in "Para:" (chips) → picks template → writes subject + body → attaches files (optional) → [Preview] (optional) → [Enviar] → activity + attachments appear on client timeline
2. **Admin manages templates** — navigates to Settings > Templates de E-mail → creates or edits template → inserts variables → uploads images → previews → saves

## Attachments

### File restrictions

| Rule | Value |
|------|-------|
| Max per file | 5 MB |
| Max files | 5 |
| Allowed types | PDF, DOC/DOCX, XLS/XLSX, JPEG, PNG, GIF, WebP |

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

- Contact without email registered: shows amber warning in step 1, blocked from selecting
- `from_mode=noreply` by non-admin/manager: edge function returns `403`
- CSM without `@donc.com.br` email: radio "Meu e-mail" disabled, "noreply" auto-selected, amber warning shown. Edge function returns `400` if `from_mode='csm'` with invalid domain
- Resend API failure: email logged as `failed`, error message stored, `result.failed` incremented, activity NOT created
- Template not found (404): edge function returns error before any send
- `cargo` field null on profile: `csm_cargo` variable defaults to empty string
- Image upload: stores in `report-images` bucket; returns `publicUrl` embedded as `<img src>`
- Attachments: files uploaded to storage before send. Orphaned files (uploaded but send failed) cleaned up on modal close

## Recent Changes

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
- `src/components/settings/SettingsPage.jsx` — menu integration (EmailTemplatesManager under "Comunicação")
- `src/lib/icons.js` — `Mail` icon for settings section header
- `supabase/functions/send-email/index.ts` — edge function implementation
- `supabase/migrations/20260511000000_email_module.sql` — initial schema + seed
- `supabase/migrations/20260511120000_fix_email_template_signature.sql` — signature fix + from_mode column

---

*Generated from source code and commit history (2026-05-13).*