# Module — Clients

## Purpose
The Clients module provides the primary user interface for managing customer records. It lets users list, create, edit, and view detailed information about clients, as well as perform operational actions (onboarding, reporting, support, usage tracking) through a set of tabbed views. It sits under `src/components/clients/` and is routed from the main app (`src/App.jsx`), acting as the frontend entry point for all client‑related data stored in Supabase.

## Responsibilities
- Render a searchable list of clients (search matches `name` or `fantasy_name`).
- Open a detailed view for a selected client.
- Offer create and edit forms for client records.
- Organize client information into top‑level tabs (Overview, Activities, Contacts, Health, Operacional).
- Within the Operacional tab, provide sub‑tabs for operational data (Dados, Onboarding, Projetos, Relatórios, Suporte, Uso).
- Persist changes to Supabase via insert/update calls.
- Display modals for registering operational data.

## Module Structure
| Component | Responsibility |
|----------|-----------------|
| `ClientsPage.jsx` | Root page that lists clients and navigates to a client detail view. |
| `ClientDetail.jsx` | Container for a single client’s detailed view; renders tab navigation. |
| `ClientForm.jsx` | **Legacy** modal form (used while `empresas_form_v2` flag is off). |
| `ClientFormContent.jsx` | Shared v2 form body — 4 tabs (Dados, Endereço, Contrato, Operacional). Rendered by `ClientFormPage` and `EmpresasV2Page`. |
| `form/FormSection.jsx` | Flat form-section primitive (title + hairline + body; optional collapse). |
| `form/InfoHint.jsx` | Discreet `?` popover — the only place a section carries an explanation. |
| `sections/ContractChargesSection.jsx` | "Evolução da recorrência (MRR)" — per-period recurring value editor + month-by-month preview. |
| `sections/EventuaisSection.jsx` | "Cobranças Eventuais" — one-off charges with installments. |
| `sections/OsTiersSection.jsx` | "Faixas de preço por OS" — volume-band pricing (only when `billing_type = por_os`). |
| `TemperaturaCSM.jsx` | UI widget (purpose not identifiable from provided code). |
| **Tabs** (`tabs/`) | |
| `ClientTabOverview.jsx` | Shows a summary overview and quick actions for the client. |
| `ClientTabActivities.jsx` | Displays the client’s activity timeline. |
| `ClientTabContatos.jsx` | Lists contact persons linked to the client. |
| `ClientTabHealth.jsx` | Presents health‑score metrics. |
| `ClientTabOperacional.jsx` | Hosts operational sub‑tabs and the Register Data modal. |
| **Operacional Sub‑Tabs** (`tabs/operacional/`) | |
| `ClientSubDados.jsx` | Shows operational data metrics. |
| `ClientSubOnboarding.jsx` | Walk‑through UI for client onboarding steps. |
| `ClientSubProjetos.jsx` | Lists projects associated with the client. |
| `ClientSubRelatorios.jsx` | Provides access to client‑specific reports. |
| `ClientSubSuporte.jsx` | Interface for support tickets / interactions. |
| `ClientSubUso.jsx` | Displays usage statistics. |
| `ClientSubAnexos.jsx` | Lista e gerencia anexos do cliente (atividades + evidências). |
| `RegistrarDadosModal.jsx` | Modal dialog for recording new operational data. |
| **Style definitions** | |
| `OnboardingStyles.js` | Exports a `styles` object used by onboarding‑related components (timeline, activity list, pending panels, response picker). |

## UI Architecture
- **ClientsPage** renders a grid/list of client cards. Selecting a card navigates to **ClientDetail**.
- **ClientDetail** shows a header with client meta‑info and a top‑level tab bar (`overflow-x-auto overflow-y-hidden` — trava o eixo vertical para não exibir a scrollbar de 6px causada pelo `border-b-2 -mb-px` das abas; ver `src/index.css:71`).
- Each top‑level tab loads its own component (Overview, Activities, Contacts, Health, Operacional).
- **Operacional** tab contains a secondary tab bar for sub‑tabs (Dados, Onboarding, …) and can open **RegistrarDadosModal**.
- **ClientFormContent** (v2 form, rotas `/empresas/nova` e `/empresas/:id/editar`) usa o mesmo padrão na barra `Dados da Empresa → Endereço → Contrato → Operacional` (`ClientFormContent.jsx:506`).
- All components consume the `styles` object from `OnboardingStyles.js` for consistent layout and theming.

