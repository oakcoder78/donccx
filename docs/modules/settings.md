# Module — Settings

## Purpose
The Settings module is the administrative hub of the application. It centralises configuration and management screens that control how the system behaves and integrates with external services.

- **What is managed** – user accounts, health‑score parameters, catalog data, segment definitions, stage definitions, feature flags, integration credentials (Freshdesk, DONC API, Donkie, AI), and audit logs.  
- **Who uses it** – administrators, managers and, for a limited set of screens, regular users with permission to edit their own profile.  
- **Why it matters** – these settings determine access control, data‑driven scoring, external workflow triggers and overall system stability; incorrect configuration can break core business processes.

## Responsibilities
- **User management** – create, edit, delete users and assign roles.  
- **Segment & stage management** – define business segments and workflow stages used throughout the platform.  
- **Health‑Score configuration** – set thresholds, dimension weights and stage‑specific weighting rules.  
- **Integration configuration** – store and edit credentials / settings for Freshdesk, DONC API, Donkie, and AI services.  
- **Feature‑flag control** – enable or disable optional functionality at runtime.  
- **Catalog configuration** – manage catalogue‑related data used by other parts of the app.  
- **Audit‑log viewing** – expose system‑wide activity logs to privileged users.  
- **Personal account settings** – let the logged‑in user modify their own profile.

## Module Structure
| File | Role |
|------|------|
| **SettingsPage.jsx** | Root component; renders the sidebar menu and the selected sub‑module. |
| **SettingsHealth.jsx** | UI for health‑score thresholds, dimension weights per stage, and rule editing. |
| **SettingsCatalog.jsx** | UI for managing catalogue entities. |
| **SettingsSegments.jsx** | UI for creating and editing business segments. |
| **SettingsStages.jsx** | UI for defining workflow stages. |
| **SettingsUsers.jsx** | UI for admin‑level user management (list, edit, role assignment). |
| **SettingsLogs.jsx** | UI for privileged audit‑log inspection. |
| **SettingsFreshdesk.jsx** | UI for configuring Freshdesk integration credentials and options. |
| **SettingsFaseTypes.jsx** | UI for managing onboarding phase types. |
| **SettingsActivityTypes.jsx** | UI for managing onboarding activity types. |
| **SettingsProjectTemplates.jsx** | UI for managing project templates with phases and activities. |
| **SettingsAI.jsx** | UI for AI + Donkie configuration, consolidated into 4 sections: Models+Debug, WhatsApp Prompt, Donkie config, Email Prompt. Accessed via "Donkie IA" menu entry. |
| **SettingsDoncAPI.jsx** | UI for configuring the DONC API integration (manager‑only). |
| **SettingsFeatureFlags.jsx** | UI for toggling feature flags across the system. |
| **UserEditModal.jsx** | UI for personal profile editing (name, gender, birth_date, phone, avatar). |

## UI Architecture
- **Layout** – a two‑column flex layout: a fixed‑width sidebar (`aside`) with navigation buttons and a main content area (`main`).
- **Sidebar** – generated from `BASE_MENU`; each entry contains an icon, label, and optional `adminOnly` / `managerOnly` flags. The menu is filtered at runtime based on the current user's permissions (`usePermissions`, `useAuth`).
- **Content Switching** – the `section` state (via `useState`) determines which sub‑component is rendered. Clicking a sidebar button updates this state, causing React to mount the corresponding Settings component.
- **Permission gating** – components that require higher privileges (`logs`, `freshdesk`, `donkie`, `ai`, `donc‑api`, `features`) are conditionally rendered only when the current user satisfies the required role (`isAdmin`, `isManager`).

### SettingsSectionHeader Pattern
All Settings pages now use a shared header component called `SettingsSectionHeader`. This component standardises:

- **icon** (left-aligned)
- **title** (required)
- **subtitle** (optional)
- **actions** (right-aligned)

**Visual rules:**
- subtitle uses `text-xs text-text-tertiary mt-1`
- icons use `w-4 h-4 text-donc-navy`
- actions must appear only inside the header
- manual page headers are deprecated

**Purpose:** Ensure UI consistency and reduce layout duplication across all Settings pages.

### Header Actions Placement
Primary actions must be placed in the header using the `actions` property. Examples:

- Invite User (SettingsUsers)
- Add Stage (SettingsStages)
- Add Segment (SettingsSegments)
- Add Template (SettingsProjectTemplates)

**Clarification:** Buttons should not be placed inside cards when they represent top-level actions. This pattern improves visibility and aligns with global Settings UI standards.

## Data Flow
1. **Loading** – individual sub‑modules fetch their own data using React Query (`useQuery`) or custom hooks (`useHealthConfig`, `useHealthConfigMutations`).
2. **Editing** – UI components maintain local edit state (`useState`) and enable input fields only when the user has the required role (`isAdmin`, `isManager`).
3. **Saving** – mutations (`useMutation`, direct Supabase calls) send updates to the backend. On success, React Query's `invalidateQueries` refreshes the cached data.
4. **Feedback** – toast notifications (`react-hot-toast`) inform the user of success or error.
5. **Persistence** – all writes go through Supabase tables (`health_dimension_weights`, etc.) or dedicated API endpoints defined elsewhere in the codebase.
   - `birth_date` field persisted alongside `gender`/`phone` in UserEditModal.jsx

