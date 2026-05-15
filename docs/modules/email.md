# Module — Email

## Purpose

The Email module provides transactional email delivery from within the CRM. CSMs can compose and send templated emails to client contacts directly from the client detail page, without leaving the application. Templates are managed in Settings by administrators.

## Responsibilities

- **Template management** — CRUD interface for HTML email templates with variable support, image upload, and live preview. Admin-only.
- **Email composition** — 3-step modal (recipient selection → message → preview & send) accessible from the client detail page.
- **Delivery** — sends via Resend API through a Supabase Edge Function.
- **Logging** — every send attempt is recorded in `email_logs` for auditability.
- **Activity creation** — successful sends generate a `type=email` activity on the client timeline.
- **Role-based sender** — `from_mode` controls whether the email appears to come from the CSM or from `noreply@donc.com.br`.
- **Reply-to** — all emails include `reply_to: suporte@donc.com.br` set via Resend API parameter.
- **Attachments** — files up to 5 MB each (max 5) uploaded to `activity-attachments` bucket, sent via Resend, and persisted as `activity_attachments` records linked to the auto-created activity. Reuses the existing activity attachment system — files appear in `ActivityDetailModal`, `ClientSubAnexos`, and the client timeline.

## Key Components

| File | Role |
|------|------|
| `src/components/email/EmailTemplatesManager.jsx` | Settings page — template list, HTML editor, variable management, preview |
| `src/components/email/EmailComposerModal.jsx` | Modal — 3-step composer: recipients, message, preview & send |
| `src/components/clients/ClientDetail.jsx` | Integrates the send button and modal |
| `supabase/functions/send-email/index.ts` | Edge Function — Resend API, template merge, logging, activity creation |

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

### EmailComposerModal (from ClientDetail)

3-step stepper:

1. **Destinatário** — search client (if not preselected), select contact checkboxes from client contact links
2. **Mensagem** — select template, fill subject and body, optionally choose `from_mode` (admin/manager only)
3. **Preview e envio** — HTML iframe preview, recipient list, send button, post-send result

`mode` prop is `individual` (default); `preselectedClientId` / `preselectedContactId` allow direct invocation from client context.

### EmailComposerModal (from ContactPanel — ClientTabContatos)

Per-contact action button in the contacts list:
- Each contact row in `ClientTabContatos` shows an "Enviar e-mail" button (`Icons.Mail`)
- Clicking opens `EmailComposerModal` with `preselectedContactId` and `preselectedClientId` pre-filled
- Flow: skip to Step 2 (Mensagem) since recipient is already selected
- Uses same 3-step stepper as ClientDetail integration

## Data Flow

```
User opens modal
       │
       ▼
Step 1: selects client + contacts
       │
       ▼
Step 2: picks template, fills {{assunto}}, {{corpo_mensagem}}
       │
       ▼
Step 3: preview (local mergeTags)
       │
       ▼
handleSend() → fetch /functions/v1/send-email (with attachments metadata)
       │
       ▼
Edge function:
  1. Auth (user token)
  2. Fetch profile (sender name/email/role)
  3. Validate from_mode permission (admin/manager required for "noreply")
  4. Resolve from_address
  5. Fetch template from DB
  6. Download attachments from storage → base64 encode (once, before recipient loop)
  7. Loop recipients:
        a. mergeTags(template, vars)
        b. POST /emails (Resend) — includes attachments if present
        c. INSERT email_log
        d. INSERT activity — `Prefer: return=representation` to capture ID
        e. INSERT activity_attachments (if activity created + files attached)
  8. Return { sent, failed, logs }
```

## Dependencies

- `useAuth` — user identity, role check for `from_mode`
- `supabaseClient` — template/contact/client queries
- `@tanstack/react-query` — template list caching (`useTemplates`, `useSaveTemplate`)
- `react-hot-toast` — success/error feedback
- `SettingsSectionHeader` — consistent settings header

## Main User Flows

1. **CSM sends email** — clicks "Enviar e-mail" on client page → selects contacts → picks `csm_individual` template → writes message → previews → sends → activity appears on client timeline
2. **Admin manages templates** — navigates to Settings > Templates de E-mail → creates or edits template → inserts variables → uploads images → previews → saves

## Attachments

### File restrictions

| Rule | Value |
|------|-------|
| Max per file | 5 MB |
| Max files | 5 |
| Allowed types | PDF, DOC/DOCX, XLS/XLSX, JPEG, PNG, GIF, WebP |

### Upload flow

1. User selects files in Step 3 (Preview) — validated client-side (type, size, count)
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

- Contact without email registered: shows amber warning in step 1, blocked from advancing
- `from_mode=noreply` by non-admin/manager: edge function returns `403`
- Resend API failure: email logged as `failed`, error message stored, `result.failed` incremented, activity NOT created
- Template not found (404): edge function returns error before any send
- `cargo` field null on profile: `csm_cargo` variable defaults to empty string
- Image upload: stores in `report-images` bucket; returns `publicUrl` embedded as `<img src>`

## Recent Changes

- **2026-05-13 (commit `0f8e363`):** `reply_to: suporte@donc.com.br` added to all outgoing emails via Resend API `reply_to` parameter
- **2026-05-13 (commit `1e7b9b9`):** `from_mode` field added to request body (`csm` | `noreply`); `reply_to` field added to email template schema; admin/manager can override sender; `csm_email` variable added to template variables

## Template Variables Reference

All templates support these variables via `{{variable}}` merge syntax:

| Variable | Source | Example |
|----------|--------|---------|
| `assunto` | User input (subject field) | "Lembrete de reunião" |
| `corpo_mensagem` | User input (body field, line breaks converted to `<br>`) | HTML paragraph |
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

- `src/components/email/EmailComposerModal.jsx` — composer modal entry point
- `src/components/email/EmailTemplatesManager.jsx` — template CRUD manager
- `src/components/settings/SettingsPage.jsx` — menu integration (EmailTemplatesManager under "Comunicação")
- `src/lib/icons.js` — `Mail` icon for settings section header
- `supabase/functions/send-email/index.ts` — edge function implementation
- `supabase/migrations/20260511000000_email_module.sql` — initial schema + seed
- `supabase/migrations/20260511120000_fix_email_template_signature.sql` — signature fix + from_mode column

---

*Generated from source code and commit history (2026-05-13).*