### Contact Panel (ClientTabContatos)

The Contacts tab (`ClientTabContatos`) displays client contacts with:
- **Layout:** CSS grid with 3 fixed columns (Name/Role, Contact Info, Actions)
- **Contact cards:** Show name, role, email, phone; badge for primary contact; action buttons (edit, delete, send email)
- **Email integration:** Each contact has "Enviar e-mail" button (`Icons.Mail`) that opens `EmailComposerModal` with preselected recipient
- **Drawer:** Enlarged contact drawer for better editing UX
- **Vertical alignment:** Actions aligned with `self-center` for consistent positioning

## Data Flow
1. `ClientsPage` uses a custom hook (e.g., `useClients`) to fetch client list from Supabase and stores it in local state.
2. Clicking a client triggers navigation to `/clients/:id`.
3. `ClientDetail` fetches the specific client record (and possibly related entities) via `useClient(id)`.
4. Tab components receive the client data as props or via context and may trigger additional Supabase queries for their specific slice (activities, contacts, health scores, operational data).
5. `ClientForm` submits new or edited data to Supabase (`insert`/`update`). On success the client list/detail cache is refreshed.
6. `RegistrarDadosModal` captures operational input, posts it to Supabase, and on success signals the parent tab to reload its data.
7. State is lifted to the highest component that needs it (`ClientDetail`) and passed down; loading/error flags are handled locally in each component.

### Client Lifecycle Model
Clients now support lifecycle classification through the `lifecycle_stage` field. This field defines how the client is treated across the system.

**Typical values:**
- `lead` — Early-stage company without active usage
- `prospect` — Qualified opportunity
- `cliente` — Active customer using system modules
- `parceiro` — Partner organisation
- `teste` — Temporary or internal account

The lifecycle stage influences UI behavior and determines which features are available for each client.

### Clients Without Services
Clients can now be created without selecting services or solutions. This enables:
- Lead creation
- Prospect registration
- Pre-contract workflows

Catalog assignment is no longer mandatory at client creation. However, when `lifecycle_stage` is set to "cliente", the system may require at least one service to be selected for validation purposes.

### Automatic Catalog Initialization
When a client is created with `lifecycle_stage = "cliente"`, the system may initialize default catalog entries based on selected solutions. If `lifecycle_stage` is not "cliente", catalog initialization is skipped to prevent unnecessary data for leads and prospects.

### Catalog Item Types
Catalog items are divided into two types:

**servico** (Service):
- Assistência
- Entrega
- Montagem
- Coleta
- Instalação

**solucao** (Solution):
- Agenda
- Comunicação
- Operacional
- Métricas
- Roteirizador

Each client may be associated with multiple catalog items across both types.

### Lifecycle Impact on UI
UI behavior changes based on `lifecycle_stage`:

- If `lifecycle_stage` is not "cliente":
  - Health Score may be hidden
  - Operational data may be hidden
  - Some analytics may be disabled
  - "Operacional" and "Health Score" tabs are disabled in the detail view

This ensures early-stage clients do not see irrelevant information and the interface remains focused on appropriate actions for each lifecycle stage.

## Dependencies
**Internal**
- `src/lib/supabaseClient.js` – Supabase client instance.
- Custom hooks (`useClients`, `useClient`, `useActivities`, `useHealth`, etc.).
- Shared UI components (buttons, icons, modal wrapper) from the UI library.
- `OnboardingStyles.js` for style objects.
- `react-router-dom` for navigation.
- React Query / TanStack Query (likely) for data fetching/caching.

**External**
- `react`, `react-dom`.
- `@supabase/supabase-js`.
- `tailwindcss` (styles map to Tailwind classes).
- `@tanstack/react-query` (if used).

## Integration Points
- **Onboarding** – uses timeline and style definitions from `OnboardingStyles.js`.
- **Activities** – pulls activity feed data displayed in `ClientTabActivities`.
- **Contacts** – integrated with the contacts module for client‑person linking.
- **Health** – shares health‑score widgets with other dashboards.
- **Operational Sub‑Tabs** – interact with reporting, support, and usage modules via their respective components.

## Main User Flows
### Flow: Create Client
1. User opens Clients page and clicks “New Client”.
2. `ClientForm` opens (modal or route).
3. User fills fields; client‑side validation runs.
4. On submit, form calls Supabase `insert`.
5. List refreshes to show the new client.

