# SDD — Email Blast (Envio de E-mail em Massa)

## Purpose

This document is a Spec-Driven Development (SDD) artifact. It serves as the **single source of truth** for the mass email sending feature in doncCX Hub. It is designed to be read by both humans and LLM agents so that work can be resumed, implemented, and documented without external context.

### How to use this document

1. **Before implementing:** Read this document fully. Understand the existing components being reused and the architectural decisions already made.
2. **During implementation:** Follow the checklist for the active phase. Mark items ✅ as they are completed and verified.
3. **After implementation:** Fill the Implementation Log for the completed phase and update Section 0.

---

## 0. Current System State

> **Read this first.** This block is the starting point for any agent resuming work.

- **Active branch:** `main`
- **Last deploy:** `donccx.vercel.app`
- **Active phase:** Phase 1 — Not started
- **SDD lifecycle stage:** Draft

**What already exists related to this work:**
- `src/components/email/EmailComposerModal.jsx` — modal para e-mail individual; contém toda a lógica de template, contatos, remetente, anexos, AI rewrite, preview e envio. O Email Blast reutiliza quase toda essa lógica, mas como página de settings, não como modal.
- `src/components/email/EmailEditor.jsx` — rich text editor com suporte a AI rewrite. Será importado diretamente.
- `src/components/email/EmailTemplatesManager.jsx` — gerenciador de templates existente na seção Comunicação.
- `supabase/functions/send-email/index.ts` — Edge Function que já suporta `recipients[]` array com variáveis por destinatário. **Nenhuma modificação necessária no backend.**
- `src/components/settings/SettingsPage.jsx` — página de configurações com sidebar. A seção `Comunicação` já existe na linha 68. Basta adicionar o novo item `email-blast`.
- `src/hooks/useContacts.js` — hook para contatos; suporta filtro `champion: true`.
- Tabela `contact_links` com colunas `champion` (boolean) e `papel` (string: `'Decisor'`, `'Influenciador'`, `'Usuário'`, `'Técnico'`).
- Tabela `activities` com coluna `contact_id` (FK nullable para `contacts.id`) — usada para identificar contatos que já tiveram atividades registradas.
- Tabela `email_logs` — já recebe logs de cada envio automaticamente pela Edge Function.
- Feature flag `email_templates` — já existe; o novo item usará a mesma flag.

**What does NOT exist and needs to be created:**
- `src/components/settings/SettingsEmailBlast.jsx` — componente principal da nova funcionalidade.
- `src/hooks/useEmailBlastRecipients.js` — hook para carregar clientes ativos com seus contatos champions pré-selecionados.
- Item `email-blast` no `MENU_GROUPS` em `SettingsPage.jsx`.
- Entrada no `SETTINGS_MENU_ICONS` para o ícone do novo item.
- Registro no `renderContent()` de `SettingsPage.jsx` para mapear a key para o componente.

### Files to be touched

| File | Change type |
|---|---|
| `src/components/settings/SettingsEmailBlast.jsx` | **Create** — componente principal |
| `src/hooks/useEmailBlastRecipients.js` | **Create** — hook de carregamento de destinatários |
| `src/components/settings/SettingsPage.jsx` | Modify — adicionar item ao menu, ícone e renderContent |

---

## 1. Global Definitions

### Feature flag
- Reuse existing flag: `email_templates` (manager-only)
- Menu key: `'email-blast'`
- Menu label: `'Envio em Massa'`

### Pre-selection rules
A contact is auto-selected on load if it meets **any** of these criteria. Pre-selected contacts **can be deselected** by the user.

| Criterion | Source field | Value |
|---|---|---|
| Champion | `contact_links.champion` | `true` |
| Técnico | `contact_links.papel` | `'Técnico'` (exact string, capital T, with accent) |
| Has activity | `activities.contact_id` | contact appears in any activity row for any client |

```javascript
function isPreSelected(contact, contactIdsWithActivities) {
  return contact.champion
    || contact.papel === 'Técnico'
    || contactIdsWithActivities.has(contact.contactId)
}
```

### Template variables (per recipient)
The `send-email` Edge Function already performs per-recipient `mergeTags()`. These are the variables available in each email:

| Variable | Source |
|---|---|
| `{{nome_contato}}` | `contacts.name` |
| `{{nome_empresa}}` | `clients.fantasy_name \|\| clients.name` |
| `{{assunto}}` | subject field |
| `{{corpo_mensagem}}` | body field |
| `{{csm_nome}}` | `profiles.name` (sender) |
| `{{csm_cargo}}` | `profiles.cargo` |
| `{{csm_telefone}}` | `profiles.phone` |
| `{{csm_email}}` | `profiles.email` |

