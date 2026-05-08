# Module — Projects

## Purpose
The Projects module provides a Kanban‑style board for planning, tracking, and managing **project** records, as well as the detailed onboarding flow management via **OnboardingDetailPage**. Projects are linked to clients, have a type (onboarding, expansao, interno), status (planejado, em_andamento, concluído, suspenso), milestones, and onboarding flows. The module lets users view project statistics, filter by client, CSM, type, and deadline, drag‑and‑drop projects between status columns, and create or edit projects via a modal dialog.

## Responsibilities
- Display a board with columns for each project status.
- Provide filtering controls (client search, CSM, type, deadline).
- Show summary cards with counts for active, blocked, attention, overdue, and completed projects.
- Allow drag‑and‑drop to change a project's status.
- Persist status changes via `useUpdateProjectStatus` mutation.
- Open **ProjectModal** for creating a new project or editing an existing one.
- Render onboarding detail page with timeline, activities, and fase management.
- Load required reference data (clients, profiles/CSMs, onboarding configurations, catalog items).
- Compute and display statistical drawers (active, blocked, etc.) on demand.

## Module Structure
| File | Responsibility / UI role |
|------|--------------------------|
| `ProjectsPage.jsx` | Main page component: loads projects, onboardings, clients, profiles; renders filter bar, stats cards, Kanban board with drag‑and‑drop; opens the `ProjectModal`. |
| `ProjectModal.jsx` | Modal dialog for creating or editing a project. Handles form state, client selection (combobox for global create), project type selection, capability (capabilities) selection for onboarding/expansao projects, and submission via appropriate mutation hooks. |
| `OnboardingDetailPage.jsx` | Detailed view of an onboarding project: header, timeline (fases), activities list with phase filtering, fase management panel with drag‑and‑drop. |
| `OnboardingStyles.js` | CSS‑in‑JS style objects for onboarding UI components (timeline, activity list, pending items, response picker). |

## Project Types
- **onboarding** – Implantação inicial: Create a new client onboarding flow with fases e capacidades.
- **expansão** – Expansão/upsell to existing client.
- **internal** – Internal project not tied to a client.

## Project Templates
### Overview
Project Templates define a reusable structure for project creation. They allow standardized project initialization across multiple clients. Templates include phases, activities, and default configuration.

### Template Structure
Templates follow a hierarchical structure:

**Template** → **Phases** → **Activities**

| Table | Purpose |
|-------|---------|
| `project_templates` | Base template record: name, type, description, is_default flag |
| `project_template_fases` | Links template to fase types (fase_type_id) |
| `project_template_activities` | Links template/fase to activity types (activity_type_id, fase_type_id) |

Phases are derived from `onboarding_fase_types` catalog. Activities are derived from `onboarding_activity_types` catalog.

### Default Template Behavior
One template per type can be marked as default (`is_default`). Default templates are used automatically when new projects or onboardings are created. When marking a template as default, any existing default of the same type is automatically cleared.

### Project Creation from Templates
1. Template selected (manual selection or automatic via default for project type)
2. Project created with selected template reference
3. Phases generated from template's fase associations
4. Activities generated from template's activity associations
5. Project becomes operational with pre-populated workflow structure

### Template Management
Users can:
- Create templates with name, type, description, and default flag
- Edit template metadata
- Delete templates
- Toggle default status per template type
- Add/remove phases from templates
- Add/remove activities within each phase

## Onboarding Flow Model
### criação
When creating an onboarding/expansão project via `ProjectModal`:
1. A new `projects` record is created with the selected type.
2. A new `onboardings` record is created, linked to the project via `project_id`.
3. Fases are initialized from `onboarding_fase_types` catalog and inserted into `onboarding_fases`.
4. The first fase is marked as `ativa` and set as `fase_atual_id` in the onboarding record.

### Fase Types Catalog
`onboarding_fase_types` table stores available fase templates:
| Column | Description |
|-------|-------------|
| `name` | Fase name (e.g., "Kickoff", "Levantamento", "Go-Live") |
| `is_milestone` | Boolean – if true, this is a marco (requires evidence/justificativa) |
| `requires_evidence` | Boolean – if true, evidence is required to conclude |

### Fases Per Project
`onboarding_fases` stores fases for each onboarding:
| Column | Description |
|-------|-------------|
| `onboarding_id` | FK to onboardings |
| `fase_type_id` | FK to onboarding_fase_types |
| `display_order` | Order in the timeline |
| `status` | `pendente` / `ativa` / `concluida` |
| `planned_start` | Planned start date |
| `planned_end` | Planned completion date |
| `actual_start` | Actual start (set when fase becomes ativa) |
| `actual_end` | Actual end date |
| `occurred_at` | Date the milestone occurred |
| `justificativa` | Justification/memo for milestone completion |

