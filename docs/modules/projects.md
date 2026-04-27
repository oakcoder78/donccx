# Module — Projects

## Purpose
The Projects module provides a Kanban‑style board for planning, tracking, and managing **project** records. Projects are linked to clients, have a type (interno, onboarding, expansao), status (planejado, em_andamento, concluído, suspenso), milestones, and may be associated with onboarding flows. The module lets users view project statistics, filter by client, CSM, type, and deadline, drag‑and‑drop projects between status columns, and create or edit projects via a modal dialog.

## Responsibilities
- Display a board with columns for each project status.
- Provide filtering controls (client search, CSM, type, deadline).
- Show summary cards with counts for active, blocked, attention, overdue, and completed projects.
- Allow drag‑and‑drop to change a project’s status.
- Persist status changes via `useUpdateProjectStatus` mutation.
- Open **ProjectModal** for creating a new project or editing an existing one.
- Load required reference data (clients, profiles/CSMs, onboarding configurations, catalog items).
- Compute and display statistical drawers (active, blocked, etc.) on demand.

## Module Structure
| File | Responsibility / UI role |
|------|--------------------------|
| `ProjectsPage.jsx` | Main page component: loads projects, onboardings, clients, profiles; renders filter bar, stats cards, Kanban board with drag‑and‑drop; opens the `ProjectModal`. |
| `ProjectModal.jsx` | Modal dialog for creating or editing a project. Handles form state, client selection (combobox for global create), project type selection, capability (capabilities) selection for onboarding/expansao projects, and submission via appropriate mutation hooks. |

## UI Architecture
- **ProjectsPage** renders a `PageHeader` with a “+ Novo Projeto” button that toggles `ProjectModal`.
- **Stats cards** (`StatCard`) display counts for various derived groups; clicking a card opens a `StatsDrawer` showing the underlying items.
- **Filter bar** provides a searchable client dropdown, CSM selector (admin/manager only), type selector, and deadline selector; filters are applied via a `useMemo` derived list.
- **Kanban board** uses `@hello-pangea/dnd` (`DragDropContext`, `Droppable`, `Draggable`). Each column corresponds to a project status defined in `COLUMNS`. Projects are draggable; on drop, `onDragEnd` updates local state and triggers `updateStatus.mutate`.
- **ProjectModal** contains two layout modes:
  - **Global create** (no clientId) – shows a combobox to select a client.
  - **Contextual** (clientId supplied or editing) – shows a pill with the current client.
  - Form fields: type (segmented control), title, description/notes, responsible (CSM), start/end dates, status, and for onboarding/expansao projects, capability chip selection, kickoff date, and phase info.
- Inline CSS is injected via `MODAL_CSS` for pseudo‑classes; the rest of the UI uses Tailwind‑based utility classes.

## Data Flow
1. **Initial data loading** – `useAllProjects`, `useAllOnboardings`, `useClients`, `useProfiles`, `useCatalogItems`, `useOnboardingConfig` fetch data in parallel.
2. **Filtering** – `useMemo` builds `filtered` based on selected client, CSM, type, and deadline criteria.
3. **Stats calculation** – Additional `useMemo` hooks compute subsets for active, blocked, attention, overdue, and month‑concluded projects.
4. **Drag‑and‑drop** – `onDragEnd` updates the local copy of projects (`setLocal`) and calls `updateStatus.mutate({ id, status })` to persist the change.
5. **Create / Edit** – `ProjectModal` prepares the form state (pre‑filled for edit). On submit, it calls one of:
   - `createInternalProject.mutateAsync` for internal projects.
   - `createOnboardingFlow.mutateAsync` for onboarding/expansao projects.
   - `updateProject.mutateAsync` for editing internal projects.
   - `updateOnboardingFlow.mutateAsync` for editing onboarding/expansao projects.
   The modal resets and closes after the mutation resolves.

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
- **Auth** – manager/admin roles affect visibility of CSM filter and global client selection.

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

### Flow: Edit existing project
1. User clicks a project card – navigation to `/projetos/:id` (outside this module) may later open the modal; alternatively, edit could be triggered from another UI (not shown).
2. `ProjectModal` receives `project` prop; it pre‑populates fields, disables client selection, and shows read‑only type label.
3. User modifies fields and presses **Salvar alterações**.
4. Modal calls `updateProject` or `updateOnboardingFlow` depending on project type, then closes.

## State Management
- **Local state** (`useState`) for filter values, drawer key, modal visibility, and a local copy of projects (`local`).
- **React Query / custom hooks** manage server‑side data and expose loading flags (`isLoading`, mutation `isPending`).
- **Form state** inside `ProjectModal` (`form` object) holds field values; `type`, `caps` (selected capabilities), and combobox state are separate.
- **Derived data** (`useMemo`) for filtered lists and statistics ensures efficient recomputation.

## Error Handling
- UI disables the submit button while mutations are pending (`isPending`).
- Basic validation ensures required fields (`title`, client selection, capabilities for onboarding/expansao). Errors from mutations are not explicitly displayed in the code; they would surface via React Query’s error handling (not shown).
- No explicit try/catch around mutation calls; any promise rejection would be handled by the hook’s internal error handling.

## Performance Considerations
- Data fetching uses parallel hooks; large datasets may benefit from pagination (not implemented).
- Drag‑and‑drop updates local state optimistically before server response, providing immediate UI feedback.
- `useMemo` is used heavily to avoid unnecessary recomputation of filters and stats.
- The modal renders a large number of catalog items; suggestions are limited to 10 items to keep the combobox responsive.

## Known Risks
- No pagination on the board; many projects could degrade performance.
- Filtering and search are performed client‑side on the full project list, which may become heavy.
- Mutation errors are not surfaced to the user; failures could leave the UI in an inconsistent state.
- Capability selection does not enforce uniqueness beyond array contains; rapid toggling could cause race conditions.
- Role‑based UI (admin/manager) relies on `useAuth`; if auth context is incorrect, filters may be incorrectly displayed.

## Future Improvements
- Add server‑side pagination / infinite scroll for the project board.
- Implement explicit error toast/notification on mutation failures.
- Refactor filter logic into a reusable hook to share across modules.
- Extract the large modal UI into smaller subcomponents for readability and testability.
- Add optimistic UI rollback on mutation failure for drag‑and‑drop status changes.
- Provide bulk actions (e.g., move multiple projects at once).

## File Reference Map
- `src/components/projects/ProjectsPage.jsx`
- `src/components/projects/ProjectModal.jsx`