### Flow: Edit Client
1. From list or detail view, user selects “Edit”.
2. `ClientForm` loads existing data.
3. User modifies fields and submits.
4. Form calls Supabase `update`.
5. Detail view updates with new data.

### Client Save Resilience (2026-06-15)
The `useClients.js` mutation was hardened against race conditions and RLS failures:

- **Validation:** when `lifecycle_stage === 'cliente'`, both `selectedCatalog` (service chips in Operacional tab) and `modPricing` (solution toggles in Contrato tab) are checked. Previously only `selectedCatalog` was checked, blocking save for clients with only solutions.
- **Save strategy for `client_catalog`:** replaced `delete-all + insert` with **selective delete** (only rows removed from selection) + **upsert** (`onConflict: client_id,catalog_item_id`). This prevents 409 Conflict errors from trigger rollbacks and eliminates duplicates.
- **Deduplication:** `catalogItems` is deduplicated by `catalog_item_id` via `Map` — prevents PostgreSQL `ON CONFLICT DO UPDATE cannot affect row a second time` error when the same `catalog_item_id` appears in both `selectedCatalog` and `modPricing`.
- **Error handling:** all `delete`/`insert`/`upsert` calls check and throw on error; `saveModPricing` has an explicit `onError` toast handler.
- **Root cause:** `client_catalog_history` had RLS enabled but no INSERT policy. The trigger `trg_client_catalog_history` (AFTER INSERT/UPDATE on `client_catalog`) tried to insert into history and failed, rolling back the entire transaction. Fixed by migration `20260615000001`.

### Empresas Form v2 — dedicated page (2026-09-02)

The company create/edit form was moved out of the cramped `<Modal>` (`ClientForm.jsx`) into a
dedicated page. Body logic lives in the shared **`ClientFormContent.jsx`**; two thin page shells
render it:

| Route | Shell | Gate |
|-------|-------|------|
| `/empresas/nova`, `/empresas/:id/editar` | `src/pages/ClientFormPage.jsx` | feature flag `empresas_form_v2` (off → `<Navigate to="/empresas">`) |
| `/labs/empresas_v2`, `/labs/empresas_v2/:id/editar` | `src/pages/labs/EmpresasV2Page.jsx` | `<AdminOnlyRoute>` (no flag) |

While the flag is off, `ClientsPage`/`ClientDetail` still open the legacy `<ClientForm>` modal
(`isEnabled('empresas_form_v2', effectiveRole) ? navigate(...) : setShowForm(true)`). The labs
shell adds an amber banner and a **"Editar empresa existente"** search (`useAllClients`) that links
to `/labs/empresas_v2/:id/editar`.

**Tabs** (new order): `Dados da Empresa → Endereço → Contrato → Operacional`.

**Contrato tab** (business-language UI, no table/column names on screen):
- *Plano de cobrança* — `billing_type` (por licença / por OS), valor base, piso, datas, índice.
- *MRR base* (card navy) — `piso × valor base`.
- *Status de cobrança* — 3 states `ativo | suspenso | nao_bilhetavel` ("Não cobrar"). `contract_active`
  is derived on save (`= billing_status === 'ativo'`); `mrr` is written as `0` when not `ativo`.
- *Evolução da recorrência (MRR)* — `ContractChargesSection`: contiguous per-period rules
  (`from..to`, mode `absolute | percent`), expanded to one `contract_charges` row per month on save
  via `expandRulesToCharges` (`src/lib/contractRules.js`). Month-by-month preview.
- *Cobranças Eventuais* — `EventuaisSection`: one-off charges, optional installments →
  `contract_charges` rows sharing an `installment_group`.
- *Faixas de preço por OS* — `OsTiersSection` (only `por_os`) → `billing_os_tiers`.
- *Divisão do MRR por produto* — per-solution split of the base MRR (`module_pricing`,
  `mode: 'rateio'` — a breakdown of the total, **not** additive).

**Operacional tab** — stage, unidades, ABC, ERP, TI, service/solution chips, and the 10-question
**Handoff comercial → onboarding** (`client_handovers`). The handoff is **never required** — no
`lifecycle_stage` blocks the save on it; answers persist when any field is filled.