## Dependencies
- **Hooks** – `usePermissions`, `useAuth`, `useHealthConfig`, `useHealthConfigMutations`, `useQuery`, `useMutation`, `useQueryClient`.
- **Libraries** – `@tanstack/react-query`, `react-hot-toast`, Supabase client (`supabaseClient.js`).
- **UI primitives** – shared components (`Button`, `Spinner`) from `src/components/ui`.
- **Icons** – `SettingsMenuIcons`, `HealthDimensionIcons`, `ActionIcons` from `src/lib/icons`.
- **Contexts** – `AuthContext` for user role information.

## Integration Points
- **Freshdesk** – credentials and routing settings stored via the `SettingsFreshdesk` component. The Mapping section is now displayed as a dedicated card inside the synchronization layout, replacing the previous tab-based navigation (Sync / Mapping).

### Freshdesk Mapping Refactor
The previous tab-based structure in SettingsFreshdesk was replaced with a unified card-based layout. Benefits include:
- Simplified navigation
- Reduced UI depth
- Improved consistency with other Settings pages
- **DONC API** – configuration handled in `SettingsDoncAPI` (manager‑only).
- **Donkie + AI** – consolidated into `SettingsAI` with 4 sections: Models+Debug, WhatsApp Prompt, Donkie config, Email Prompt. Menu entry "Donkie IA" gated by `ai` feature flag. `SettingsDonkie.jsx` deleted.
- **Health Score** – weights, thresholds and dimension rules persisted to Supabase tables.
- **Feature Flags** – toggles that affect runtime feature availability.

## Main User Flows
1. **Open Settings** – user clicks the Settings icon; `SettingsPage` loads and shows the sidebar.
2. **Navigate** – user selects a menu item; `section` state updates and the corresponding sub‑module mounts.
3. **Edit Configuration** – user modifies inputs; component validates locally (e.g., weight sum = 100).
4. **Persist Changes** – user clicks *Save*; mutation sends data to Supabase; on success a toast appears and the query cache is invalidated.
5. **Permission Enforcement** – attempts to access admin‑only screens are hidden; non‑privileged users cannot see or interact with those UI elements.

## State Management
- **Local component state** – `useState` for form fields, active tabs, loading flags, etc.
- **React Query cache** – shared data fetched once per component (`useQuery`) and refreshed via `invalidateQueries`.
- **Context‑derived state** – `useAuth` provides `isAdmin` / `isManager`; `usePermissions` provides `canManageUsers`.
- **Props** – only the top‑level `SettingsPage` passes the selected `section` to child components; each child manages its own internal state.

## Known Risks
- **High coupling** – many settings share the same sidebar and permission logic; changes to menu filtering affect all sub‑modules.
- **Large component tree** – all settings are imported in `SettingsPage`, increasing bundle size even when only one section is used.
- **External dependency failure** – Freshdesk, DONC API, Donkie, and AI integrations rely on correct secret management; missing env vars will cause runtime errors.
- **Validation gaps** – some forms (e.g., weight inputs) rely on client‑side checks; server‑side validation is required to avoid inconsistent data.

## Future Improvements
- **Lazy‑load sub‑modules** – use `React.lazy` / `Suspense` to load only the selected settings component, reducing initial bundle size.
- **Centralised permission schema** – extract menu‑filter logic into a shared helper to avoid duplication.
- **Server‑side validation** – add Supabase Row‑Level Security policies and backend validation for health‑score weights and thresholds.
- **Feature‑flag UI** – integrate a remote feature‑flag service (e.g., LaunchDarkly) for real‑time toggling without redeploy.
- **Testing** – add component tests for each Settings screen and end‑to‑end permission checks.

## File Reference Map
- `src/components/settings/SettingsPage.jsx` – entry point, menu handling.
- `src/components/settings/SettingsSectionHeader.jsx` – shared header component for all Settings pages.
- `src/components/settings/SettingsHealth.jsx` – health‑score configuration UI.
- `src/components/settings/SettingsCatalog.jsx` – catalogue management UI.
- `src/components/settings/SettingsSegments.jsx` – segment management UI.
- `src/components/settings/SettingsStages.jsx` – stage management UI.
- `src/components/settings/SettingsUsers.jsx` – user‑management UI. Note: The "Invite User" action is now placed in the header actions area, aligning with global Settings UI standards.
- `src/components/settings/SettingsLogs.jsx` – audit‑log viewer UI.
- `src/components/settings/SettingsFreshdesk.jsx` – Freshdesk integration UI with unified card-based layout.
- `src/components/settings/SettingsAI.jsx` – AI + Donkie configuration UI (4 sections: Models+Debug, WhatsApp Prompt, Donkie, Email). `SettingsDonkie.jsx` deleted (merged here).
- `src/components/settings/SettingsDoncAPI.jsx` – DONC API configuration UI.
- `src/components/settings/SettingsFeatureFlags.jsx` – feature‑flag toggles UI.
- `src/components/settings/SettingsFaseTypes.jsx` – onboarding phase types UI. Table columns: Nome, Descrição, Marco, Req. Evidência, Permite Anexos, Ordem, Ativo, Ações.
- `src/components/settings/SettingsActivityTypes.jsx` – onboarding activity types UI.
- `src/components/settings/SettingsProjectTemplates.jsx` – project templates UI.