### Edge Function contract (unchanged)
```
POST /functions/v1/send-email
{
  template_id: string,
  recipients: Array<{
    contact_id: number,
    client_id:  number,
    email:      string,
    variables:  Record<string, string>   // per-recipient variables
  }>,
  sent_by:    string (uuid),
  from_mode:  'csm' | 'noreply',
  attachments?: Array<{ storage_path, file_name, file_size, file_type }>
}
Response: { sent: number, failed: number, logs: Array<{...}> }
```

---

## 2. Design System Reference

Follow these existing files as templates for style and patterns:

- **Settings page style:** `src/components/settings/SettingsAI.jsx` — inline `S` style object, section + label patterns
- **Email composer logic:** `src/components/email/EmailComposerModal.jsx` — `buildVars()`, `handleSend()`, attachment upload flow, result display
- **Email editor:** `src/components/email/EmailEditor.jsx` — import directly, no changes
- **Icons:** Always use `src/lib/icons.js` (`Icons.Send2`, `Icons.Users`, `Icons.Mail`, etc.)

---

## 3. Component Tree

```
SettingsEmailBlast
├── Header ("Envio de E-mail em Massa")
├── Layout (two columns: recipients left, composer right)
│
├── [LEFT] RecipientSelector
│   ├── SummaryPill ("X destinatários em Y empresas") + SelectAllToggle ("Selecionar pré-selecionados" / "Limpar seleção")
│   ├── ClientSearchInput (search active clients)
│   ├── ClientList
│   │   └── ClientRow (per client)
│   │       ├── ClientName + PreSelectedCount badge
│   │       ├── ContactChips (pre-selected: champion / técnico / has activity)
│   │       │   └── ContactChip (name + reason tags [★ champion] [⚙ técnico] [● atividade] + remove X)
│   │       └── AddContactDropdown (add any remaining contact for this client)
│   └── LoadingState / EmptyState
│
└── [RIGHT] EmailComposer
    ├── TemplatePicker (select from email_templates)
    ├── SubjectInput
    ├── EmailEditor (reuse component)
    ├── FromModePicker (csm / noreply — admin/manager only)
    ├── AttachmentSection (same logic as EmailComposerModal)
    ├── CSMSignaturePreview
    ├── PreviewButton → PreviewModal (sample with first recipient's vars)
    └── ActionBar
        ├── RecipientsCount badge
        └── SendButton (disabled if no recipients / no template / no subject / no body)
```

---

## 4. Data Contracts

### 4.1 Load all active clients with contacts (`useEmailBlastRecipients`)

Two queries run in parallel on mount:

```javascript
// Query A: all active clients with ALL their contact_links (champion and non-champion)
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

// Query B: all contact IDs that appear in any activity (lightweight distinct)
const { data: activityRows } = await supabase
  .from('activities')
  .select('contact_id')
  .not('contact_id', 'is', null)

const contactIdsWithActivities = new Set(activityRows.map(r => r.contact_id))
```

Returned shape processed into:
```javascript
[{
  clientId:    number,
  clientName:  string,            // fantasy_name || name
  contacts: [{
    contactId:   number,
    name:        string,
    email:       string,          // primary email or contacts.email fallback
    champion:    boolean,
    papel:       string,          // 'Decisor' | 'Influenciador' | 'Usuário' | 'Técnico'
    hasActivity: boolean,         // contactIdsWithActivities.has(contactId)
  }]
}]
// Only clients with at least one contact that has an email are shown
// contacts without email are excluded regardless of pre-selection criteria
```

### 4.2 Recipient state (managed in SettingsEmailBlast)

```javascript
// Map<clientId, Set<contactId>>
// Initialized with contacts matching any pre-selection criterion (champion | técnico | hasActivity)
// User can deselect any pre-selected contact — the Map is fully mutable after init
const [selectedByClient, setSelectedByClient] = useState(Map)
```

Flat array for sending:
```javascript
const recipients = [...selectedByClient.entries()].flatMap(([clientId, contactIds]) =>
  [...contactIds].map(contactId => {
    const client  = clientsMap.get(clientId)
    const contact = contactsMap.get(contactId)
    return {
      contact_id: contactId,
      client_id:  clientId,
      email:      contact.email,
      variables: {
        nome_contato:   contact.name,
        nome_empresa:   client.clientName,
        assunto:        subject,
        corpo_mensagem: body,
        csm_nome:       profile.name,
        csm_cargo:      profile.cargo || '',
        csm_telefone:   profile.phone || '',
        csm_email:      profile.email || '',
      }
    }
  })
)
```

