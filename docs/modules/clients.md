# Module — Clients

## Purpose
The Clients module provides the primary user interface for managing customer records. It lets users list, create, edit, and view detailed information about clients, as well as perform operational actions (onboarding, reporting, support, usage tracking) through a set of tabbed views. It sits under `src/components/clients/` and is routed from the main app (`src/App.jsx`), acting as the frontend entry point for all client‑related data stored in Supabase.

## Responsibilities
- Render a searchable list of clients.
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
| `ClientForm.jsx` | Form for creating or editing a client record. |
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
| `RegistrarDadosModal.jsx` | Modal dialog for recording new operational data. |
| **Style definitions** | |
| `OnboardingStyles.js` | Exports a `styles` object used by onboarding‑related components (timeline, activity list, pending panels, response picker). |

## UI Architecture
- **ClientsPage** renders a grid/list of client cards. Selecting a card navigates to **ClientDetail**.
- **ClientDetail** shows a header with client meta‑info and a top‑level tab bar.
- Each top‑level tab loads its own component (Overview, Activities, Contacts, Health, Operacional).
- **Operacional** tab contains a secondary tab bar for sub‑tabs (Dados, Onboarding, …) and can open **RegistrarDadosModal**.
- All components consume the `styles` object from `OnboardingStyles.js` for consistent layout and theming.

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
- `src/components/clients/ClientForm.jsx`
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
- `src/components/clients/tabs/operacional/RegistrarDadosModal.jsx`
- `src/components/onboarding/OnboardingStyles.js`