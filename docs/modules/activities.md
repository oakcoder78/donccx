# Module — Activities

## Purpose
The Activities module provides a task‑oriented workspace where users can create, view, edit, and track **activities** (e.g., meetings, calls, emails, tasks, notes). An activity represents a single work item linked to a client, contact, and responsible profile. Activities appear in the main **Atividades** page, can be filtered by type, status, client, or responsible, and are displayed in a list grouped by pending items and completed items grouped by month.

## Responsibilities
- List all activities with filtering and search.
- Group pending activities and completed activities by month.
- Open a modal to **create** a new activity.
- Open a modal to **view/edit** an existing activity.
- Persist activity data (create, update, delete) via Supabase mutation hooks.
- Manage activity attachments (upload, preview, download, soft‑delete).
- Display status badges (pendente, concluída, atrasada) and attachment counters.

## Module Structure
| File | Responsibility / UI role |
|------|--------------------------|
| `ActivitiesPage.jsx` | Page component that fetches activities, clients, and profiles; provides filtering UI; renders activity list; opens creation and detail modals. |
| `ActivityModal.jsx` | Modal dialog for **creating** or **editing** an activity. Handles form state, validation, submission, and attachment upload. |
| `ActivityDetailModal.jsx` | Modal dialog for **viewing** activity details, toggling status, deleting the activity, and managing attachments (preview, download, soft‑delete). Also allows switching to edit mode via `ActivityModal`. |

## UI Architecture
- **ActivitiesPage** renders the page header, a search input, tab bar (type filters), and dropdown filters for client and responsible. Below it displays:
  - A section for pending activities.
  - Sections for completed activities grouped by month.
  - Each activity row is rendered by the internal `ActivityItem` component.
- Clicking an activity row opens **ActivityDetailModal**.
- Clicking “+ Nova Atividade” opens **ActivityModal** for creation.
- Within **ActivityDetailModal**, the *Edit* button swaps the view to **ActivityModal** (edit mode).
- Attachment management UI lives inside both modals (upload via `AttachmentInput` in the create/edit modal; preview/download/delete in the detail modal).

## Data Flow
1. **Fetching** – `useActivities()` loads all activities; `useClients()` and `useProfiles()` load supporting data for filters and selects.
2. **Filtering** – `useMemo` derives a filtered list based on selected tab, search term, status, client, and responsible filters.
3. **Grouping** – Pending activities are displayed directly; completed activities are grouped by month using `groupByMonth` and formatted with `formatMonth`.
4. **Create/Edit** – `ActivityModal` builds a payload from local form state and calls `create.mutateAsync` or `update.mutateAsync` from `useActivityMutations`. After the mutation, any selected attachment files are uploaded via `saveActivityAttachments`. The modal then closes and the parent page refetches the activities (handled by the mutation hook’s query invalidation).
5. **View** – `ActivityDetailModal` receives the selected activity as a prop, loads its attachments with `getActivityAttachments`, and displays full details.
6. **Status toggle** – Clicking the *Concluir/Reabrir* button calls `update.mutateAsync` to flip `status` and closes the modal.
7. **Delete** – Clicking *Excluir* invokes `remove.mutateAsync` from the mutation hook and closes the modal.
8. **Attachment actions** – Preview/download use Supabase storage signed URLs; delete uses `softDeleteActivityAttachment` after permission checks.

## Dependencies
- **Hooks**: `useActivities`, `useActivityMutations`, `useClients`, `useProfiles`, `useContacts`.
- **Services**: `saveActivityAttachments`, `getActivityAttachments`, `softDeleteActivityAttachment`.
- **UI Components**: `Modal`, `Button`, `Badge`, `PageHeader`, `PageSpinner`, `AttachmentInput`.
- **Icons**: `ActivityIcons`, `ActivityIconBackgrounds`, `DefaultActivityIcon`, `ActionIcons` (search/attachment), plus Lucide icons used in the detail modal.
- **Supabase client** (`supabase`) for storage and auth calls.
- **Toast** (`react-hot-toast`) for user feedback on attachment deletion.

