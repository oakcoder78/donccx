# Module — Hooks

## Purpose
Custom hooks encapsulate data access, backend integration, reusable logic. Decouple UI from Supabase, services, config. Centralize fetch/mutate, provide consistent API.

## Responsibilities
- Encapsulate Supabase queries/mutations.
- Provide reusable state (loading, error) via react‑query.
- Centralize service calls (catalog, health, permissions).
- Standardize cache invalidation, toast feedback.

## Module Structure
- `useActivities.js` — fetch, create, update, delete activities.
- `useAuditLog.js` — read audit log entries.
- `useCatalog.js` — fetch static catalog tables.
- `useClient.js` — single client CRUD. Fetches extended client data including operational, health, catalog, onboarding, and activity data. Not all fetched data is always displayed; some modules depend on lifecycle_stage to determine whether data should be used.
- `useClientReports.js` — fetch reports for a client.
- `useClients.js` — list clients with optional filters.
- `useContacts.js` — list contacts, manage contact links.
- `useDonkie.jsx` — integrate with external Donkie service.
- `useFeatureFlags.js` — load feature‑flag configuration.
- `useHealthConfig.js` — retrieve health‑score dimensions & weights.
- `useHealthScore.js` — compute health score, expose recalc mutation.
- `useMilestones.js` — fetch milestones, create/update operations.
- `useModulePricing.js` — obtain pricing data per module.
- `useOnboardings.js` — list onboarding steps and status.
- `usePermissions.js` — load user‑permission matrix.
- `useProfiles.js` — fetch profile list, current user profile.
- `useProjects.js` — CRUD operations for projects.
- `useSegments.js` — retrieve segmentation rules.
- `useStages.js` — fetch workflow stages.

## Data Flow
Hooks use `useQuery` for reads, `useMutation` for writes. Query keys combine entity name + filter objects → react‑query cache. Mutations call Supabase (`insert`, `update`, `delete`), then invalidate related query keys via `queryClient.invalidateQueries`. Each hook returns `{data, isLoading, isError}` plus mutation functions when applicable.

## Dependencies
- `../lib/supabaseClient` – Supabase client instance.
- `@tanstack/react-query` – query/mutation cache handling.
- `react-hot-toast` – user notifications on success/error.
- Additional utility modules (`../lib/*`) for date sanitization, config parsing.

## Integration Points
- UI pages (`Dashboard.jsx`, `AtendimentoPage.jsx`, `ProjectModal.jsx`, etc.) import hooks for data.
- Service modules (`services/*`) may reuse hook logic for server‑side operations.
- `AuthContext` supplies auth token used implicitly by Supabase client.

## Main Usage Patterns
```js
const {data, isLoading}=useActivities(filter);
const {create}=useActivityMutations();
create(payload);
```
Hooks expose reactive data; component re‑renders on cache updates.

## State Management
Internal react‑query cache stores fetched rows. Loading and error flags derived from query state. Mutations trigger toast feedback and cache invalidation on success.

## Lifecycle-Aware Client Data
Client lifecycle_stage determines which modules are relevant. Example behaviors: clients in early lifecycle stages (e.g., lead or prospect) may not use operational metrics, health score calculations, or advanced reporting data. This prevents displaying irrelevant information for non-active clients and improves clarity of early-stage records.

### Conditional Rendering Based on Lifecycle
UI components may hide certain blocks based on lifecycle_stage. Examples: operational sections, health score components, financial metrics. Hooks continue to fetch full datasets, but UI controls visibility. This keeps backend logic consistent while improving frontend clarity.

## Known Risks
- Manual cache invalidation may miss dependent keys → stale UI.
- Direct Supabase calls spread across many hooks → tight coupling, testing difficulty.
- Error handling limited to toast; no centralized strategy.
- Date‑sanitization logic duplicated in several hooks.

## Future Improvements
- Consolidate common Supabase wrapper (error handling, toast) into shared utility.
- Add TypeScript typings or PropTypes for hook payloads.
- Implement batch invalidation helper to reduce repetition.
- Introduce retry/backoff for flaky queries.
- Expose feature‑flag data via React context for global access.

## File Reference Map
- `src/hooks/useActivities.js`
- `src/hooks/useAuditLog.js`
- `src/hooks/useCatalog.js`
- `src/hooks/useClient.js`
- `src/hooks/useClientReports.js`
- `src/hooks/useClients.js`
- `src/hooks/useContacts.js`
- `src/hooks/useDonkie.jsx`
- `src/hooks/useFeatureFlags.js`
- `src/hooks/useHealthConfig.js`
- `src/hooks/useHealthScore.js`
- `src/hooks/useMilestones.js`
- `src/hooks/useModulePricing.js`
- `src/hooks/useOnboardings.js`
- `src/hooks/usePermissions.js`
- `src/hooks/useProfiles.js`
- `src/hooks/useProjects.js`
- `src/hooks/useSegments.js`
- `src/hooks/useStages.js`