### 4.3 Settings menu change (`SettingsPage.jsx`)

In `MENU_GROUPS`, `Comunicação` section (currently line 68):
```javascript
{ label: 'Comunicação', items: [
  { key: 'email-templates', label: 'Templates de E-mail', featureFlag: 'email_templates' },
  { key: 'email-blast',     label: 'Envio em Massa',      featureFlag: 'email_templates' },  // ADD
]},
```

In `SETTINGS_MENU_ICONS`:
```javascript
'email-blast': Icons.Send,   // verify icon name exists in src/lib/icons.js before using
```

In `renderContent()` switch/map:
```javascript
case 'email-blast': return <SettingsEmailBlast />
```

---

## 5. Implementation Phases

### Phase 1 — Recipient Selector + Settings Integration

**Status:** Not started

**Rationale:** A seleção de destinatários é o coração da feature. Precisamos carregar todos os clientes ativos com seus champions, construir a UI de seleção, e integrar no menu de configurações antes de trabalhar no composer.

**Scope:**
- Create `useEmailBlastRecipients.js` hook
- Create skeleton of `SettingsEmailBlast.jsx` with recipient selector UI
- Add `email-blast` to settings menu, icon, and `renderContent`
- Three-criteria pre-selection on load: champion, papel=Técnico, has activity (all deselectable)
- Search active clients to filter the list
- Expand/collapse per client to add contacts not yet selected
- ContactChip shows reason tags indicating why contact was pre-selected
- Summary pill showing total recipients and company count

#### Checklist

- [ ] **Hook:** Create `src/hooks/useEmailBlastRecipients.js`
  - [ ] Run Query A (clients + contact_links) and Query B (activity contact_ids) in parallel (see section 4.1)
  - [ ] Build `contactIdsWithActivities` Set from Query B results
  - [ ] Process into `clientRows` array; mark each contact with `champion`, `papel`, `hasActivity`
  - [ ] Filter out contacts with no resolvable email before returning
  - [ ] Return `{ clientRows, loading, error }`
- [ ] **Settings menu:** Modify `src/components/settings/SettingsPage.jsx`
  - [ ] Add `'email-blast': Icons.Send` to `SETTINGS_MENU_ICONS` (verify icon name in `src/lib/icons.js`)
  - [ ] Add `{ key: 'email-blast', label: 'Envio em Massa', featureFlag: 'email_templates' }` to `Comunicação` items
  - [ ] Add `import { SettingsEmailBlast } from './SettingsEmailBlast'`
  - [ ] Add `case 'email-blast': return <SettingsEmailBlast />` in `renderContent`
- [ ] **Component skeleton:** Create `src/components/settings/SettingsEmailBlast.jsx`
  - [ ] Import `useEmailBlastRecipients`, `useAuth`, `Icons`, `Button`
  - [ ] Initialize `selectedByClient` Map on `clientRows` load: auto-select contacts where `champion || papel === 'Técnico' || hasActivity` (use `isPreSelected` helper from section 1)
  - [ ] Render two-column layout (recipients left, composer placeholder right)
  - [ ] SummaryPill: total recipients + companies count
  - [ ] ClientSearchInput: filters `clientRows` by name
  - [ ] ClientRow per client: selected contact chips + add-more dropdown
  - [ ] ContactChip: shows name + small reason tags (`★` champion, `⚙` técnico, `●` atividade) + remove button (X) — removing a pre-selected contact is allowed
  - [ ] AddContactDropdown: shows contacts NOT yet in `selectedByClient` for that client, filtered by email existence
  - [ ] SelectAllToggle: "Selecionar pré-selecionados" / "Limpar seleção" button next to SummaryPill — toggles selection for champion/técnico/has-activity contacts only
- [ ] **Build:** `npm run build` with no errors

#### Implementation Log (Phase 1)

| Date | Commit | Files | Summary |
|---|---|---|---|
| 2026-06-01 | `f8b857e` | SettingsEmailBlast.jsx, useEmailBlastRecipients.js, SettingsPage.jsx, icons.js, email-blast-sdd.md | Phase 1 recipient selector + menu integration |
| 2026-06-01 | `4fb3b09` | CHANGELOG.md, email.md | Documentation (changelog + module doc update) |
| 2026-06-01 | `df62a4e` | SettingsEmailBlast.jsx | Select all toggle, dropdown overflow fix, domain warning fix |
| 2026-06-01 | `5959e5c` | SettingsEmailBlast.jsx | Fix TDZ error on selectedContactIds |