## Integration Points
- **Clients** – activities reference a `client_id`; client list is used for filtering and selection.
- **Contacts** – activities may be linked to a contact (`contact_id`). Contact data is loaded based on the selected client.
- **Profiles** – responsible user (`responsible_id`) is selected from profiles; permissions for attachment deletion depend on the current profile.
- **Supabase Storage** – attachment files are stored and retrieved via Supabase storage buckets.

## Main User Flows
### Flow: Criar atividade
1. User clicks **+ Nova Atividade** button on `ActivitiesPage`.
2. `ActivityModal` opens in create mode.
3. User fills required fields (type, date, title/description, client, etc.) and optionally adds attachments.
4. User clicks **Criar Atividade**.
5. `create.mutateAsync` sends payload to Supabase; on success, any attachments are uploaded via `saveActivityAttachments`.
6. Modal closes; activities list refreshes to include the new entry.

### Flow: Visualizar atividade
1. User clicks an activity row (`ActivityItem`).
2. `ActivityDetailModal` opens, showing full description, meta information, status badge, and attachment list.
3. User can preview/download attachments or toggle status.

### Flow: Editar atividade
1. While in `ActivityDetailModal`, user clicks **✏ Editar**.
2. `ActivityModal` re‑opens with the activity data pre‑filled (`isEdit = true`).
3. User modifies fields and optionally changes attachments.
4. On submit, `update.mutateAsync` updates the record; new attachments are uploaded.
5. Modal closes and the activities list updates.

### Flow: Excluir atividade
1. In `ActivityDetailModal`, user clicks **Excluir**.
2. Confirmation dialog appears; on confirm, `remove.mutateAsync` deletes the activity.
3. Modal closes; list refreshes.

### Flow: Gerenciar anexos (detail view)
1. User clicks **Visualizar** (eye) on an attachment – image previews open in a full‑screen overlay; other files open in a new tab.
2. User clicks **Download** – a signed URL is generated and the file is forced downloaded.
3. User clicks **Excluir** – permission check (owner or admin) is performed; on success `softDeleteActivityAttachment` removes the record and UI list updates.

## State Management
- **Local component state** (`useState`) for UI flags: active tab, search term, filter selections, modal visibility, selected activity, form fields, attachment files, preview URL.
- **React Query / custom hooks** (`useActivities`, `useActivityMutations`, etc.) manage server‑side data, expose `isLoading`, `isPending`, and provide automatic cache invalidation after mutations.
- **Props** – `ActivitiesPage` passes `onClose` callbacks and selected activity objects to the modals.

## Error Handling
- Form fields marked `required` (date, description, client) enforce client‑side validation.
- Mutation hooks expose `isPending` and error states; UI disables buttons while pending.
- Attachment upload errors are logged to console; no explicit UI error shown.
- Permission errors for attachment deletion are shown via `toast.error`.
- Supabase auth loading errors are logged; UI does not block.

## Performance Considerations
- Activity list rendering is straightforward; large datasets could cause long render times – pagination or virtual scrolling is not implemented.
- Filters are recomputed with `useMemo`, reducing unnecessary work on each render.
- Each modal loads attachments separately (detail modal) which may cause extra network calls; could be lazily loaded only when the attachment section is expanded.
- Multiple independent queries (`useActivities`, `useClients`, `useProfiles`, `useContacts`) run in parallel.

## Known Risks
- No pagination → UI may become sluggish with many activities.
- Attachment permission check relies on `profile` being loaded; race conditions could allow unauthorized deletions if the profile is undefined.
- Deleting an activity does not confirm that related attachments are also cleaned up (soft delete only for attachments).
- Hard‑coded type list (`TYPES`) may become out‑of‑sync with backend if new activity types are added.
- Direct `window.confirm` calls block UI and are not customizable.

## Future Improvements
- Implement pagination or infinite scroll for the activities list.
- Add a dedicated error UI for mutation failures (e.g., toast notifications on create/update errors).
- Centralize permission logic for attachment actions in a reusable hook.
- Extract `ActivityItem` into its own component file for better testability.
- Lazy‑load attachment data only when the attachments section is expanded.
- Use a global auth context instead of fetching the user inside the detail modal.
- Introduce TypeScript typings for activity payloads and hook responses.

## File Reference Map
- `src/components/activities/ActivitiesPage.jsx`
- `src/components/activities/ActivityModal.jsx`
- `src/components/activities/ActivityDetailModal.jsx`