**Persistence note:** `ClientFormContent` seeds its form state from the `client` prop in a
`useState` initializer (runs once). The page shells pass `key={isEdit ? 'edit-' + client.id : 'new'}`
so React remounts the form when the target company changes; `handleSubmit` ends with
`qc.removeQueries` for `['client' | 'contract_charges' | 'billing_os_tiers', id]` so the next edit
mount reads fresh server data. The child-table mutations accept a `clientId` override in the
payload (the create flow has no `client?.id` at mount).

### Flow: View Client Detail
1. User clicks a client card.
2. Router loads `ClientDetail` with client ID.
3. Detail component fetches client data and renders tab bar.
4. User switches tabs; each loads its own data as needed.

### Flow: Navigate Between Tabs
1. Within `ClientDetail`, user selects a top‑level tab.
2. Corresponding component mounts and fetches data.
3. In Operacional tab, user can switch to sub‑tabs (Dados, Onboarding, etc.).

### Flow: Register Operational Data
1. Inside Operacional tab, user clicks “Register Data”.
2. `RegistrarDadosModal` opens.
3. User fills form and submits.
4. Modal posts to Supabase; on success the Operacional tab refreshes its data.

## State Management
- Local component state (`useState`) for UI flags (active tab, modal open). 
- Custom hooks (likely built on React Query) manage server‑state, exposing `isLoading`, `isError`, `data`, and mutation functions.
- No explicit global context observed in the provided files; auth/context likely lives higher in `src/App.jsx`.

## Error Handling
- Form validation performed locally before any API call.
- Supabase request errors are caught in hooks; components display generic error messages.
- Modal submission errors are shown within the modal UI.
- No dedicated global error boundary was identified.

## Performance Considerations
- Data for each tab is fetched lazily, reducing initial load.
- Operacional sub‑tabs could trigger multiple simultaneous requests if all are rendered; consider loading on demand.
- Large client lists may benefit from pagination or virtual scrolling (not observed).

## Known Risks
- Potential over‑fetching when multiple tabs load data simultaneously.
- Tight coupling of UI components to Supabase queries hampers testability.
- Lack of TypeScript/PropTypes increases risk of runtime type errors.
- No explicit error UI for complex failures; users may see generic messages.

## Future Improvements
1. Add a central error boundary to capture unexpected failures.
2. Implement code‑splitting (`React.lazy`) for heavy tab components.
3. Introduce pagination or virtualized list for client list view.
4. Migrate to TypeScript or add PropTypes for better type safety.
5. Consolidate data fetching into a single client‑detail query to reduce request count.
6. Document and standardize custom hooks for clearer reuse.

## File Reference Map
- `src/components/clients/ClientDetail.jsx`
- `src/components/clients/ClientForm.jsx` (legacy modal)
- `src/components/clients/ClientFormContent.jsx` (shared v2 form body)
- `src/components/clients/form/FormSection.jsx`
- `src/components/clients/form/InfoHint.jsx`
- `src/components/clients/sections/ContractChargesSection.jsx`
- `src/components/clients/sections/EventuaisSection.jsx`
- `src/components/clients/sections/OsTiersSection.jsx`
- `src/pages/ClientFormPage.jsx`
- `src/pages/labs/EmpresasV2Page.jsx`
- `src/components/clients/ClientsPage.jsx`
- `src/components/clients/TemperaturaCSM.jsx`
- `src/components/clients/tabs/ClientTabActivities.jsx`
- `src/components/clients/tabs/ClientTabContatos.jsx`
- `src/components/clients/tabs/ClientTabHealth.jsx`
- `src/components/clients/tabs/ClientTabOperacional.jsx`
- `src/components/clients/tabs/ClientTabOverview.jsx`
- `src/components/clients/tabs/operacional/ClientSubDados.jsx`
- `src/components/clients/tabs/operacional/ClientSubOnboarding.jsx`
- `src/components/clients/tabs/operacional/ClientSubProjetos.jsx`
- `src/components/clients/tabs/operacional/ClientSubRelatorios.jsx`
- `src/components/clients/tabs/operacional/ClientSubSuporte.jsx`
- `src/components/clients/tabs/operacional/ClientSubUso.jsx`
- `src/components/clients/tabs/operacional/ClientSubAnexos.jsx`
- `src/components/clients/tabs/operacional/RegistrarDadosModal.jsx`
- `src/components/onboarding/OnboardingStyles.js`