### Situação Geral do Onboarding

`situacao_geral` é um campo calculado em `onboardings` que reflete o estado geral do projeto:

| Valor | Condição |
|-------|----------|
| `travado` | Pendência bloqueadora ativa |
| `atencao` | Pendência com prazo vencido OU marco com `planned_end` vencido sem conclusão |
| `fluindo` | Nenhuma das anteriores |

O valor é recalculado automaticamente por triggers:
- `trg_update_situacao_geral_on_pendencias` — após mudanças em `onboarding_pendencias`
- `trg_update_situacao_geral_fases` — após mudanças em `onboarding_fases` (status, planned_end)

### Fase Status Behavior
| Status | Allowed Actions | Description |
|--------|---------------|-------------|
| `pendente` | Salvar (planned dates, justificativa, evidências), Tornar ativa | Waiting to start |
| `ativa` (non‑milestone) | Salvar, Voltar para pendente, Registrar conclusão | In progress |
| `ativa` (milestone) | Salvar, Voltar para pendente, Registrar conclusão (with evidence/justificativa) | In progress (requires evidence) |
| `concluida` | Reabrir fase | Finished |

### Activities
`onboarding_activities` stores tasks within each fase:
| Column | Description |
|-------|-------------|
| `fase_id` | FK to onboarding_fases |
| `title` | Activity title |
| `status` | `pendente` / `em_andamento` / `concluida` |
| `due_date` | Deadline |
| `completed_at` | Completion timestamp |
| `responsible_contato_id` | FK to contacts |
| `responsible_interno_id` | FK to profiles |

Activities can be searched inline via `onboarding_activity_types` catalog. New types can be created inline.

### Pendências (Sub‑tasks)
`onboarding_pendencies` stores sub‑tasks under activities:
| Column | Description |
|-------|-------------|
| `activity_id` | FK to onboarding_activities |
| `title` | Pendência title |
| `priority` | `bloqueadora` / `alta` / `normal` |
| `status` | `criada` / `em_andamento` / `aguardando_validacao` / `encerrada` |
| `due_date` | Deadline |
| `resp_contato_id` / `resp_interno_id` | Responsible |

## UI Architecture
### ProjectsPage
- **PageHeader** with a "+ Novo Projeto" button that toggles `ProjectModal`.
- **Stats cards** (`StatCard`) display counts for various derived groups; clicking a card opens a `StatsDrawer` showing the underlying items.
- **Filter bar** provides a searchable client dropdown, CSM selector (admin/manager only), type selector, and deadline selector; filters are applied via a `useMemo` derived list.
- **Kanban board** uses `@hello-pangea/dnd` (`DragDropContext`, `Droppable`, `Draggable`). Each column corresponds to a project status defined in `COLUMNS`. Projects are draggable; on drop, `onDragEnd` updates local state and triggers `updateStatus.mutate`.

### ProjectModal
- Two layout modes:
  - **Global create** (no clientId) – shows a combobox to select a client.
  - **Contextual** (clientId supplied or editing) – shows a pill with the current client.
- Form fields: type (segmented control), title, description/notes, responsible (CSM), start/end dates, status, and for onboarding/expansao projects, capability chip selection, kickoff date, and phase info.

### OnboardingDetailPage
- **Header**: project title, client name, badges (type, context, situação, CSM), dates row (start date, Go-Live previsto).
- **Timeline**: PhaseCircles connected by connectors – each circle shows fase name, planned date, and status (color-coded: concluida=green, ativa=blue with glow, pendente=gray).
- **Activities**: List with fase filter tabs (abas), each activity shows title, status select, responsible, due date (overdue in red+bold), and pending count badge.
- **Fase Management**: Drag‑and‑drop to reorder fases, add/remove fases, edit is_milestone and requires_evidence.
- **Modal de Fase**: Form to edit planned dates, actual dates, justification, upload evidence, change status.

### OnboardingStyles
```js
export const styles = {
  timeline: { /* timeline related styles */ },
  activity: { /* activity list styles */ },
  pending:  { /* pending tasks styles */ },
  respPicker: { /* response picker styles */ },
}
```
Each top‑level key contains nested objects that map directly to JSX elements via inline `style` props.

## Data Flow
### Projects Board
1. **Initial data loading** – `useAllProjects`, `useAllOnboardings`, `useClients`, `useProfiles`, `useCatalogItems`, `useOnboardingConfig` fetch data in parallel.
2. **Filtering** – `useMemo` builds `filtered` based on selected client, CSM, type, and deadline criteria.
3. **Stats calculation** – Additional `useMemo` hooks compute subsets for active, blocked, attention, overdue, and month‑concluded projects.
4. **Drag‑and‑drop** – `onDragEnd` updates the local copy of projects (`setLocal`) and calls `updateStatus.mutate({ id, status })` to persist the change.