---

### Phase 2 — Email Composer

**Status:** Not started (requires Phase 1 complete)

**Rationale:** Com os destinatários selecionados, adicionamos o painel direito de composição de e-mail. Reutilizamos EmailEditor, a lógica de templates, seleção de remetente e upload de anexos já presentes em EmailComposerModal, portanto sem duplicação de código complexo.

**Scope:**
- Template picker (active templates from `email_templates`)
- Subject input
- EmailEditor component (imported directly)
- AI Rewrite (`handleRewrite` logic ported from `EmailComposerModal`)
- From mode picker (csm / noreply — admin/manager only)
- Attachment upload (same flow as `EmailComposerModal.handleSend`)
- CSM signature preview
- Preview modal (sample using first recipient's variables)

#### Checklist

- [ ] **Profile load:** Fetch sender profile on mount (`profiles` table, same query as `EmailComposerModal` line 73)
- [ ] **Templates load:** Fetch active templates on mount (same query as `EmailComposerModal` line 89)
- [ ] **Template picker:** `<select>` for template selection; auto-populates subject from template
- [ ] **Subject input:** text input, controlled
- [ ] **EmailEditor:** Import and mount `<EmailEditor value={body} onChange={setBody} onRewrite={handleRewrite} rewriting={rewriting} />`
- [ ] **AI Rewrite:** Port `handleRewrite()` from `EmailComposerModal` (lines 231-272); uses `openrouter-proxy` edge function
- [ ] **From mode picker:** radio csm / noreply, same visibility rules (admin/manager, @donc.com.br check)
- [ ] **Attachments:** Port full attachment flow (handleFileSelect, removeAttachment, upload logic); use `blast_temp/` prefix for storage path instead of `{client.id}/email_temp/`
- [ ] **CSM signature preview:** same `div` as `EmailComposerModal` line 614
- [ ] **Preview modal:** renders `mergeTags(template.html_body, buildVarsForContact(firstRecipient))` in iframe; shows first recipient's name/company as sample
- [ ] **canSend validation:** `recipients.length > 0 && templateId && subject.trim() && body.trim() && allRecipientsHaveEmail`
- [ ] **Build:** `npm run build` with no errors

#### Implementation Log (Phase 2)

| Date | Commit | Files | Summary |
|---|---|---|---|
| 2026-06-01 | `f8b857e` | SettingsEmailBlast.jsx | Email composer (template picker, EmailEditor, AI rewrite, attachments, from-mode, preview) |

---

### Phase 3 — Send & Results

**Status:** Not started (requires Phase 2 complete)

**Rationale:** O envio reutiliza exatamente a mesma Edge Function `send-email` — sem modificações de backend. A diferença está em construir o array `recipients[]` com variáveis por destinatário e exibir o resultado consolidado.

**Scope:**
- `handleSend()` function: upload attachments → build recipients array → call `send-email`
- Sending state with progress indicator
- Result display: sent count, failed count, per-recipient errors
- "Enviar nova campanha" reset button

#### Checklist

- [ ] **handleSend:** Build `recipients` array from `selectedByClient` map (data contract section 4.2)
  - [ ] For each recipient: inject `nome_contato`, `nome_empresa` alongside CSM vars
  - [ ] Upload attachments to `blast_temp/${Date.now()}_${safeName}` storage path before send
  - [ ] Call `send-email` Edge Function with full payload
- [ ] **Sending state:** disable Send button, show spinner, "Enviando X e-mails..."
- [ ] **Result state:** show sent/failed counts; list per-failed recipient with error message
- [ ] **Reset:** "Enviar nova campanha" button clears composer fields but keeps recipient selection
- [ ] **Cleanup on error:** remove uploaded attachments from storage if send fails (same logic as `EmailComposerModal.reset` lines 163-168)
- [ ] **Build:** `npm run build` with no errors

#### Implementation Log (Phase 3)

| Date | Commit | Files | Summary |
|---|---|---|---|
| 2026-06-01 | `f8b857e` | SettingsEmailBlast.jsx | handleSend + recipients array build + result display + reset |

---

## 6. Current Checkpoint

### Production state

- Feature does not exist yet. Nothing is deployed.
- `send-email` Edge Function is production-ready and needs no changes.
- `email_templates`, `contact_links.champion`, `email_logs` tables all exist and are in production.

### Architectural decisions

| Decision | Rationale |
|---|---|
| Página de settings, não modal | O envio em massa requer mais espaço de tela para gerenciar dezenas de clientes/contatos. Um modal seria limitado. |
| Reutilizar `send-email` sem modificações | A Edge Function já suporta `recipients[]` com variáveis por destinatário. Criar uma nova seria redundância. |
| `selectedByClient` como Map<clientId, Set<contactId>> | Permite atualização eficiente por cliente sem re-renderizar a lista inteira; facilita o toggle de contatos individuais. |
| Três critérios de pré-seleção (champion, técnico, tem atividade) | Cobre os perfis mais relevantes: decisores/key accounts (champion), integradores técnicos (técnico), e contatos já engajados (atividade registrada). Todos são deselectable. |
| Pré-seleção é mutable pelo usuário | O Map é inicializado com os critérios, mas o usuário pode remover qualquer contato. Não há bloqueio — a pré-seleção é apenas conveniência, não regra. |
| `contactIdsWithActivities` como Set separado (query B) | Consultar `activities.contact_id` separadamente é mais leve do que fazer join direto no carregamento de clientes. O Set permite lookup O(1) no processamento. |
| `nome_contato` e `nome_empresa` como variáveis por destinatário | Permite personalização da mensagem por contato/empresa mesmo em envio em massa, usando a infra já existente de `mergeTags`. |
| Feature flag reutilizada (`email_templates`) | Não há necessidade de nova flag — o público-alvo é o mesmo. Reduz complexidade de configuração. |
| Storage path `blast_temp/` para anexos | Isola arquivos temporários do blast dos anexos de atividades individuais; facilita cleanup futuro se necessário. |
| Sem paginação no carregamento de clientes | Para o volume atual do doncCX (<200 clientes ativos) a query única é suficiente e simplifica a UI. Se escalar, adicionar virtualized list. |

---

## 7. Project Gotchas — do not skip

- **Icons:** Never import directly from `lucide-react`. Always use `src/lib/icons.js`. Verify icon name exists before using (grep for `Send2` or alternatives).
- **Supabase deploy:** After `npx supabase functions deploy`, "Verify JWT" is automatically re-enabled — disable manually in Dashboard. Run `node scripts/fix-supabase-urls.js` after every deploy. (No deploy needed for this feature — backend unchanged.)
- **Branch:** Worktree disabled. All work goes directly to `main`.
- **Edge Function timeout:** `send-email` processes emails sequentially (~400ms each via Resend). At ~60s Supabase timeout, safe limit is ~100-120 recipients per call. If recipient count exceeds 100, show a warning banner in the UI before sending.
- **Attachment storage path:** Current `EmailComposerModal` uses `{client.id}/email_temp/...`. For blast use `blast_temp/...` to avoid conflict — no single client context exists.
- **`contact_emails` vs `contacts.email`:** Some contacts have `contact_emails` array with `is_primary=true`; others only have `contacts.email`. Always use the getContactEmail pattern: primary email first, fallback to `contacts.email`.
- **`fantasy_name` fallback:** Always display `fantasy_name || name` for clients throughout the UI.
- **`papel` exact string:** The técnico pre-selection criterion uses `papel === 'Técnico'` — capital T, with cedilla-free accent. The enum values in the codebase are `'Decisor'`, `'Influenciador'`, `'Usuário'`, `'Técnico'` (see `ClientTabContatos.jsx` line 20 and `FreshdeskPendingPage.jsx` line 643).
- **AI Rewrite endpoint:** Uses `openrouter-proxy` edge function, not a direct Anthropic call. Body format: `{ messages: [...], max_tokens: 2000 }`.

---

## 8. LLM Instructions

When resuming this document for implementation:

1. Read **Section 0 (Current System State)** — understand what exists and what will be created.
2. Read **Section 4 (Data Contracts)** carefully — especially the `selectedByClient` Map structure and the `recipients` array shape for the Edge Function call.
3. Identify the **active phase** via its checklist status.
4. Implement item by item. Mark ✅ when done and verified.
5. After each significant item, run `npm run build` to ensure nothing broke.
6. At the end of the phase, fill in the **Implementation Log**.
7. Update the **Checkpoint** section with the new production state.
8. **Do not modify `supabase/functions/send-email/index.ts`** — it is complete and production-ready.
9. **Reuse `EmailEditor` component directly** — do not re-implement the editor or AI rewrite from scratch.

### Technical Summary Template (fill at the end of each phase)

```
### Technical Summary — Phase X

**Commits:** hash1, hash2
**Files created:** [list]
**Files modified:** [list]
**Files deleted:** [list]

**Decisions:**
- [decision and rationale]

**Issues found:**
- [problem and solution]

**Pending items:**
- [items not covered or deferred]
```