### Onboarding Detail
1. **Load** – `useOnboarding(id)` fetches the onboarding with all related data (fases, activities, pendencies).
2. **Phase selection** – Default selects the fase with status `ativa`. Abas filter activities by fase_id.
3. **Fase actions** – Complete/milestone functions auto‑advance to the next fase.
4. **Go‑Live completion** – When Go‑Live is concluded, a task is auto‑created to review the client's stage.

## Dependencies
- **Hooks**: `useAllProjects`, `useUpdateProjectStatus`, `useAllOnboardings`, `useClients`, `useProfiles`, `useCatalogItems`, `useOnboarding`, `useOnboardingCapabilities`, `useCreateOnboardingFlow`, `useUpdateOnboardingFlow`, `useCreateInternalProject`, `useUpdateProject`, `useOnboardingConfig`.
- **UI components**: `PageHeader`, `Badge`, `PageSpinner`, `ActionIcons`, `DragDropContext`/`Droppable`/`Draggable`.
- **Routing**: `useNavigate` for navigation from board cards and drawer items.
- **Auth context**: `useAuth` for role‑based filter visibility.
- **Constants**: `FASE_LABELS` for onboarding phase names.

## Integration Points
- **Clients** – projects reference a `client_id`; client data is displayed on cards and used for filtering.
- **Onboardings** – onboarding projects link to onboarding records; capability chips and kickoff dates interact with onboarding flows.
- **Profiles** – CSM/responsible selection pulls from user profiles; role checks determine filter availability.
- **Catalog** – capability chips are built from catalog items (`servico`, `solucao`).
- **Audit Logs** – All actions (created, activated, advanced, reopened, updated) are logged to `audit_logs` table with `entity_type='onboarding_fase'` or `'onboarding_activity'`, `action`, `user_id`, `user_name`.

## Main User Flows
### Flow: View project board
1. User navigates to **/projetos**.
2. `ProjectsPage` loads all data and displays status columns.
3. User can apply filters; the board updates accordingly.
4. Stats cards show aggregate counts; clicking a card opens a drawer with the matching items.

### Flow: Drag project to new status
1. User drags a project card from one column to another.
2. `onDragEnd` receives the source/destination IDs, updates local state, and calls `updateStatus.mutate`.
3. Board re‑renders with the project in its new column.

### Flow: Create new project
1. User clicks **+ Novo Projeto** – `showModal` becomes `true`.
2. `ProjectModal` opens (global mode if no `clientId` prop). User selects a client via combobox, sets type, fills form fields, selects capabilities (if onboarding/expansao), and clicks **Salvar projeto**.
3. Modal calls the appropriate mutation (`createInternalProject` or `createOnboardingFlow`).
4. On success, modal closes and the board refreshes via the projects query.

### Flow: Complete a fase
1. User opens a fase via the timeline.
2. For non‑milestones: concludes if there's at least one completed activity.
3. For milestones: requires evidence or justification.
4. A toast shows with an action button to activate the next fase (optional).
5. The fase status becomes `concluida`.

### Flow: Go-Live completion
1. User concludes the Go-Live fase (a milestone).
2. System checks if `onboarding.context === 'implantacao_inicial'`.
3. If true, an automatic task is created to review the client's stage for migration to "Estabilização".

## State Management
- **Local state** (`useState`) for filter values, drawer key, modal visibility, and a local copy of projects (`local`).
- **React Query / custom hooks** manage server‑side data and expose loading flags (`isLoading`, mutation `isPending`).
- **Form state** inside `ProjectModal` (`form` object) holds field values; `type`, `caps` (selected capabilities), and combobox state are separate.
- **Derived data** (`useMemo`) for filtered lists and statistics ensures efficient recomputation.

## Error Handling
- UI disables the submit button while mutations are pending (`isPending`).
- Basic validation ensures required fields (`title`, client selection, capabilities for onboarding/expansao).
- Toast notifications show success or error messages.

## Performance Considerations
- Data fetching uses parallel hooks; large datasets may benefit from pagination (not implemented).
- Drag‑and‑drop updates local state optimistically before server response, providing immediate UI feedback.
- `useMemo` is used heavily to avoid unnecessary recomputation of filters and stats.

## Known Risks
- No pagination on the board; many projects could degrade performance.
- Filtering and search are performed client‑side on the full project list.
- Mutation errors are not surfaced to the user with explicit toast (relies on react-hot-toast).

## Future Improvements
- Add server‑side pagination / infinite scroll for the project board.
- Implement explicit error toast/notification on mutation failures.
- Refactor filter logic into a reusable hook.
- Extract the large modal UI into smaller subcomponents.
